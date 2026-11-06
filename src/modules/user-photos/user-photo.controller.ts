import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { googlePlaceIdSchema } from "../../schemas/common";
import { uploadPhotoQuerySchema } from "../../schemas/user-photo";
import { userPhotoService } from "./user-photo.service";

function requireUserId(req: Parameters<RequestHandler>[0]): string {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }
    return userId;
}

export const uploadPhoto: RequestHandler = async (req, res) => {
    const userId = requireUserId(req);
    const placeId = googlePlaceIdSchema.safeParse(req.params.placeId);
    if (!placeId.success) throw new AppError("Invalid place id", 400);
    const query = uploadPhotoQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError("Invalid upload options", 400, "invalid_options");
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError("Missing image", 400, "missing_image");
    }

    const photo = await userPhotoService.uploadPhoto({
        userId,
        placeId: placeId.data,
        image: req.body,
        fromCheckIn: query.data.fromCheckIn,
        showAuthorName: query.data.showAuthorName,
    });
    res.status(201).json(photo);
};

export const listOwnPhotos: RequestHandler = async (req, res) => {
    res.status(200).json({ photos: await userPhotoService.listOwnPhotos(requireUserId(req)) });
};

export const getPhotoTerms: RequestHandler = async (req, res) => {
    res.status(200).json(await userPhotoService.getPhotoTermsStatus(requireUserId(req)));
};

export const acceptPhotoTerms: RequestHandler = async (req, res) => {
    res.status(200).json(await userPhotoService.acceptPhotoTerms(requireUserId(req), req.body));
};
