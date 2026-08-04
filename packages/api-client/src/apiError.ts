export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'ApiClientError';
    this.code = code;
  }
}
