import { z } from 'zod';
import {
  coordinatesSchema,
  googlePlaceIdSchema,
  isoDateTimeSchema,
  objectIdSchema,
  uuidSchema,
} from './common.js';
import { stampIdSchema } from './stamp-id.js';

export const checkinDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  userId: objectIdSchema,
  placeId: googlePlaceIdSchema,
  datetime: isoDateTimeSchema,
  serverReceivedAt: isoDateTimeSchema,
  clientMutationId: uuidSchema,
  stampIdGranted: stampIdSchema,
  coordinates: coordinatesSchema.optional(),
});

/** POST /checkins e payload de sync offline. GPS validado no cliente (MVP). */
export const createCheckinBodySchema = z.object({
  placeId: googlePlaceIdSchema,
  datetime: isoDateTimeSchema,
  clientMutationId: uuidSchema,
  coordinates: coordinatesSchema.optional(),
});

export type CheckinDocument = z.infer<typeof checkinDocumentSchema>;
export type CreateCheckinBody = z.infer<typeof createCheckinBodySchema>;
