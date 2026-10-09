import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema, slugSchema, googlePlaceIdSchema, coordinatesSchema } from './common.js';
import { ITINERARY_ROUTE_TYPES } from '../constants/itinerary-route-type.js';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';

export const itineraryRouteTypeSchema = z.enum(ITINERARY_ROUTE_TYPES);

const itineraryBaseSchema = z.object({
  _id: objectIdSchema.optional(),
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  completedCount: z.number().int().nonnegative().default(0),
  coverImageUrl: z.string().url().optional(),
  isPublished: z.boolean().default(false),
  createdBy: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const fixedItineraryDocumentSchema = itineraryBaseSchema.extend({
  routeType: z.literal('fixed'),
  placeIds: z.array(googlePlaceIdSchema).min(1),
  targetCategory: z.undefined().optional(),
  targetCount: z.undefined().optional(),
});

export const freeItineraryDocumentSchema = itineraryBaseSchema.extend({
  routeType: z.literal('free'),
  targetCategory: z.enum(ZANZAR_CATEGORIES),
  targetCount: z.number().int().min(1),
  placeIds: z.array(googlePlaceIdSchema).default([]),
});

export const itineraryDocumentSchema = z.discriminatedUnion('routeType', [
  fixedItineraryDocumentSchema,
  freeItineraryDocumentSchema,
]);

export const itineraryListItemSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  category: z.string(),
  routeType: itineraryRouteTypeSchema,
  placesCount: z.number().int().positive(),
  completedCount: z.number().int().nonnegative(),
  coverImageUrl: z.string().optional(),
});

export const itineraryDetailPlaceSchema = z.object({
  placeId: googlePlaceIdSchema,
  name: z.string(),
  location: coordinatesSchema.pick({ lat: true, lng: true }),
  category: z.enum(ZANZAR_CATEGORIES).optional(),
});

export const itineraryDetailSchema = z.object({
  slug: slugSchema,
  name: z.string(),
  description: z.string(),
  category: z.string(),
  routeType: itineraryRouteTypeSchema,
  objectives: z.array(z.string()),
  targetCategory: z.enum(ZANZAR_CATEGORIES).optional(),
  targetCount: z.number().int().min(1).optional(),
  placesCount: z.number().int().positive(),
  completedCount: z.number().int().nonnegative(),
  coverImageUrl: z.string().optional(),
  places: z.array(itineraryDetailPlaceSchema),
});

export const activeItineraryPlaceSchema = z.object({
  placeId: z.string().optional(),
  placeName: z.string().nullable(),
  isCompleted: z.boolean(),
  datetime: isoDateTimeSchema.optional(),
  stamp: z.string().optional(),
});

export const activeItinerarySchema = z.object({
  itineraryTemplateId: objectIdSchema,
  slug: slugSchema,
  name: z.string(),
  description: z.string(),
  category: z.string(),
  routeType: itineraryRouteTypeSchema,
  targetCategory: z.enum(ZANZAR_CATEGORIES).optional(),
  targetCount: z.number().int().min(1).optional(),
  objectives: z.array(z.string()),
  startedAt: isoDateTimeSchema,
  places: z.array(activeItineraryPlaceSchema),
});

export type ItineraryDocument = z.infer<typeof itineraryDocumentSchema>;
export type ItineraryListItem = z.infer<typeof itineraryListItemSchema>;
export type ItineraryDetail = z.infer<typeof itineraryDetailSchema>;
export type ActiveItinerary = z.infer<typeof activeItinerarySchema>;
