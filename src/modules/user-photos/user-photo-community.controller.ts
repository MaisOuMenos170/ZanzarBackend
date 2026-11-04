import type { Request, RequestHandler } from "express";
import { USER_PHOTO_STATUSES } from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import { googlePlaceIdSchema } from "../../schemas/common";
import { userPhotoCommunityService } from "./user-photo-community.service";

function requireUserId(req: Request): string {
    const userId = req.user?.id;
    if (typeof userId !== "string") throw new AppError("Access denied", 401);
    return userId;
}

function param(req: Request, name: string): string {
    const value = req.params[name];
    if (typeof value !== "string" || value.length === 0) throw new AppError("Resource not found", 404);
    return value;
}

export const listPlacePhotos: RequestHandler = async (req, res) => {
    const placeId = googlePlaceIdSchema.safeParse(req.params.placeId);
    if (!placeId.success) throw new AppError("Invalid place id", 400);
    const viewerId = typeof req.user?.id === "string" ? req.user.id : null;
    res.status(200).json({ photos: await userPhotoCommunityService.listPlacePhotos(placeId.data, viewerId) });
};

export const deleteOwnPhoto: RequestHandler = async (req, res) => {
    await userPhotoCommunityService.deleteOwnPhoto(param(req, "photoId"), requireUserId(req));
    res.status(204).send();
};

export const reportPhoto: RequestHandler = async (req, res) => {
    await userPhotoCommunityService.reportPhoto(param(req, "photoId"), requireUserId(req), req.body);
    // Whether the report hid the photo is not told to the reporter.
    res.status(202).json({ received: true });
};

export const blockUser: RequestHandler = async (req, res) => {
    await userPhotoCommunityService.blockAuthorOf(req.body.photoId, requireUserId(req));
    res.status(204).send();
};

export const listBlockedUsers: RequestHandler = async (req, res) => {
    res.status(200).json({ blockedUsers: await userPhotoCommunityService.listBlocked(requireUserId(req)) });
};

export const unblockUser: RequestHandler = async (req, res) => {
    await userPhotoCommunityService.unblock(requireUserId(req), param(req, "blockedUserId"));
    res.status(204).send();
};

export const listReviewQueue: RequestHandler = async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "needs_review";
    if (!(USER_PHOTO_STATUSES as readonly string[]).includes(status)) throw new AppError("Invalid status", 400);
    res.status(200).json({ photos: await userPhotoCommunityService.listForReview(status as (typeof USER_PHOTO_STATUSES)[number]) });
};

export const reviewPhoto: RequestHandler = async (req, res) => {
    res.status(200).json(await userPhotoCommunityService.reviewPhoto(param(req, "photoId"), requireUserId(req), req.body));
};
