import mongoose from "mongoose";
import { AppError } from "../../errors/appError";
import type { CheckinResponse, CreateCheckinBody } from "../../schemas/checkin.js";
import { checkinResponseSchema } from "../../schemas/checkin.js";
import type { PlaceDocument } from "../../schemas/place.js";
import type { UserDocument } from "../../schemas/user.js";
import { getCheckinRadiusMeters } from "../../config/env";
import { applyItineraryProgressFromCheckin } from "../../events/triggers/itinerary-progress.js";
import { CheckinModel } from "../../models/checkin.model";
import { UserModel } from "../../models/user.model";
import { assertWithinCheckinRadius } from "../../utils/geofence";
import { placeRepository } from "../places/place.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { checkInRepository } from "./checkin.repository";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "checkin", layer: "service" });

function parseStoredCheckinResponse(payload: Record<string, unknown>): CheckinResponse | null {
    const parsed = checkinResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
}

export const checkInService = {
    async checkIn(userId: string, body: CreateCheckinBody): Promise<CheckinResponse> {
        const context = { userId, placeId: body.placeId, clientMutationId: body.clientMutationId };
        log.info(context, "Checking in user at place");

        const existingSync = await syncMutationRepository.findByClientMutationId(
            body.clientMutationId,
        );
        if (existingSync?.resultStatus === "accepted") {
            const cached = parseStoredCheckinResponse(existingSync.resultPayload as Record<string, unknown>);
            if (cached) {
                log.info(context, "Check-in already accepted for this mutation, returning cached response");
                return cached;
            }
            log.info(context, "Check-in already accepted for this mutation, skipping (legacy payload)");
            return buildLegacyReplayResponse(body.placeId);
        }

        const place = await placeRepository.findByPlaceId(body.placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }
        if (await checkInRepository.getCheckInByUserAndPlace(body.placeId, userId)) {
            throw new AppError("User has already checked in at this place", 409);
        }

        assertWithinCheckinRadius(place, body.coordinates, getCheckinRadiusMeters());

        const now = new Date();
        const session = await mongoose.startSession();

        try {
            let response: CheckinResponse | undefined;

            await session.withTransaction(async () => {
                response = await applyCheckinInTransaction(userId, body, place, now, session);
            });

            if (!response) {
                throw new AppError("Check-in failed", 500);
            }

            log.info(context, "Check-in registered successfully");
            return response;
        } catch (error: unknown) {
            if (isDuplicateKeyError(error)) {
                log.warn(context, "Duplicate check-in rejected by unique index (concurrent request)");
                throw new AppError("User has already checked in at this place", 409);
            }
            throw error;
        } finally {
            await session.endSession();
        }
    },

    async getCheckInByUserAndPlace(placeId: string, userId: string) {
        log.info({ userId, placeId }, "Fetching check-in for user and place");
        return checkInRepository.getCheckInByUserAndPlace(placeId, userId);
    },
};

async function applyCheckinInTransaction(
    userId: string,
    body: CreateCheckinBody,
    place: PlaceDocument,
    now: Date,
    session: mongoose.ClientSession,
): Promise<CheckinResponse> {
    const [checkin] = await CheckinModel.create(
        [{
            placeId: body.placeId,
            userId,
            datetime: body.datetime,
            serverReceivedAt: now,
            clientMutationId: body.clientMutationId,
            stampIdGranted: place.zanzar.stampId,
            ...(body.coordinates ? { coordinates: body.coordinates } : {}),
        }],
        { session },
    );
    const checkinId = checkin._id;

    const userLean = await UserModel.findById(userId).session(session).lean<UserDocument>();
    if (!userLean) {
        throw new AppError("User not found", 404);
    }

    const isNewStamp = !userLean.stamps.some((stamp) => stamp.stampId === place.zanzar.stampId);
    const userDoc: UserDocument = structuredClone(userLean) as UserDocument;

    userDoc.checkInCount += 1;
    userDoc.stamps.push({
        stampId: place.zanzar.stampId,
        stampType: place.zanzar.category,
        placeId: place.place_id,
        placeName: place.name,
        checkinId: checkinId.toString(),
        datetime: body.datetime,
    });

    const { itineraryCompleted, itineraryProgress } = applyItineraryProgressFromCheckin(
        userDoc,
        place,
        body.datetime,
        now,
    );

    await UserModel.updateOne(
        { _id: userId },
        {
            $set: {
                checkInCount: userDoc.checkInCount,
                stamps: userDoc.stamps,
                activeItinerary: userDoc.activeItinerary,
                completedItineraries: userDoc.completedItineraries,
                updatedAt: now,
            },
        },
        { session },
    );

    await placeRepository.incrementCheckInCount(body.placeId, session);

    const response: CheckinResponse = {
        stampIdGranted: place.zanzar.stampId,
        isNewStamp,
        itineraryProgress,
        isItineraryCompleted: itineraryCompleted,
    };

    await syncMutationRepository.record(
        {
            clientMutationId: body.clientMutationId,
            userId,
            mutationType: "checkin",
            resultStatus: "accepted",
            resultPayload: { ...response, checkinId: checkinId.toString() },
            processedAt: now,
        },
        session,
    );

    return response;
}

async function buildLegacyReplayResponse(placeId: string): Promise<CheckinResponse> {
    const place = await placeRepository.findByPlaceId(placeId);
    if (!place) {
        throw new AppError("Place not found", 404);
    }

    return {
        stampIdGranted: place.zanzar.stampId,
        isNewStamp: false,
        itineraryProgress: null,
        isItineraryCompleted: false,
    };
}
