import type { DomainRepositories, ItineraryActivatedResult } from '../../domain/repositories.js';
import type { UserDocument, UserItineraryEmbed } from '../../schemas/user.js';
import { DomainError } from '../../domain/errors.js';

/**
 * Trigger: usuário ativa um roteiro template.
 * Regra: apenas 1 activeItinerary — o atual vai para inactiveItineraries.
 */
export async function onItineraryActivated(
  repos: DomainRepositories,
  userId: string,
  itineraryTemplateId: string,
  now: Date = new Date(),
): Promise<ItineraryActivatedResult> {
  const user = await repos.users.findById(userId);
  if (!user) {
    throw new Error(`Usuário ${userId} não encontrado`);
  }

  const template = await repos.itineraries.findPublishedById(itineraryTemplateId);
  if (!template) {
    throw new DomainError(
      'ITINERARY_NOT_FOUND',
      `Roteiro ${itineraryTemplateId} não encontrado ou não publicado`,
    );
  }

  if (user.activeItinerary) {
    user.inactiveItineraries.push(user.activeItinerary);
  }

  const activeItinerary: UserItineraryEmbed = {
    itineraryTemplateId,
    name: template.name,
    description: template.description,
    category: template.category,
    objectives: template.objectives,
    startedAt: now,
    places: template.placeIds.map((placeId) => ({
      placeId,
      isCompleted: false,
    })),
  };

  user.activeItinerary = activeItinerary;
  user.updatedAt = now;
  await repos.users.save(user);

  return { activeItinerary };
}
