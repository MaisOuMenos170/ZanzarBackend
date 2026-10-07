import assert from 'node:assert/strict';
import { applyItineraryProgressFromCheckin, findProgressSlot } from './itinerary-progress.js';
import type { PlaceDocument } from '../../schemas/place.js';
import type { UserDocument } from '../../schemas/user.js';

function makePlace(placeId: string, category: PlaceDocument['zanzar']['category']): PlaceDocument {
  return {
    place_id: placeId,
    name: `Place ${placeId}`,
    zanzar: { category, stampId: `stamp_${category}`, tags: [], checkInCount: 0, impressionCounts: {} },
  } as unknown as PlaceDocument;
}

function makeUser(activeItinerary: NonNullable<UserDocument['activeItinerary']>): UserDocument {
  return {
    activeItinerary,
    completedItineraries: [],
    stamps: [],
    checkInCount: 0,
  } as unknown as UserDocument;
}

const now = new Date('2026-01-01T12:00:00Z');

// Fixed route: matches by placeId
{
  const user = makeUser({
    itineraryTemplateId: 'abc1234567890123456789012',
    slug: 'centro-historico',
    name: 'Centro',
    description: '',
    category: 'historic',
    routeType: 'fixed',
    objectives: [],
    startedAt: now,
    places: [
      { placeId: 'place-a', isCompleted: false },
      { placeId: 'place-b', isCompleted: false },
    ],
  });
  const result = applyItineraryProgressFromCheckin(user, makePlace('place-a', 'historic'), now, now);
  assert.equal(result.itineraryCompleted, false);
  assert.equal(result.itineraryProgress?.completedSlots, 1);
  assert.equal(user.activeItinerary?.places[0]?.isCompleted, true);
  assert.equal(user.activeItinerary?.places[0]?.placeId, 'place-a');
}

// Free route: first open slot + category match
{
  const user = makeUser({
    itineraryTemplateId: 'abc1234567890123456789012',
    slug: 'visitando-parques',
    name: 'Parques',
    description: '',
    category: 'park',
    routeType: 'free',
    targetCategory: 'park',
    targetCount: 2,
    objectives: [],
    startedAt: now,
    places: [{ isCompleted: false }, { isCompleted: false }],
  });
  const wrongCategory = applyItineraryProgressFromCheckin(user, makePlace('park-1', 'restaurant'), now, now);
  assert.equal(wrongCategory.itineraryCompleted, false);
  assert.equal(wrongCategory.itineraryProgress?.completedSlots, 0);
  assert.equal(user.activeItinerary?.places[0]?.isCompleted, false);

  const ok = applyItineraryProgressFromCheckin(user, makePlace('park-1', 'park'), now, now);
  assert.equal(ok.itineraryCompleted, false);
  assert.equal(ok.itineraryProgress?.completedSlots, 1);
  assert.equal(user.activeItinerary?.places[0]?.placeId, 'park-1');

  const done = applyItineraryProgressFromCheckin(user, makePlace('park-2', 'park'), now, now);
  assert.equal(done.itineraryCompleted, true);
  assert.equal(done.itineraryProgress?.completedSlots, 2);
  assert.equal(user.activeItinerary, null);
  assert.equal(user.completedItineraries.length, 1);
}

// findProgressSlot export
{
  const active = makeUser({
    itineraryTemplateId: 'abc1234567890123456789012',
    slug: 'visitando-parques',
    name: 'Parques',
    description: '',
    category: 'park',
    routeType: 'free',
    targetCategory: 'park',
    targetCount: 1,
    objectives: [],
    startedAt: now,
    places: [{ isCompleted: false }],
  }).activeItinerary!;

  assert.equal(findProgressSlot(active, makePlace('x', 'park'))?.isCompleted, false);
  assert.equal(findProgressSlot(active, makePlace('x', 'bar')), null);
}

console.log('itinerary-progress.test.ts: ok');
