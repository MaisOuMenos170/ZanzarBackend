import { z } from "zod";
import { googlePlaceIdSchema, objectIdSchema } from "../../../schemas/common";

export const checkInCreateSchema = z.object({
    userId: objectIdSchema,
    placeId: googlePlaceIdSchema,
});

export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;