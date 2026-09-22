import { z } from 'zod';
import {
  googlePlaceIdSchema,
  isoDateTimeSchema,
  objectIdSchema,
  uuidSchema,
} from './common.js';
import { impressionTagFieldSchema } from './impression-tag.js';

export const ratingDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  userId: objectIdSchema,
  placeId: googlePlaceIdSchema,
  checkinId: objectIdSchema.optional(),
  impressionTag: impressionTagFieldSchema,
  clientMutationId: uuidSchema,
  createdAt: isoDateTimeSchema,
});

/** Rating atrelado ao LUGAR (placeId). 1 por usuário por lugar (imutável no MVP). */
export const createRatingBodySchema = z.object({
  placeId: googlePlaceIdSchema,
  impressionTag: impressionTagFieldSchema,
  clientMutationId: uuidSchema,
  datetime: isoDateTimeSchema.optional(),
});

export type RatingDocument = z.infer<typeof ratingDocumentSchema>;
export type CreateRatingBody = z.infer<typeof createRatingBodySchema>;
