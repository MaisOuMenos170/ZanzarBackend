import { z } from "zod";
import { isoDateTimeSchema, objectIdSchema } from "../../../schemas/common";

export const checkInCreateSchema = z.object({
    userId: objectIdSchema,
    placeId: z.string().min(1).max(512),
    datetime: isoDateTimeSchema.optional(),
});

export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;
