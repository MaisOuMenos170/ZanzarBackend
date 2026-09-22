import { z } from 'zod';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';
import { stampIdSchema } from './stamp-id.js';
import { impressionTagFieldSchema } from './impression-tag.js';
import { isoDateTimeSchema } from './common.js';

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

export const placeDocumentSchema = z.object({
  place_id: z.string().min(1),
  name: z.string().min(1),
  nickname: z.string().optional(),
  formatted_address: z.string().optional(),
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
  added_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type PlaceDocument = z.infer<typeof placeDocumentSchema>;
export type ZanzarExtension = z.infer<typeof zanzarExtensionSchema>;
