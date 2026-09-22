import type { CreateRatingBody } from '../../schemas/rating.js';
import { DomainError } from '../../domain/errors.js';
import type { CheckinRepository, RatingRepository } from '../../domain/repositories.js';

export async function assertRatingAllowed(
  repos: {
    checkins: CheckinRepository;
    rating: RatingRepository;
  },
  userId: string,
  body: CreateRatingBody,
): Promise<{ checkinId?: string }> {
  const existingRating = await repos.rating.findByUserAndPlace(userId, body.placeId);
  if (existingRating) {
    throw new DomainError(
      'DUPLICATE_IMPRESSION',
      'Usuário já registrou rating neste lugar',
    );
  }

  const checkin = await repos.checkins.findByUserAndPlace(userId, body.placeId);
  if (!checkin) {
    throw new DomainError(
      'CHECKIN_REQUIRED_FOR_IMPRESSION',
      'Check-in no lugar é obrigatório antes do rating',
    );
  }

  return { checkinId: checkin._id };
}
