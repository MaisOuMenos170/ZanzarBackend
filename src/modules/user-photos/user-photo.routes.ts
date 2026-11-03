import express from "express";
import type { ErrorRequestHandler, Router } from "express";
import { MAX_UPLOAD_BYTES } from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import { photoUploadLimiter } from "../../middlewares/rateLimiters";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateSchema } from "../../middlewares/validateSchema";
import { acceptPhotoTermsBodySchema } from "../../schemas/user-photo";
import { acceptPhotoTerms, getPhotoTerms, listOwnPhotos, uploadPhoto } from "./user-photo.controller";

export const userPhotoRouter: Router = express.Router();

// The body is the image bytes. Every content type is read as raw bytes: the real format is checked from the bytes.
const rawImageBody = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
const tooLargeAsAppError: ErrorRequestHandler = (err, _req, _res, next) => {
    next(err?.type === "entity.too.large" ? new AppError("Image is too large", 413, "image_too_large") : err);
};

userPhotoRouter.post("/places/:placeId/photos", photoUploadLimiter, rawImageBody, tooLargeAsAppError, uploadPhoto);
userPhotoRouter.get("/user/:id/photos", requireOwnershipFromParams("id"), listOwnPhotos);
userPhotoRouter.get("/user/:id/photo-terms", requireOwnershipFromParams("id"), getPhotoTerms);
userPhotoRouter.post(
    "/user/:id/photo-terms",
    requireOwnershipFromParams("id"),
    validateSchema(acceptPhotoTermsBodySchema),
    acceptPhotoTerms,
);
