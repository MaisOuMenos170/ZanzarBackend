import { z } from 'zod';
import { stampIdSchema } from './stamp-id.js';

export const stampCatalogDocumentSchema = z.object({
  stampId: stampIdSchema,
  stampType: z.string().min(1),
  label: z.string().min(1),
  imageUrl: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});

export type StampCatalogDocument = z.infer<typeof stampCatalogDocumentSchema>;
