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
    /** "true" when the photo is sent from a check-in: the server finds the user's check-in at the place itself. */
    fromCheckIn: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
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

/** A photo as the place screen shows it: approved photos of everyone, plus the viewer's own unpublished ones. */
export const placePhotoResponseSchema = z.object({
    id: z.string(),
    status: z.enum(USER_PHOTO_STATUSES),
    url: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    width: z.number().int(),
    height: z.number().int(),
    isVerifiedCheckIn: z.boolean(),
    /** Null when the author chose to appear as anonymous. */
    authorName: z.string().nullable(),
    isOwn: z.boolean(),
    decisionReason: z.string().nullable(),
    createdAt: z.string(),
});
export type PlacePhotoResponse = z.infer<typeof placePhotoResponseSchema>;

export const reportPhotoBodySchema = z.object({
    reason: z.enum(["inappropriate", "not_the_place", "people_or_privacy", "copyright", "spam", "other"]),
    note: z.string().trim().max(500).optional(),
});
export type ReportPhotoBody = z.infer<typeof reportPhotoBodySchema>;

/** Blocks the author of a photo; the app never learns the author's id. */
export const blockUserBodySchema = z.object({ photoId: objectIdSchema });

export const reviewDecisionBodySchema = z.object({
    action: z.enum(["approve", "reject", "remove"]),
    /** Shown to the author in plain language by the app; required to reject or remove. */
    reason: z.string().trim().min(1).max(64).optional(),
    expectedStatus: z.enum(USER_PHOTO_STATUSES),
}).refine((body) => body.action === "approve" || Boolean(body.reason), { message: "A reason is required", path: ["reason"] });
export type ReviewDecisionBody = z.infer<typeof reviewDecisionBodySchema>;
