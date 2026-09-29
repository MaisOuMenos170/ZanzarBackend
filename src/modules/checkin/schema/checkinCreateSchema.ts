import { z } from "zod";
import { googlePlaceIdSchema, isoDateTimeSchema, objectIdSchema } from "../../../schemas/common";

export const checkInCreateSchema = z.object({
    userId: objectIdSchema,
    placeId: googlePlaceIdSchema,
    datetime: isoDateTimeSchema.optional(),
});

export type CheckInCreateInput = z.infer<typeof checkInCreateSchema>;
