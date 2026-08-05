export const AI_SERVICE_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'AI_TIMEOUT',
  'AI_CANCELLED',
  'AI_RATE_LIMITED',
  'AI_UNAVAILABLE',
  'AI_INVALID_RESPONSE',
  'SECOND_CONFIRMATION_REQUIRED',
  'DRAFT_EXPIRED',
  'DRAFT_ALREADY_USED',
  'DRAFT_IN_PROGRESS',
  'TARGET_VERSION_CHANGED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type AiServiceErrorCode = (typeof AI_SERVICE_ERROR_CODES)[number];

export class AiServiceError extends Error {
  constructor(
    readonly code: AiServiceErrorCode,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'AiServiceError';
  }
}
