import { z } from 'zod';
import { objectIdSchema, isoDateTimeSchema, uuidSchema } from './common.js';
import { createCheckinBodySchema } from './checkin.js';
import { createRatingBodySchema } from './rating.js';

export const mutationTypeSchema = z.enum(['checkin', 'rating']);

export const mutationResultStatusSchema = z.enum(['accepted', 'rejected']);

export const syncMutationDocumentSchema = z.object({
  clientMutationId: uuidSchema,
  userId: objectIdSchema,
  mutationType: mutationTypeSchema,
  resultStatus: mutationResultStatusSchema,
  resultPayload: z.record(z.string(), z.unknown()).default({}),
  processedAt: isoDateTimeSchema,
});

export const syncCheckinMutationSchema = z.object({
  clientMutationId: uuidSchema,
  type: z.literal('checkin'),
  payload: createCheckinBodySchema.omit({ clientMutationId: true }),
});

export const syncRatingMutationSchema = z.object({
  clientMutationId: uuidSchema,
  type: z.literal('rating'),
  payload: createRatingBodySchema.omit({ clientMutationId: true }),
});

export const syncPushBodySchema = z.object({
  deviceId: uuidSchema.optional(),
  lastPulledAt: isoDateTimeSchema.optional(),
  mutations: z
    .array(z.discriminatedUnion('type', [
      syncCheckinMutationSchema,
      syncRatingMutationSchema,
    ]))
    .min(1),
});

export type SyncPushBody = z.infer<typeof syncPushBodySchema>;
export type SyncMutationDocument = z.infer<typeof syncMutationDocumentSchema>;
