import express from "express";
import type { Router } from "express";
import { AppError } from "../../errors/appError";
import { DiskPhotoStorage, getPhotoStorage } from "./photo-storage";

/**
 * Serves the files of `DiskPhotoStorage` so the simulator can show them during development.
 * Public files are open; private files need the signed URL the API hands out. Inactive with any other storage.
 */
export const devPhotoFilesRouter: Router = express.Router();

devPhotoFilesRouter.get("/dev-photos/:visibility/:key", (req, res, next) => {
    const storage = getPhotoStorage();
    if (!(storage instanceof DiskPhotoStorage)) return next();

    const { visibility, key } = req.params;
    if (visibility !== "public" && visibility !== "private") return next();
    if (visibility === "private") {
        const expires = Number(req.query.expires);
        const signature = typeof req.query.signature === "string" ? req.query.signature : "";
        if (!storage.isValidSignature(key, expires, signature)) {
            return next(new AppError("Forbidden", 403));
        }
    }
    let file: string;
    try {
        file = storage.filePath(visibility, key);
    } catch {
        return next(new AppError("Resource not found", 404));
    }
    res.type("image/jpeg").sendFile(file, (err) => {
        if (err) next(new AppError("Resource not found", 404));
    });
});
