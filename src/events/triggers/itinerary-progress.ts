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

type ItineraryPlaces = {
  places: ReadonlyArray<{ isCompleted: boolean; placeId?: string; datetime?: Date }>;
};

export function getItineraryProgressSnapshot(
  itinerary: ItineraryPlaces | null | undefined,
): ItineraryProgressSnapshot | null {
  if (!itinerary) {
    return null;
  }
  return {
    completedSlots: itinerary.places.filter((entry) => entry.isCompleted).length,
    totalSlots: itinerary.places.length,
  };
}

function slotMatchesCheckin(
  slot: { isCompleted: boolean; placeId?: string; datetime?: Date },
  placeId: string,
  checkinDatetime: Date,
): boolean {
  return (
    slot.isCompleted &&
    slot.placeId === placeId &&
    slot.datetime?.getTime() === checkinDatetime.getTime()
  );
}

function latestSlotTime(places: ReadonlyArray<{ datetime?: Date }>): number {
  return places.reduce((latest, slot) => {
    const time = slot.datetime?.getTime();
    if (time === undefined || Number.isNaN(time)) {
      return latest;
    }
    return Math.max(latest, time);
  }, Number.NEGATIVE_INFINITY);
}

/**
 * Rebuilds itinerary fields for an idempotent replay when `sync_mutations` has no
 * cached `CheckinResponse`. Matches the slot by `placeId` + client `datetime`
 * (the value stored on the slot), not by `completedAt`, which is the server clock
 * and can be minutes apart on delayed sync.
 *
 * `isItineraryCompleted` is true only when this check-in is the latest completed
 * slot of an itinerary already in `completedItineraries`.
 */
export function replayItineraryFromUserState(
  user: Pick<UserDocument, "activeItinerary" | "completedItineraries">,
  placeId: string,
  checkinDatetime: Date,
): CheckinItineraryProgressResult {
  const completed = user.completedItineraries.find((itinerary) =>
    itinerary.places.some((slot) => slotMatchesCheckin(slot, placeId, checkinDatetime)),
  );

  if (completed && latestSlotTime(completed.places) === checkinDatetime.getTime()) {
    return {
      itineraryCompleted: true,
      itineraryProgress: getItineraryProgressSnapshot(completed),
    };
  }

  const active = user.activeItinerary;
  if (active?.places.some((slot) => slotMatchesCheckin(slot, placeId, checkinDatetime))) {
    return {
      itineraryCompleted: false,
      itineraryProgress: getItineraryProgressSnapshot(active),
    };
  }

  return { itineraryCompleted: false, itineraryProgress: null };
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

function placeAlreadyCounted(
  active: ActiveItinerary,
  placeId: string,
): boolean {
  return active.places.some((entry) => entry.isCompleted && entry.placeId === placeId);
}

export function findProgressSlot(
  active: ActiveItinerary,
  place: PlaceDocument,
): ItineraryPlaceProgress | null {
  if (active.routeType === 'free') {
    const eligiblePlaceIds = active.eligiblePlaceIds ?? [];
    if (eligiblePlaceIds.length > 0) {
      if (!eligiblePlaceIds.includes(place.place_id)) {
        return null;
      }
    } else if (active.targetCategory !== place.zanzar.category) {
      return null;
    }
    if (placeAlreadyCounted(active, place.place_id)) {
      return null;
    }
    return active.places.find((entry) => !entry.isCompleted) ?? null;
  }

  const entry = active.places.find(
    (slot) => slot.placeId === place.place_id && !slot.isCompleted,
  );
  return entry ?? null;
}
