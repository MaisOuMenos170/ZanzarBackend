import { z } from 'zod';
import { IMPRESSION_TAGS } from '../constants/impression-tags.js';

const slugPattern = /^[a-z][a-z0-9_]*$/;

const openImpressionTagSchema = z
  .string()
  .min(1)
  .regex(slugPattern, 'Tag: slug minúsculo (a-z, 0-9, _)')
  .describe(
    'Lista fechada ainda não definida — preencher src/constants/impression-tags.ts',
  );

/** Valida impressionTag: enum fechado quando IMPRESSION_TAGS estiver preenchido. */
export function impressionTagSchema() {
  if (IMPRESSION_TAGS.length === 0) {
    return openImpressionTagSchema;
  }

  return z.enum(IMPRESSION_TAGS as [string, ...string[]]);
}

export const impressionTagFieldSchema = impressionTagSchema();
