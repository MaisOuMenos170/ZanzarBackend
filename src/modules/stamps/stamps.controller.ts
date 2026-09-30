import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { stampIdSchema } from "../../schemas/stamp-id";
import { stampsService } from "./stamps.service";

export const getStampById: RequestHandler = async (req, res) => {
    const stampIdResult = stampIdSchema.safeParse(req.params.stampId);
    if (!stampIdResult.success) {
        throw new AppError(`Invalid stamp id: ${JSON.stringify(req.params.stampId)}`, 400);
    }

    const stamp = await stampsService.getByStampId(stampIdResult.data);
    res.status(200).json(stamp);
};
