/**
 * Slugs alinhados aos assets Carinhas no app iOS.
 */
export const IMPRESSION_TAGS = [
  'delighted',
  'happy',
  'nauseated',
  'sad',
  'sleepy',
] as const;

export type ImpressionTag = (typeof IMPRESSION_TAGS)[number];

export const IMPRESSION_TAGS_TODO_FILE = 'src/constants/impression-tags.ts';
