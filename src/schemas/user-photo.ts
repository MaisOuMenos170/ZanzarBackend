import { z } from "zod";
import { USER_PHOTO_STATUSES } from "../constants/user-photos";
import { objectIdSchema } from "./common";

/** Body of `POST /user/:id/photo-terms`. The birth date is only used to compute the age, never stored. */
export const acceptPhotoTermsBodySchema = z.object({
    version: z.string().min(1).max(32),
    birthDate: z.iso.date(),
});
export type AcceptPhotoTermsBody = z.infer<typeof acceptPhotoTermsBodySchema>;

/** Query of `POST /places/:placeId/photos`; the body is the image itself. */
export const uploadPhotoQuerySchema = z.object({
    checkInId: objectIdSchema.optional(),
    showAuthorName: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
});

export const userPhotoResponseSchema = z.object({
    id: z.string(),
    placeId: z.string(),
    status: z.enum(USER_PHOTO_STATUSES),
    isVerifiedCheckIn: z.boolean(),
    showAuthorName: z.boolean(),
    width: z.number().int(),
    height: z.number().int(),
    /** Full photo. For the author's photo that is not public yet, a signed URL that expires. */
    url: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    decisionReason: z.string().nullable(),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
});
export type UserPhotoResponse = z.infer<typeof userPhotoResponseSchema>;

export const photoTermsStatusResponseSchema = z.object({
    currentVersion: z.string(),
    acceptedVersion: z.string().nullable(),
    acceptedAt: z.string().nullable(),
    isAdult: z.boolean().nullable(),
});
export type PhotoTermsStatusResponse = z.infer<typeof photoTermsStatusResponseSchema>;
