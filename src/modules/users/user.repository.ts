import { Types } from "mongoose";
import { UserModel, User } from "../../models/user.model";
import type { ItineraryRouteType } from "../../constants/itinerary-route-type";
import type { ZanzarCategory } from "../../constants/zanzar-categories";
import type { StampId } from "../../constants/zanzar-categories";
import { MAX_SAVED_PLACES } from "../../constants/saved-places";
import type { ProfileSummary } from "../../schemas/user";
import { AppError } from "../../errors/appError";
import { CreateUserInput } from "./schema/createUserSchema";
import { hashPassword } from "../../utils/bcrypt";
import { logger } from "../../utils/logger";
import { isDuplicateKeyError } from "../../utils/mongoErrors";

const log = logger.child({ module: "users", layer: "repository" });

export type ActiveItineraryPlaceContext =
    | { routeType: "fixed"; incompletePlaceIds: string[] }
    | { routeType: "free"; targetCategory?: ZanzarCategory; eligiblePlaceIds: string[] };

export type ActiveItineraryEmbedInput = {
    itineraryTemplateId: Types.ObjectId;
    slug: string;
    name: string;
    description: string;
    category: string;
    routeType: ItineraryRouteType;
    targetCategory?: ZanzarCategory;
    targetCount?: number;
    eligiblePlaceIds?: string[];
    objectives: string[];
    startedAt: Date;
    places: {
        placeId?: string;
        isCompleted: boolean;
        datetime?: Date;
        stamp?: StampId;
    }[];
};

export type SavedPlaceEntry = { placeId: string; savedAt: Date };

export type AddSavedPlaceResult =
    | { status: "added" | "already_saved"; savedPlace: SavedPlaceEntry }
    | { status: "user_not_found" | "limit_reached" };

export type RemoveSavedPlaceResult = "removed" | "not_saved" | "user_not_found";

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

    async findByAppleId(appleId: string): Promise<User | null> {
        log.debug("Fetching user by Apple id");
        try {
            const user = await UserModel.findOne({ appleId }).lean<User>();
            log.debug({ found: !!user }, "Fetched user by Apple id");
            return user;
        } catch (err) {
            log.error({ err }, "Failed to fetch user by Apple id");
            throw err;
        }
    },

    async existsByUsername(username: string): Promise<boolean> {
        try {
            return (await UserModel.exists({ username })) !== null;
        } catch (err) {
            log.error({ err }, "Failed to check username availability");
            throw err;
        }
    },

    async createFromApple(data: { appleId: string; email: string; username: string }): Promise<User> {
        log.debug("Creating user from Apple sign in");
        try {
            const model = await UserModel.create(data);
            log.debug({ userId: model._id }, "Created user from Apple sign in");
            return model.toObject() as User;
        } catch (err) {
            const level = isDuplicateKeyError(err) ? "warn" : "error";
            log[level]({ err }, "Failed to create user from Apple sign in");
            throw err;
        }
    },

    // Only links an account that has no Apple id yet, so an existing link is never overwritten.
    async linkAppleId(userId: string, appleId: string): Promise<User> {
        log.debug({ userId }, "Linking Apple id");
        try {
            const user = await UserModel.findOneAndUpdate(
                { _id: userId, appleId: { $exists: false } },
                { $set: { appleId } },
                { new: true },
            ).lean<User>();
            if (!user) {
                throw new AppError("Account is already linked to an Apple ID", 409);
            }
            log.debug({ userId }, "Linked Apple id");
            return user;
        } catch (err) {
            if (err instanceof AppError) {
                throw err;
            }
            log.error({ err, userId }, "Failed to link Apple id");
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
            const completedPlaceIds = new Set(
                active.places
                    .filter((place) => place.isCompleted && place.placeId)
                    .map((place) => place.placeId as string),
            );
            const eligiblePlaceIds = (active.eligiblePlaceIds ?? []).filter(
                (placeId) => !completedPlaceIds.has(placeId),
            );
            if (eligiblePlaceIds.length === 0 && !active.targetCategory) {
                return null;
            }
            return {
                routeType: "free",
                ...(active.targetCategory ? { targetCategory: active.targetCategory } : {}),
                eligiblePlaceIds,
            };
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

    // Moves the most recent abandoned itinerary of the template back to active, keeping its progress.
    // Returns null when the user has an active itinerary or no abandoned one for the template.
    async resumeInactiveItinerary(
        userId: string,
        itineraryTemplateId: Types.ObjectId,
    ): Promise<NonNullable<User["activeItinerary"]> | null> {
        log.debug({ userId }, "Resuming inactive itinerary");
        try {
            // Update pipelines skip casting, so the template id must already be an ObjectId.
            const updated = await UserModel.findOneAndUpdate(
                {
                    _id: userId,
                    activeItinerary: null,
                    "inactiveItineraries.itineraryTemplateId": itineraryTemplateId,
                },
                [
                    {
                        $set: {
                            activeItinerary: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: "$inactiveItineraries",
                                            cond: { $eq: ["$$this.itineraryTemplateId", itineraryTemplateId] },
                                        },
                                    },
                                    -1,
                                ],
                            },
                        },
                    },
                    {
                        $set: {
                            inactiveItineraries: {
                                $filter: {
                                    input: "$inactiveItineraries",
                                    cond: { $ne: ["$$this", "$activeItinerary"] },
                                },
                            },
                        },
                    },
                ],
                { new: true, projection: { activeItinerary: 1 }, updatePipeline: true },
            ).lean<Pick<User, "activeItinerary">>();

            log.debug({ userId, resumed: !!updated?.activeItinerary }, "Resumed inactive itinerary");
            return updated?.activeItinerary ?? null;
        } catch (err) {
            log.error({ err, userId }, "Failed to resume inactive itinerary");
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
                { updatePipeline: true },
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

    // `null` means the user does not exist; users created before the feature have no field, hence the fallback.
    async findSavedPlacesById(userId: string): Promise<SavedPlaceEntry[] | null> {
        log.debug({ userId }, "Fetching saved places");
        try {
            const user = await UserModel.findById(userId).select("savedPlaces").lean<Pick<User, "savedPlaces">>();
            log.debug({ userId, found: !!user, count: user?.savedPlaces?.length }, "Fetched saved places");
            return user ? (user.savedPlaces ?? []) : null;
        } catch (err) {
            log.error({ err, userId }, "Failed to fetch saved places");
            throw err;
        }
    },

    // The filter makes the duplicate and size-limit checks atomic with the push, so concurrent
    // requests can neither save the same place twice nor exceed MAX_SAVED_PLACES.
    async addSavedPlace(userId: string, placeId: string, savedAt: Date): Promise<AddSavedPlaceResult> {
        log.debug({ userId, placeId }, "Adding saved place");
        try {
            const result = await UserModel.updateOne(
                {
                    _id: userId,
                    "savedPlaces.placeId": { $ne: placeId },
                    [`savedPlaces.${MAX_SAVED_PLACES - 1}`]: { $exists: false },
                },
                { $push: { savedPlaces: { placeId, savedAt } } },
            );
            if (result.modifiedCount > 0) {
                log.debug({ userId, placeId }, "Added saved place");
                return { status: "added", savedPlace: { placeId, savedAt } };
            }

            const existing = await this.findSavedPlacesById(userId);
            if (!existing) {
                return { status: "user_not_found" };
            }
            const saved = existing.find((entry) => entry.placeId === placeId);
            if (saved) {
                log.debug({ userId, placeId }, "Place already saved");
                return { status: "already_saved", savedPlace: saved };
            }
            log.debug({ userId, placeId }, "Saved places limit reached");
            return { status: "limit_reached" };
        } catch (err) {
            log.error({ err, userId, placeId }, "Failed to add saved place");
            throw err;
        }
    },

    async removeSavedPlace(userId: string, placeId: string): Promise<RemoveSavedPlaceResult> {
        log.debug({ userId, placeId }, "Removing saved place");
        try {
            const result = await UserModel.updateOne({ _id: userId }, { $pull: { savedPlaces: { placeId } } });
            if (result.matchedCount === 0) {
                return "user_not_found";
            }
            const status = result.modifiedCount > 0 ? "removed" : "not_saved";
            log.debug({ userId, placeId, status }, "Removed saved place");
            return status;
        } catch (err) {
            log.error({ err, userId, placeId }, "Failed to remove saved place");
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
