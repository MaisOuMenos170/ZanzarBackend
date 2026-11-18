import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema, slugSchema, googlePlaceIdSchema } from './common.js';
import { stampIdSchema } from './stamp-id.js';
import { impressionTagFieldSchema } from './impression-tag.js';
import { itineraryRouteTypeSchema } from './itinerary.js';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';
import { MAX_SAVED_PLACES } from '../constants/saved-places.js';
import { avatarSchema, type Avatar } from './avatar.js';
import { usernameSchema } from './auth.js';

// O schema do avatar mora em avatar.ts (itinerary.ts e place.ts o usam sem ciclo com user.ts).
export { avatarSchema };

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

export const createAvatarBodySchema = avatarSchema.strict();

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
  deviceToken: z.string().min(1).optional(),
  lastCheckInAt: isoDateTimeSchema.optional(),
  lastPushNudgeAt: isoDateTimeSchema.optional(),
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

/** Body de `PATCH /user/:id`: o nome novo segue a mesma regra do cadastro. */
export const updateUsernameBodySchema = z.object({
  username: usernameSchema,
});

/** Query de `GET /user/:id/check-ins`: uma página por vez, do mais recente para o mais antigo. */
export const listCheckInsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Cursor: `nextCursor` da página anterior. Só vêm check-ins mais antigos que ele. */
  before: z.coerce.date().optional(),
});

export const userCheckInsPageSchema = z.object({
  checkIns: z.array(recentCheckInSchema),
  /** Passe como `before` para pedir a página seguinte; `null` quando não há mais. */
  nextCursor: isoDateTimeSchema.nullable(),
});

export type UserDocument = z.infer<typeof userDocumentSchema>;
export type UserStamp = z.infer<typeof userStampSchema>;
export type UserSavedPlace = z.infer<typeof userSavedPlaceSchema>;
export type SavePlaceBody = z.infer<typeof savePlaceBodySchema>;
export type SavedPlace = z.infer<typeof savedPlaceSchema>;
export type { Avatar };
export type CreateAvatarBody = z.infer<typeof createAvatarBodySchema>;
export type UpdateAvatarBody = z.infer<typeof updateAvatarBodySchema>;
export type UserItineraryEmbed = z.infer<typeof userItineraryEmbedSchema>;
export type GetProfileQuery = z.infer<typeof getProfileQuerySchema>;
export type ProfileSummary = z.infer<typeof profileSummarySchema>;
export type RecentCheckIn = z.infer<typeof recentCheckInSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UpdateUsernameBody = z.infer<typeof updateUsernameBodySchema>;
export type ListCheckInsQuery = z.infer<typeof listCheckInsQuerySchema>;
export type UserCheckInsPage = z.infer<typeof userCheckInsPageSchema>;

export const registerDeviceTokenBodySchema = z.object({
  deviceToken: z.string().min(1),
});
export type RegisterDeviceTokenBody = z.infer<typeof registerDeviceTokenBodySchema>;
