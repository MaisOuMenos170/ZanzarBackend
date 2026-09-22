import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema } from './common.js';
import { stampIdSchema } from './stamp-id.js';

export const userStampSchema = z.object({
  stampId: stampIdSchema,
  stampType: z.string().min(1),
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  checkinId: objectIdSchema,
  datetime: isoDateTimeSchema,
});

export const itineraryPlaceProgressSchema = z.object({
  placeId: z.string().min(1),
  isCompleted: z.boolean().default(false),
  datetime: isoDateTimeSchema.optional(),
  stamp: stampIdSchema.optional(),
});

export const userItineraryEmbedSchema = z.object({
  itineraryTemplateId: objectIdSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().min(1),
  objectives: z.array(z.string()),
  startedAt: isoDateTimeSchema,
  places: z.array(itineraryPlaceProgressSchema).min(1),
});

export const completedItineraryEmbedSchema = userItineraryEmbedSchema.extend({
  completedAt: isoDateTimeSchema,
});

export const userDocumentSchema = z.object({
  _id: objectIdSchema.optional(),
  username: z.string().min(3).max(30),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  checkInCount: z.number().int().nonnegative().default(0),
  tokenVersion: z.number().int().nonnegative().default(0),
  stamps: z.array(userStampSchema).default([]),
  activeItinerary: userItineraryEmbedSchema.nullable().default(null),
  inactiveItineraries: z.array(userItineraryEmbedSchema).default([]),
  completedItineraries: z.array(completedItineraryEmbedSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type UserDocument = z.infer<typeof userDocumentSchema>;
export type UserStamp = z.infer<typeof userStampSchema>;
export type UserItineraryEmbed = z.infer<typeof userItineraryEmbedSchema>;
