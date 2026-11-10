import { z } from 'zod';
import { OSM_TYPES, PLACE_SUGGESTION_STATUSES, SEARCH_QUERY_MAX_LENGTH, SEARCH_QUERY_MIN_LENGTH } from '../constants/place-suggestions.js';
import { isoDateTimeSchema, objectIdSchema } from './common.js';

export const PLACE_SUGGESTION_ADDRESS_MAX_LENGTH = 300;
export const PLACE_SUGGESTION_NOTE_MAX_LENGTH = 1000;

export const placeSuggestionCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const placeSuggestionStatusSchema = z.enum(PLACE_SUGGESTION_STATUSES);

export const placeSuggestionDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  userId: objectIdSchema,
  coordinates: placeSuggestionCoordinatesSchema,
  address: z.string().min(1).max(PLACE_SUGGESTION_ADDRESS_MAX_LENGTH),
  note: z.string().max(PLACE_SUGGESTION_NOTE_MAX_LENGTH).optional(),
  status: placeSuggestionStatusSchema.optional(),
  name: z.string().optional(),
  decisionReason: z.string().optional(),
  placeId: z.string().optional(),
  createdAt: isoDateTimeSchema,
});

const noteSchema = z.string().trim().max(PLACE_SUGGESTION_NOTE_MAX_LENGTH).optional();

/** Current app: the user picked a search result, so only its OpenStreetMap id travels. The server looks it up. */
export const createOsmPlaceSuggestionBodySchema = z.object({
  osmType: z.enum(OSM_TYPES),
  osmId: z.number().int().positive(),
  note: noteSchema,
});

/** Older app versions and the "I could not find it" path: free text, always reviewed by a person. */
export const createManualPlaceSuggestionBodySchema = z.object({
  coordinates: placeSuggestionCoordinatesSchema,
  address: z.string().trim().min(1).max(PLACE_SUGGESTION_ADDRESS_MAX_LENGTH),
  note: noteSchema,
});

export const createPlaceSuggestionBodySchema = z.union([
  createOsmPlaceSuggestionBodySchema,
  createManualPlaceSuggestionBodySchema,
]);

/** Query of `GET /place-suggestions/search`. */
export const searchPlacesQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_QUERY_MIN_LENGTH).max(SEARCH_QUERY_MAX_LENGTH),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const osmPlaceResultSchema = z.object({
  osmType: z.enum(OSM_TYPES),
  osmId: z.number().int(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  /** Zanzar category the place would get ("cafe", "park"...), or null when we do not accept this kind of place. */
  category: z.string().nullable(),
});

export const placeSuggestionResponseSchema = z.object({
  _id: z.string(),
  status: placeSuggestionStatusSchema,
  name: z.string().nullable(),
  address: z.string(),
  coordinates: placeSuggestionCoordinatesSchema,
  note: z.string().nullable(),
  decisionReason: z.string().nullable(),
  placeId: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

/** Body of `POST /admin/api/place-suggestions/:id/decision`. */
export const placeSuggestionDecisionBodySchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(64).optional(),
    /** The status the reviewer saw; a different current status means someone else decided first (409). */
    expectedStatus: placeSuggestionStatusSchema,
  })
  .refine((body) => body.action === 'approve' || !!body.reason, { message: 'reason is required to reject', path: ['reason'] });

export type PlaceSuggestionDocument = z.infer<typeof placeSuggestionDocumentSchema>;
export type CreatePlaceSuggestionBody = z.infer<typeof createPlaceSuggestionBodySchema>;
export type CreateOsmPlaceSuggestionBody = z.infer<typeof createOsmPlaceSuggestionBodySchema>;
export type CreateManualPlaceSuggestionBody = z.infer<typeof createManualPlaceSuggestionBodySchema>;
export type SearchPlacesQuery = z.infer<typeof searchPlacesQuerySchema>;
export type OsmPlaceResult = z.infer<typeof osmPlaceResultSchema>;
export type PlaceSuggestionResponse = z.infer<typeof placeSuggestionResponseSchema>;
export type PlaceSuggestionDecisionBody = z.infer<typeof placeSuggestionDecisionBodySchema>;
