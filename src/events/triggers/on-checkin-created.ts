import type { CreateCheckinBody } from '../../schemas/checkin.js';
import type { CheckinDocument } from '../../schemas/checkin.js';
import type { PlaceDocument } from '../../schemas/place.js';
import type {
  CheckinCreatedResult,
  DomainRepositories,
  UserStamp,
} from '../../domain/repositories.js';
import type { UserDocument } from '../../schemas/user.js';
import { assertCheckinAllowed } from '../validators/pre-checkin.js';
import { applyItineraryProgressFromCheckin } from './itinerary-progress.js';

/**
 * Trigger: Check-in criado (diagrama CheckIns)
 *
 * 1. Insert checkins
 * 2. $inc users.checkInCount + $push users.stamps
 * 3. $inc places.zanzar.checkInCount
 * 4. Marca place no activeItinerary se aplicável
 * 5. Se 100% do roteiro → completedItineraries
 */
export async function onCheckinCreated(
  repos: DomainRepositories,
  userId: string,
  body: CreateCheckinBody,
  now: Date = new Date(),
): Promise<CheckinCreatedResult> {
  const place = await assertCheckinAllowed(repos, userId, body);
  const user = await repos.users.findById(userId);
  if (!user) {
    throw new Error(`Usuário ${userId} não encontrado`);
  }

  const checkin: CheckinDocument = {
    userId,
    placeId: body.placeId,
    datetime: body.datetime,
    serverReceivedAt: now,
    clientMutationId: body.clientMutationId,
    stampIdGranted: place.zanzar.stampId,
    coordinates: body.coordinates,
  };

  const created = await repos.checkins.create(checkin);
  const checkinId = created._id;
  if (!checkinId) {
    throw new Error('Check-in criado sem _id');
  }

  const stamp: UserStamp = {
    stampId: place.zanzar.stampId,
    stampType: place.zanzar.category,
    placeId: place.place_id,
    placeName: place.name,
    checkinId,
    datetime: body.datetime,
  };

  user.checkInCount += 1;
  user.stamps.push(stamp);
  user.updatedAt = now;

  await repos.places.incrementCheckInCount(place.place_id);

  const itineraryCompleted = applyItineraryProgressFromCheckin(
    user,
    place,
    body.datetime,
    now,
  );

  await repos.users.save(user);

  await repos.syncMutations.record({
    clientMutationId: body.clientMutationId,
    userId,
    mutationType: 'checkin',
    resultStatus: 'accepted',
    resultPayload: { stampId: stamp.stampId, checkinId },
    processedAt: now,
  });

  return { checkin: created, stampGranted: stamp, itineraryCompleted };
}
