import type { PlaceDocument } from '../../schemas/place.js';
import type { UserDocument } from '../../schemas/user.js';

type ActiveItinerary = NonNullable<UserDocument['activeItinerary']>;
type ItineraryPlaceProgress = ActiveItinerary['places'][number];

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

  const progress = findProgressSlot(active, place);
  if (!progress) return false;

  progress.isCompleted = true;
  progress.placeId = place.place_id;
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

export function findProgressSlot(
  active: ActiveItinerary,
  place: PlaceDocument,
): ItineraryPlaceProgress | null {
  if (active.routeType === 'free') {
    if (active.targetCategory !== place.zanzar.category) {
      return null;
    }
    return active.places.find((entry) => !entry.isCompleted) ?? null;
  }

  const entry = active.places.find(
    (slot) => slot.placeId === place.place_id && !slot.isCompleted,
  );
  return entry ?? null;
}
