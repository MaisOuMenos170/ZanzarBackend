import { z } from 'zod';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';
import { stampIdSchema } from './stamp-id.js';
import { impressionTagFieldSchema } from './impression-tag.js';
import { googlePlaceIdSchema, isoDateTimeSchema } from './common.js';

export const zanzarExtensionSchema = z.object({
  category: z.enum(ZANZAR_CATEGORIES),
  stampId: stampIdSchema,
  tags: z.array(z.string().min(1)).default([]),
  checkInCount: z.number().int().nonnegative().default(0),
  impressionCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export const placePhotoSchema = z.object({
  photo_reference: z.string().min(1),
  height: z.number().int().positive(),
  width: z.number().int().positive(),
});

export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const getPlacesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().positive().optional(),
  excludePlaceId: googlePlaceIdSchema.optional(),
});

export const placeDocumentSchema = z.object({
  place_id: z.string().min(1),
  name: z.string().min(1),
  nickname: z.string().optional(),
  formatted_address: z.string().optional(),
  address_components: z.array(z.record(z.string(), z.unknown())).optional(),
  geometry: z.object({
    location: z.object({ lat: z.number(), lng: z.number() }),
    viewport: z.record(z.string(), z.unknown()).optional(),
  }),
  types: z.array(z.string()).default([]),
  business_status: z.string().optional(),
  editorial_summary: z
    .object({ language: z.string(), overview: z.string() })
    .optional(),
  opening_hours: z.record(z.string(), z.unknown()).optional(),
  formatted_phone_number: z.string().optional(),
  international_phone_number: z.string().optional(),
  website: z.string().optional(),
  url: z.string().optional(),
  rating: z.number().optional(),
  user_ratings_total: z.number().int().nonnegative().optional(),
  price_level: z.number().int().min(0).max(4).optional(),
  photos: z.array(placePhotoSchema).default([]),
  zanzar: zanzarExtensionSchema,
  geoLocation: geoPointSchema.optional(),
  added_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export const placeUserContextSchema = z.object({
  hasCheckedIn: z.boolean(),
  isInActiveItinerary: z.boolean(),
});

export const placeNearbySchema = placeDocumentSchema.extend({
  distanceMeters: z.number().nonnegative(),
  userContext: placeUserContextSchema.nullable(),
});

export type PlaceDocument = z.infer<typeof placeDocumentSchema>;
export type PlaceNearbyDocument = z.infer<typeof placeNearbySchema>;
export type PlaceUserContext = z.infer<typeof placeUserContextSchema>;
export type GetPlacesQuery = z.infer<typeof getPlacesQuerySchema>;
export type ZanzarExtension = z.infer<typeof zanzarExtensionSchema>;
