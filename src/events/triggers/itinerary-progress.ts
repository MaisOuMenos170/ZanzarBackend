import type { PlaceDocument } from '../../schemas/place.js';
import type { UserDocument } from '../../schemas/user.js';

type ActiveItinerary = NonNullable<UserDocument['activeItinerary']>;
type ItineraryPlaceProgress = ActiveItinerary['places'][number];

export type ItineraryProgressSnapshot = {
  completedSlots: number;
  totalSlots: number;
};

export type CheckinItineraryProgressResult = {
  itineraryCompleted: boolean;
  itineraryProgress: ItineraryProgressSnapshot | null;
};

export function getItineraryProgressSnapshot(
  active: ActiveItinerary | null | undefined,
): ItineraryProgressSnapshot | null {
  if (!active) {
    return null;
  }
  return {
    completedSlots: active.places.filter((entry) => entry.isCompleted).length,
    totalSlots: active.places.length,
  };
}

/**
 * Trigger embutido no check-in: progresso do roteiro ativo.
 */
export function applyItineraryProgressFromCheckin(
  user: UserDocument,
  place: PlaceDocument,
  completedAt: Date,
  now: Date,
): CheckinItineraryProgressResult {
  const active = user.activeItinerary;
  if (!active) {
    return { itineraryCompleted: false, itineraryProgress: null };
  }

  const progress = findProgressSlot(active, place);
  if (!progress) {
    return {
      itineraryCompleted: false,
      itineraryProgress: getItineraryProgressSnapshot(active),
    };
  }

  progress.isCompleted = true;
  progress.placeId = place.place_id;
  progress.datetime = completedAt;
  progress.stamp = place.zanzar.stampId;

  const snapshot = getItineraryProgressSnapshot(active)!;
  const allDone = active.places.every((entry) => entry.isCompleted);
  if (!allDone) {
    return { itineraryCompleted: false, itineraryProgress: snapshot };
  }

  user.completedItineraries.push({
    ...active,
    completedAt: now,
  });
  user.activeItinerary = null;
  return { itineraryCompleted: true, itineraryProgress: snapshot };
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
