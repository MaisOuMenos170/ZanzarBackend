export const AVATAR_LAYERS = ["skin", "eyes", "eyebrow", "hair"] as const;

export type AvatarLayer = (typeof AVATAR_LAYERS)[number];

/** Cor de fundo do avatar em hexadecimal `#RRGGBB`. */
export const AVATAR_BACKGROUND_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Imagens por camada no app; o ID guardado é 1-based (de 1 a `count`). */
export const AVATAR_OPTION_COUNTS: Record<AvatarLayer, number> = {
    skin: 8,
    eyes: 6,
    eyebrow: 5,
    hair: 7,
};
