import type { CheckinDocument } from '../schemas/checkin.js';
import type { RatingDocument } from '../schemas/rating.js';
import type { PlaceDocument } from '../schemas/place.js';
import type { UserDocument, UserItineraryEmbed, UserStamp } from '../schemas/user.js';
import type { ItineraryDocument } from '../schemas/itinerary.js';

/** Contratos que o Mongoose implementará depois. */
export interface DomainRepositories {
  users: UserRepository;
  places: PlaceRepository;
  checkins: CheckinRepository;
  rating: RatingRepository;
  itineraries: ItineraryRepository;
  syncMutations: SyncMutationRepository;
}

export interface UserRepository {
  findById(userId: string): Promise<UserDocument | null>;
  save(user: UserDocument): Promise<UserDocument>;
}

export interface PlaceRepository {
  findByPlaceId(placeId: string): Promise<PlaceDocument | null>;
  incrementCheckInCount(placeId: string): Promise<void>;
  incrementImpressionCount(placeId: string, tag: string): Promise<void>;
}

export interface CheckinRepository {
  findByUserAndPlace(userId: string, placeId: string): Promise<CheckinDocument | null>;
  create(checkin: CheckinDocument): Promise<CheckinDocument>;
}

export interface RatingRepository {
  findByUserAndPlace(userId: string, placeId: string): Promise<RatingDocument | null>;
  create(rating: RatingDocument): Promise<RatingDocument>;
}

export interface ItineraryRepository {
  findPublishedById(id: string): Promise<ItineraryDocument | null>;
}

export interface SyncMutationRepository {
  findByClientMutationId(id: string): Promise<{ clientMutationId: string } | null>;
  record(entry: {
    clientMutationId: string;
    userId: string;
    mutationType: 'checkin' | 'rating';
    resultStatus: 'accepted' | 'rejected';
    resultPayload: Record<string, unknown>;
    processedAt: Date;
  }): Promise<void>;
}

export type CheckinCreatedResult = {
  checkin: CheckinDocument;
  stampGranted: UserStamp;
  itineraryCompleted: boolean;
};

export type RatingCreatedResult = {
  rating: RatingDocument;
};

export type ItineraryActivatedResult = {
  activeItinerary: UserItineraryEmbed;
};

export { type UserStamp };
