export type DomainErrorCode =
  | 'PLACE_NOT_FOUND'
  | 'DUPLICATE_CHECKIN'
  | 'DUPLICATE_IMPRESSION'
  | 'CHECKIN_REQUIRED_FOR_IMPRESSION'
  | 'ITINERARY_NOT_FOUND'
  | 'MUTATION_ALREADY_PROCESSED'
  | 'INVALID_IMPRESSION_TAG';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
