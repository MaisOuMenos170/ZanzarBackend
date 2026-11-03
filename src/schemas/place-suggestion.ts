import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema } from './common.js';

export const PLACE_SUGGESTION_ADDRESS_MAX_LENGTH = 300;
export const PLACE_SUGGESTION_NOTE_MAX_LENGTH = 1000;

export const placeSuggestionCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const placeSuggestionDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  userId: objectIdSchema,
  coordinates: placeSuggestionCoordinatesSchema,
  address: z.string().min(1).max(PLACE_SUGGESTION_ADDRESS_MAX_LENGTH),
  note: z.string().max(PLACE_SUGGESTION_NOTE_MAX_LENGTH).optional(),
  createdAt: isoDateTimeSchema,
});

export const createPlaceSuggestionBodySchema = z.object({
  coordinates: placeSuggestionCoordinatesSchema,
  address: z.string().trim().min(1).max(PLACE_SUGGESTION_ADDRESS_MAX_LENGTH),
  note: z.string().trim().max(PLACE_SUGGESTION_NOTE_MAX_LENGTH).optional(),
});

export type PlaceSuggestionDocument = z.infer<typeof placeSuggestionDocumentSchema>;
export type CreatePlaceSuggestionBody = z.infer<typeof createPlaceSuggestionBodySchema>;
