import type { CreateCheckinBody } from '../../schemas/checkin.js';
import type { PlaceDocument } from '../../schemas/place.js';
import { DomainError } from '../../domain/errors.js';
import type { CheckinRepository, PlaceRepository } from '../../domain/repositories.js';

export async function assertCheckinAllowed(
  repos: { places: PlaceRepository; checkins: CheckinRepository },
  userId: string,
  body: CreateCheckinBody,
): Promise<PlaceDocument> {
  const place = await repos.places.findByPlaceId(body.placeId);
  if (!place) {
    throw new DomainError('PLACE_NOT_FOUND', `Lugar ${body.placeId} não encontrado`);
  }

  const existing = await repos.checkins.findByUserAndPlace(userId, body.placeId);
  if (existing) {
    throw new DomainError(
      'DUPLICATE_CHECKIN',
      'Usuário já fez check-in neste lugar',
    );
  }

  return place;
}
