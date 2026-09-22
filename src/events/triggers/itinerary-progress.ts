import type { PlaceDocument } from '../../schemas/place.js';
import type { UserDocument } from '../../schemas/user.js';

/**
 * Trigger embutido no check-in: progresso do roteiro ativo.
 * Retorna true se o roteiro foi movido para completedItineraries.
 */
export function applyItineraryProgressFromCheckin(
  user: UserDocument,
  place: PlaceDocument,
  completedAt: Date,
  now: Date,
): boolean {
  const active = user.activeItinerary;
  if (!active) return false;

  const progress = active.places.find((entry) => entry.placeId === place.place_id);
  if (!progress || progress.isCompleted) return false;

  progress.isCompleted = true;
  progress.datetime = completedAt;
  progress.stamp = place.zanzar.stampId;

  const allDone = active.places.every((entry) => entry.isCompleted);
  if (!allDone) return false;

  user.completedItineraries.push({
    ...active,
    completedAt: now,
  });
  user.activeItinerary = null;
  return true;
}
