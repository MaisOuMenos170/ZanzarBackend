import { z } from 'zod';
import { ZANZAR_CATEGORIES } from '../constants/zanzar-categories.js';
import { stampIdSchema } from './stamp-id.js';

export const stampCatalogDocumentSchema = z.object({
  stampId: stampIdSchema,
  stampType: z.enum(ZANZAR_CATEGORIES),
  label: z.string().min(1),
  imageUrl: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});

export type StampCatalogDocument = z.infer<typeof stampCatalogDocumentSchema>;
