import { z } from "zod";
import { objectIdSchema } from "../../../schemas/common";

export const checkInCreateSchema = z.object({
    userId: objectIdSchema,
    placeId: objectIdSchema
});

export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;