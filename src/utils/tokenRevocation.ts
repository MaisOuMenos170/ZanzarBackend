import type { JwtPayload } from "jsonwebtoken";
import { userRepository } from "../modules/users/user.repository";

/**
 * Logout bumps users.tokenVersion, so a token is revoked when its `tokenVersion` claim no longer
 * matches the stored one. Tokens without the claim count as version 0; a deleted user counts as revoked.
 */
export async function isTokenRevoked(payload: JwtPayload): Promise<boolean> {
    const currentVersion = await userRepository.findTokenVersionById(String(payload.id));
    return currentVersion === null || currentVersion !== (payload.tokenVersion ?? 0);
}
