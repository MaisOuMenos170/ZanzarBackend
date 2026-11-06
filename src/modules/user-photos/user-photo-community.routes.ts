import path from "node:path";
import express from "express";
import type { Router } from "express";
import helmet from "helmet";
import { optionalAuthToken } from "../../middlewares/optionalAuthToken";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireOwnershipFromParams } from "../../middlewares/requireOwnership";
import { validateSchema } from "../../middlewares/validateSchema";
import { blockUserBodySchema, reportPhotoBodySchema, reviewDecisionBodySchema } from "../../schemas/user-photo";
import {
    blockUser, deleteOwnPhoto, listBlockedUsers, listPlacePhotos, listReviewQueue, reportPhoto, reviewPhoto, unblockUser,
} from "./user-photo-community.controller";

/** Mounted before authentication: anyone may see approved photos; a signed-in viewer also sees their own. */
export const userPhotoPublicRouter: Router = express.Router();
userPhotoPublicRouter.get("/places/:placeId/photos", optionalAuthToken, listPlacePhotos);

const adminPage = path.resolve(__dirname, "../../../admin");
// The review page loads photos from the storage host, so its CSP allows images from anywhere over https.
userPhotoPublicRouter.use(
    "/admin",
    helmet.contentSecurityPolicy({ directives: { "img-src": ["'self'", "https:", "http://127.0.0.1:*", "http://localhost:*", "data:"] } }),
    express.static(adminPage, { index: "index.html" }),
);

/** Mounted after `validateAuthToken`. */
export const userPhotoCommunityRouter: Router = express.Router();
userPhotoCommunityRouter.delete("/places/:placeId/photos/:photoId", deleteOwnPhoto);
userPhotoCommunityRouter.post("/places/:placeId/photos/:photoId/reports", validateSchema(reportPhotoBodySchema), reportPhoto);
userPhotoCommunityRouter.get("/user/:id/blocks", requireOwnershipFromParams("id"), listBlockedUsers);
userPhotoCommunityRouter.post("/user/:id/blocks", requireOwnershipFromParams("id"), validateSchema(blockUserBodySchema), blockUser);
userPhotoCommunityRouter.delete("/user/:id/blocks/:blockedUserId", requireOwnershipFromParams("id"), unblockUser);
userPhotoCommunityRouter.get("/admin/api/photos", requireAdmin, listReviewQueue);
userPhotoCommunityRouter.post("/admin/api/photos/:photoId/decision", requireAdmin, validateSchema(reviewDecisionBodySchema), reviewPhoto);
