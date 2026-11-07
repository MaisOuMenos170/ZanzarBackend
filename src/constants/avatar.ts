export const AVATAR_LAYERS = ["skin", "eyes", "eyebrow", "eyelash", "hair"] as const;

export type AvatarLayer = (typeof AVATAR_LAYERS)[number];

/** Cor de fundo do avatar em hexadecimal `#RRGGBB`. */
export const AVATAR_BACKGROUND_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Valor de uma camada opcional que não é desenhada ("nenhum"). */
export const AVATAR_NO_OPTION = 0;

/** Camadas que aceitam `AVATAR_NO_OPTION`; as demais vão de 1 a `count`. */
export const AVATAR_OPTIONAL_LAYERS: readonly AvatarLayer[] = ["eyelash", "hair"];

/** Primeiro ID válido da camada: 0 ("nenhum") nas opcionais, 1 nas demais. */
export const avatarLayerMin = (layer: AvatarLayer): number => (AVATAR_OPTIONAL_LAYERS.includes(layer) ? AVATAR_NO_OPTION : 1);

/** Avatares criados antes dos cílios existirem foram todos desenhados com o primeiro. */
export const AVATAR_DEFAULT_EYELASH = 1;

/** Imagens por camada no app; o ID guardado vai de `avatarLayerMin` até `count`. */
export const AVATAR_OPTION_COUNTS: Record<AvatarLayer, number> = {
    skin: 8,
    eyes: 6,
    eyebrow: 5,
    eyelash: 5,
    hair: 7,
};
