/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TODO EQUIPE — LISTA FECHADA DE IMPRESSION TAGS (Rating / Reações)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Preencher antes do launch. Cada tag é um slug que mapeia para um asset
 * desenhado no bundle iOS (PNG/SVG) — NÃO usar emoji Unicode.
 *
 * Exemplo:
 * export const IMPRESSION_TAGS = [
 *   'delighted',
 *   'curious',
 *   'tired',
 *   'bored',
 *   'amazed',
 * ] as const;
 *
 * Enquanto vazio, o schema aceita qualquer slug válido (a-z, números, _).
 * Depois de preencher, a validação passa a ser enum fechado automaticamente.
 */
export const IMPRESSION_TAGS: readonly string[] = [];

export type ImpressionTag = string;

export const IMPRESSION_TAGS_TODO_FILE = 'src/constants/impression-tags.ts';
