import type { Types } from "mongoose";
import type { Avatar } from "../../schemas/avatar";
import { userPhotoCommunityRepository } from "../user-photos/user-photo-community.repository";
import { userRepository } from "./user.repository";

/**
 * Avatares atuais de uma lista de usuários, para mostrar "quem completou / quem reagiu".
 * Fica de fora quem não tem avatar, quem foi apagado e quem o viewer bloqueou (viewer anônimo não filtra).
 * Devolve só as camadas do avatar: nunca id, nome ou e-mail.
 */
export async function loadVisibleAvatars(
    userIds: Types.ObjectId[],
    viewerId?: string,
): Promise<Map<string, Avatar>> {
    if (userIds.length === 0) {
        return new Map();
    }
    const blocked = viewerId ? await userPhotoCommunityRepository.blockedUserIds(viewerId) : [];
    return userRepository.findAvatarsByIds(userIds, blocked);
}

/** Primeiros `limit` avatares disponíveis, preservando a ordem de `orderedUserIds` (mais recente primeiro). */
export function pickAvatars(
    orderedUserIds: Types.ObjectId[],
    avatars: Map<string, Avatar>,
    limit: number,
): Avatar[] {
    const picked: Avatar[] = [];
    for (const userId of orderedUserIds) {
        const avatar = avatars.get(userId.toString());
        if (avatar) {
            picked.push(avatar);
            if (picked.length === limit) {
                break;
            }
        }
    }
    return picked;
}
