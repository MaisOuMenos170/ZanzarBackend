import mongoose from "mongoose";
import { AppError } from "../../errors/appError";
import type { CheckinResponse, CreateCheckinBody } from "../../schemas/checkin.js";
import { checkinResponseSchema } from "../../schemas/checkin.js";
import { stampIdSchema } from "../../schemas/stamp-id.js";
import type { PlaceDocument } from "../../schemas/place.js";
import type { UserDocument } from "../../schemas/user.js";
import { getCheckinRadiusMeters } from "../../config/env";
import {
    applyItineraryProgressFromCheckin,
    replayItineraryFromUserState,
} from "../../events/triggers/itinerary-progress.js";
import { CheckinModel } from "../../models/checkin.model";
import { UserModel } from "../../models/user.model";
import { assertWithinCheckinRadius } from "../../utils/geofence";
import { placeRepository } from "../places/place.repository";
import { syncMutationRepository } from "../sync/sync-mutation.repository";
import { checkInRepository } from "./checkin.repository";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "checkin", layer: "service" });

type SyncMutationRecord = NonNullable<
    Awaited<ReturnType<typeof syncMutationRepository.findByClientMutationId>>
>;

type ExistingCheckin = NonNullable<
    Awaited<ReturnType<typeof checkInRepository.getCheckInByUserAndPlace>>
>;

function parseStoredCheckinResponse(payload: Record<string, unknown>): CheckinResponse | null {
    const parsed = checkinResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
}

function assertAcceptedSyncMutationOwnership(
    sync: SyncMutationRecord,
    userId: string,
    placeId: string,
): void {
    if (sync.userId.toString() !== userId) {
        throw new AppError("Forbidden", 403);
    }

    const payloadPlaceId = sync.resultPayload?.placeId;
    if (typeof payloadPlaceId === "string" && payloadPlaceId !== placeId) {
        throw new AppError("Mutation payload does not match request", 409);
    }
}

function computeIsNewStamp(
    user: UserDocument,
    stampIdGranted: string,
    checkinId: string | undefined,
): boolean {
    const stampsWithId = user.stamps.filter((stamp) => stamp.stampId === stampIdGranted);
    if (stampsWithId.length === 0) {
        return true;
    }
    if (!checkinId) {
        return stampsWithId.length === 1;
    }

    const firstStamp = stampsWithId.reduce((earliest, stamp) =>
        stamp.datetime < earliest.datetime ? stamp : earliest,
    );
    return firstStamp.checkinId === checkinId;
}

async function buildReplayResponseFromExistingState(
    userId: string,
    placeId: string,
    checkin?: ExistingCheckin,
    legacyPayload?: Record<string, unknown>,
): Promise<CheckinResponse> {
    const place = await placeRepository.findByPlaceId(placeId);
    if (!place) {
        throw new AppError("Place not found", 404);
    }

    const existingCheckin =
        checkin ?? (await checkInRepository.getCheckInByUserAndPlace(placeId, userId));
    if (!existingCheckin) {
        throw new AppError("Check-in not found", 404);
    }

    const checkinId =
        existingCheckin._id?.toString() ??
        (typeof legacyPayload?.checkinId === "string" ? legacyPayload.checkinId : undefined);

    const user = await UserModel.findById(userId).lean<UserDocument>();
    if (!user) {
        throw new AppError("User not found", 404);
    }

    const stampIdGranted = stampIdSchema.parse(
        existingCheckin.stampIdGranted ??
            (typeof legacyPayload?.stampId === "string"
                ? legacyPayload.stampId
                : place.zanzar.stampId),
    );
    const itineraryReplay = replayItineraryFromUserState(user, placeId, existingCheckin.datetime);

    return {
        stampIdGranted,
        isNewStamp: computeIsNewStamp(user, stampIdGranted, checkinId),
        itineraryProgress: itineraryReplay.itineraryProgress,
        isItineraryCompleted: itineraryReplay.itineraryCompleted,
    };
}

async function resolveAcceptedSyncReplay(
    userId: string,
    body: CreateCheckinBody,
): Promise<CheckinResponse | null> {
    const existingSync = await syncMutationRepository.findByClientMutationId(body.clientMutationId);
    if (existingSync?.resultStatus !== "accepted") {
        return null;
    }

    assertAcceptedSyncMutationOwnership(existingSync, userId, body.placeId);

    const cached = parseStoredCheckinResponse(existingSync.resultPayload as Record<string, unknown>);
    if (cached) {
        return cached;
    }

    return buildReplayResponseFromExistingState(
        userId,
        body.placeId,
        undefined,
        existingSync.resultPayload as Record<string, unknown>,
    );
}

async function resolveExistingCheckinReplay(
    userId: string,
    body: CreateCheckinBody,
    existingCheckin: ExistingCheckin,
): Promise<CheckinResponse | null> {
    if (existingCheckin.clientMutationId !== body.clientMutationId) {
        return null;
    }

    const syncReplay = await resolveAcceptedSyncReplay(userId, body);
    if (syncReplay) {
        return syncReplay;
    }

    return buildReplayResponseFromExistingState(userId, body.placeId, existingCheckin);
}

export const checkInService = {
    async checkIn(userId: string, body: CreateCheckinBody): Promise<CheckinResponse> {
        const context = { userId, placeId: body.placeId, clientMutationId: body.clientMutationId };
        log.info(context, "Checking in user at place");

        const syncReplay = await resolveAcceptedSyncReplay(userId, body);
        if (syncReplay) {
            log.info(context, "Check-in already accepted for this mutation, returning cached response");
            return syncReplay;
        }

        const place = await placeRepository.findByPlaceId(body.placeId);
        if (!place) {
            throw new AppError("Place not found", 404);
        }

        const existingCheckin = await checkInRepository.getCheckInByUserAndPlace(body.placeId, userId);
        if (existingCheckin) {
            const replay = await resolveExistingCheckinReplay(userId, body, existingCheckin);
            if (replay) {
                log.info(context, "Existing check-in matches mutation id, returning replay response");
                return replay;
            }

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
                const syncReplay = await resolveAcceptedSyncReplay(userId, body);
                if (syncReplay) {
                    log.info(
                        context,
                        "Duplicate key resolved as idempotent replay (concurrent request)",
                    );
                    return syncReplay;
                }

                const existingCheckin = await checkInRepository.getCheckInByUserAndPlace(
                    body.placeId,
                    userId,
                );
                if (existingCheckin) {
                    const checkinReplay = await resolveExistingCheckinReplay(
                        userId,
                        body,
                        existingCheckin,
                    );
                    if (checkinReplay) {
                        log.info(
                            context,
                            "Duplicate key resolved from existing check-in (concurrent request)",
                        );
                        return checkinReplay;
                    }
                }

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
            resultPayload: { ...response, checkinId: checkinId.toString(), placeId: body.placeId },
            processedAt: now,
        },
        session,
    );

    return response;
}
