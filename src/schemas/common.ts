import { z } from 'zod';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'ObjectId inválido');

export const uuidSchema = z.string().uuid('UUID inválido');

export const isoDateTimeSchema = z.coerce.date();

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido');

export const googlePlaceIdSchema = z.string().min(1).max(512);

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
});

export type Coordinates = z.infer<typeof coordinatesSchema>;
