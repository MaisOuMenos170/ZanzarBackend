import type { DomainRepositories, ItineraryActivatedResult } from '../../domain/repositories.js';
import type { UserItineraryEmbed } from '../../schemas/user.js';
import { DomainError } from '../../domain/errors.js';

/**
 * Trigger: usuário ativa um roteiro template.
 * Regra de domínio legada: apenas 1 activeItinerary — o atual vai para inactiveItineraries.
 *
 * A REST API (`POST /itineraries/:slug/activate`) retorna 409 se já houver roteiro ativo
 * em vez de arquivar automaticamente; use abandon explícito antes de trocar de roteiro.
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

  const base = {
    itineraryTemplateId,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    routeType: template.routeType,
    objectives: template.objectives,
    startedAt: now,
  };

  const activeItinerary: UserItineraryEmbed =
    template.routeType === 'free'
      ? {
          ...base,
          targetCategory: template.targetCategory!,
          targetCount: template.targetCount!,
          places: Array.from({ length: template.targetCount! }, () => ({
            isCompleted: false,
          })),
        }
      : {
          ...base,
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
