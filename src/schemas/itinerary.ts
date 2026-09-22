import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema, slugSchema, googlePlaceIdSchema } from './common.js';

export const itineraryDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  placeIds: z.array(googlePlaceIdSchema).min(1),
  coverImageUrl: z.string().url().optional(),
  isPublished: z.boolean().default(false),
  createdBy: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const activateItineraryBodySchema = z.object({
  itineraryTemplateId: objectIdSchema,
});

export type ItineraryDocument = z.infer<typeof itineraryDocumentSchema>;
