import { Types } from "mongoose";
import { UserModel, User } from "../../models/user.model";
import type { ItineraryRouteType } from "../../constants/itinerary-route-type";
import type { ZanzarCategory } from "../../constants/zanzar-categories";
import type { StampId } from "../../constants/zanzar-categories";
import type { ProfileSummary } from "../../schemas/user";
import { AppError } from "../../errors/appError";
import { CreateUserInput } from "./schema/createUserSchema";
import { hashPassword } from "../../utils/bcrypt";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "users", layer: "repository" });

export type ActiveItineraryPlaceContext =
    | { routeType: "fixed"; incompletePlaceIds: string[] }
    | { routeType: "free"; targetCategory: ZanzarCategory };

export type ActiveItineraryEmbedInput = {
    itineraryTemplateId: Types.ObjectId;
    slug: string;
    name: string;
    description: string;
    category: string;
    routeType: ItineraryRouteType;
    targetCategory?: ZanzarCategory;
    targetCount?: number;
    objectives: string[];
    startedAt: Date;
    places: {
        placeId?: string;
        isCompleted: boolean;
        datetime?: Date;
        stamp?: StampId;
    }[];
};

// Emails are PII, so lookups by email are logged without the address.
export const userRepository = {
    async findById(id: string): Promise<User | null> {
        log.debug({ userId: id }, "Fetching user by id");
        try {
            const user = await UserModel.findById(id).lean<User>();
            log.debug({ userId: id, found: !!user }, "Fetched user by id");
            return user;
        } catch (err) {
            log.error({ err, userId: id }, "Failed to fetch user by id");
            throw err;
        }
    },

    async findByEmail(email: string): Promise<User | null> {
        log.debug("Fetching user by email");
        try {
            const user = await UserModel.findOne({ email }).lean<User>();
            log.debug({ found: !!user }, "Fetched user by email");
            return user;
        } catch (err) {
            log.error({ err }, "Failed to fetch user by email");
            throw err;
        }
    },

    async findActiveItineraryPlaceContext(userId: string): Promise<ActiveItineraryPlaceContext | null> {
        const user = await UserModel.findById(userId).select("activeItinerary").lean<User>();
        const active = user?.activeItinerary;
        if (!active) {
            return null;
        }

        const hasOpenSlots = active.places.some((place) => !place.isCompleted);
        if (!hasOpenSlots) {
            return null;
        }

        if (active.routeType === "free") {
            if (!active.targetCategory) {
                return null;
            }
            return { routeType: "free", targetCategory: active.targetCategory };
        }

        return {
            routeType: "fixed",
            incompletePlaceIds: active.places
                .filter((place) => !place.isCompleted && place.placeId)
                .map((place) => place.placeId as string),
        };
    },

    async setActiveItinerary(
        userId: string,
        activeItinerary: ActiveItineraryEmbedInput,
    ): Promise<NonNullable<User["activeItinerary"]>> {
        log.debug({ userId }, "Setting active itinerary");
        try {
            const updated = await UserModel.findOneAndUpdate(
                { _id: userId, activeItinerary: null },
                { $set: { activeItinerary } },
                { new: true, lean: true, projection: { activeItinerary: 1 } },
            ).lean<Pick<User, "activeItinerary">>();

            if (!updated?.activeItinerary) {
                throw new AppError("User already has an active itinerary", 409);
            }

            log.debug({ userId }, "Set active itinerary");
            return updated.activeItinerary;
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, userId }, "Failed to set active itinerary");
            throw err;
        }
    },

    async abandonActiveItinerary(userId: string): Promise<void> {
        log.debug({ userId }, "Abandoning active itinerary");
        try {
            const result = await UserModel.updateOne(
                { _id: userId, activeItinerary: { $ne: null } },
                [
                    {
                        $set: {
                            inactiveItineraries: {
                                $concatArrays: [
                                    { $ifNull: ["$inactiveItineraries", []] },
                                    ["$activeItinerary"],
                                ],
                            },
                            activeItinerary: null,
                        },
                    },
                ],
            );
            if (result.matchedCount === 0) {
                throw new AppError("No active itinerary", 404);
            }
            log.debug({ userId }, "Abandoned active itinerary");
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, userId }, "Failed to abandon active itinerary");
            throw err;
        }
    },

    async findProfileSummaryById(userId: string): Promise<ProfileSummary | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }

        log.debug({ userId }, "Fetching profile summary");
        try {
            // $size keeps the stamps and itineraries arrays out of the response payload.
            const [summary] = await UserModel.aggregate<ProfileSummary>([
                { $match: { _id: new Types.ObjectId(userId) } },
                {
                    $project: {
                        _id: 0,
                        username: 1,
                        checkInCount: 1,
                        itinerariesCount: {
                            $add: [
                                { $size: { $ifNull: ["$completedItineraries", []] } },
                                { $size: { $ifNull: ["$inactiveItineraries", []] } },
                                { $cond: [{ $ifNull: ["$activeItinerary", false] }, 1, 0] },
                            ],
                        },
                        stampsCount: { $size: { $ifNull: ["$stamps", []] } },
                    },
                },
            ]);
            log.debug({ userId, found: !!summary }, "Fetched profile summary");
            return summary ?? null;
        } catch (err) {
            log.error({ err, userId }, "Failed to fetch profile summary");
            throw err;
        }
    },

    async findTokenVersionById(userId: string): Promise<number | null> {
        log.debug({ userId }, "Fetching token version");
        try {
            const user = await UserModel.findById(userId).select("tokenVersion").lean<Pick<User, "tokenVersion">>();
            log.debug({ userId, found: !!user }, "Fetched token version");
            return user ? (user.tokenVersion ?? 0) : null;
        } catch (err) {
            log.error({ err, userId }, "Failed to fetch token version");
            throw err;
        }
    },

    async incrementTokenVersion(userId: string): Promise<void> {
        log.debug({ userId }, "Incrementing token version");
        try {
            const result = await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
            if (result.matchedCount === 0) {
                throw new AppError("User not found", 404);
            }
            log.debug({ userId }, "Incremented token version");
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, userId }, "Failed to increment token version");
            throw err;
        }
    },

    async create(data: CreateUserInput): Promise<User> {
        log.debug("Creating user");
        try {
            const { password, ...rest } = data;
            const passwordHash = await hashPassword(password);

            const model = await UserModel.create({
                passwordHash: passwordHash,
                ...rest
            });
            log.debug({ userId: model._id }, "Created user");
            return model.toObject() as User;
        } catch (err) {
            // A duplicate email (race with the service's pre-check) maps to a 409, not a server error.
            const level = isDuplicateKeyError(err) ? "warn" : "error";
            log[level]({ err }, "Failed to create user");
            throw err;
        }
    },
};
