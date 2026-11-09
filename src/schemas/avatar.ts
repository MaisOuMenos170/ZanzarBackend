import { z } from 'zod';
import {
  AVATAR_BACKGROUND_PATTERN,
  AVATAR_OPTION_COUNTS,
  avatarLayerMin,
  type AvatarLayer,
} from '../constants/avatar.js';

/** Camadas opcionais (cílios, cabelo) aceitam 0 = "nenhum"; as demais vão de 1 ao total de imagens. */
const avatarLayerSchema = (layer: AvatarLayer) =>
  z.number().int().min(avatarLayerMin(layer)).max(AVATAR_OPTION_COUNTS[layer]);

export const avatarSchema = z.object({
  skin: avatarLayerSchema('skin'),
  eyes: avatarLayerSchema('eyes'),
  eyebrow: avatarLayerSchema('eyebrow'),
  eyelash: avatarLayerSchema('eyelash'),
  hair: avatarLayerSchema('hair'),
  background: z.string().regex(AVATAR_BACKGROUND_PATTERN),
});

export type Avatar = z.infer<typeof avatarSchema>;
