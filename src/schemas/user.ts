import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema, slugSchema, googlePlaceIdSchema } from './common.js';
import { stampIdSchema } from './stamp-id.js';
import { impressionTagFieldSchema } from './impression-tag.js';
import { itineraryRouteTypeSchema } from './itinerary.js';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';
import { MAX_SAVED_PLACES } from '../constants/saved-places.js';
import {
  AVATAR_BACKGROUND_PATTERN,
  AVATAR_DEFAULT_EYELASH,
  AVATAR_OPTION_COUNTS,
  avatarLayerMin,
  type AvatarLayer,
} from '../constants/avatar.js';

export const userStampSchema = z.object({
  stampId: stampIdSchema,
  stampType: z.string().min(1),
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  checkinId: objectIdSchema,
  datetime: isoDateTimeSchema,
});

export const userSavedPlaceSchema = z.object({
  placeId: googlePlaceIdSchema,
  savedAt: isoDateTimeSchema,
});

export const savePlaceBodySchema = z.object({
  placeId: googlePlaceIdSchema,
});

export const savedPlaceParamsSchema = z.object({
  placeId: googlePlaceIdSchema,
});

/** Item devolvido pela API: o lugar salvo enriquecido com dados do lugar. */
export const savedPlaceSchema = userSavedPlaceSchema.extend({
  placeName: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const savedPlacesSchema = z.array(savedPlaceSchema);

/** Camadas opcionais (cílios, cabelo) aceitam 0 = "nenhum"; as demais vão de 1 ao total de imagens. */
const avatarLayerSchema = (layer: AvatarLayer) =>
  z.number().int().min(avatarLayerMin(layer)).max(AVATAR_OPTION_COUNTS[layer]);

export const avatarSchema = z.object({
  skin: avatarLayerSchema('skin'),
  eyes: avatarLayerSchema('eyes'),
  eyebrow: avatarLayerSchema('eyebrow'),
  eyelash: avatarLayerSchema('eyelash'),
  hair: avatarLayerSchema('hair'),
  background: z.string().regex(AVATAR_BACKGROUND_PATTERN),
});

// Versões do app anteriores aos cílios não enviam o campo: assumem o primeiro, como eram desenhados.
// O default só vale na criação; no PATCH um campo ausente não pode virar `1` e sobrescrever os cílios.
export const createAvatarBodySchema = avatarSchema
  .extend({ eyelash: avatarLayerSchema('eyelash').default(AVATAR_DEFAULT_EYELASH) })
  .strict();

export const updateAvatarBodySchema = avatarSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one avatar layer is required' });

export const itineraryPlaceProgressSchema = z.object({
  placeId: z.string().min(1).optional(),
  isCompleted: z.boolean().default(false),
  datetime: isoDateTimeSchema.optional(),
  stamp: stampIdSchema.optional(),
});

export const userItineraryEmbedSchema = z.object({
  itineraryTemplateId: objectIdSchema,
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().min(1),
  routeType: itineraryRouteTypeSchema,
  targetCategory: z.enum(ZANZAR_CATEGORIES).optional(),
  targetCount: z.number().int().min(1).optional(),
  /** Lista elegível copiada do template quando a rota livre não é a categoria inteira. */
  eligiblePlaceIds: z.array(z.string().min(1)).optional(),
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
  passwordHash: z.string().min(1).optional(),
  appleId: z.string().min(1).optional(),
  checkInCount: z.number().int().nonnegative().default(0),
  tokenVersion: z.number().int().nonnegative().default(0),
  stamps: z.array(userStampSchema).default([]),
  savedPlaces: z.array(userSavedPlaceSchema).max(MAX_SAVED_PLACES).default([]),
  avatar: avatarSchema.optional(),
  activeItinerary: userItineraryEmbedSchema.nullable().default(null),
  inactiveItineraries: z.array(userItineraryEmbedSchema).default([]),
  completedItineraries: z.array(completedItineraryEmbedSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const getProfileQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const profileSummarySchema = z.object({
  username: z.string(),
  checkInCount: z.number().int().nonnegative(),
  itinerariesCount: z.number().int().nonnegative(),
  stampsCount: z.number().int().nonnegative(),
});

export const recentCheckInSchema = z.object({
  placeId: z.string(),
  placeName: z.string().nullable(),
  datetime: z.date(),
  imageUrl: z.string().nullable(),
  stamp: z.object({ stampId: stampIdSchema, imageUrl: z.string() }).nullable(),
  impressionTag: impressionTagFieldSchema.nullable(),
});

export const userProfileSchema = profileSummarySchema.extend({
  recentCheckIns: z.array(recentCheckInSchema),
});

export type UserDocument = z.infer<typeof userDocumentSchema>;
export type UserStamp = z.infer<typeof userStampSchema>;
export type UserSavedPlace = z.infer<typeof userSavedPlaceSchema>;
export type SavePlaceBody = z.infer<typeof savePlaceBodySchema>;
export type SavedPlace = z.infer<typeof savedPlaceSchema>;
export type Avatar = z.infer<typeof avatarSchema>;
export type CreateAvatarBody = z.infer<typeof createAvatarBodySchema>;
export type UpdateAvatarBody = z.infer<typeof updateAvatarBodySchema>;
export type UserItineraryEmbed = z.infer<typeof userItineraryEmbedSchema>;
export type GetProfileQuery = z.infer<typeof getProfileQuerySchema>;
export type ProfileSummary = z.infer<typeof profileSummarySchema>;
export type RecentCheckIn = z.infer<typeof recentCheckInSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
