import { z } from 'zod';
import { IMPRESSION_TAGS } from '../constants/impression-tags.js';

/** Valida impressionTag contra a lista fechada em impression-tags.ts. */
export const impressionTagFieldSchema = z.enum(IMPRESSION_TAGS);
