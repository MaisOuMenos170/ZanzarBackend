import type { CreateRatingBody } from '../../schemas/rating.js';
import type { RatingDocument } from '../../schemas/rating.js';
import type { DomainRepositories, RatingCreatedResult } from '../../domain/repositories.js';
import { assertRatingAllowed } from '../validators/pre-rating.js';

/**
 * Trigger: Rating criado (diagrama Rating / Reações)
 *
 * - 1 por usuário por lugar (placeId), imutável no MVP
 * - Selo veio no check-in; aqui incrementa impressionCounts no place
 */
export async function onRatingCreated(
  repos: DomainRepositories,
  userId: string,
  body: CreateRatingBody,
  now: Date = new Date(),
): Promise<RatingCreatedResult> {
  const { checkinId } = await assertRatingAllowed(repos, userId, body);

  const rating: RatingDocument = {
    userId,
    placeId: body.placeId,
    checkinId,
    impressionTag: body.impressionTag,
    clientMutationId: body.clientMutationId,
    createdAt: body.datetime ?? now,
  };

  const created = await repos.rating.create(rating);

  await repos.places.incrementImpressionCount(body.placeId, body.impressionTag);

  await repos.syncMutations.record({
    clientMutationId: body.clientMutationId,
    userId,
    mutationType: 'rating',
    resultStatus: 'accepted',
    resultPayload: { impressionTag: body.impressionTag, placeId: body.placeId },
    processedAt: now,
  });

  return { rating: created };
}
