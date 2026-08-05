import { MIN_BALANCE } from './constants';

export const DOMAIN_ERROR_CODES = [
  'E_INTEGER_REQUIRED',
  'E_BALANCE_NEGATIVE',
  'E_IDEMPOTENCY_CONFLICT',
  'E_UNAUTHORIZED',
  'E_INVALID_REVOKE_TARGET',
  'E_OPERATION_ALREADY_REVERSED',
  'E_OPERATION_NOT_APPLIED',
  'E_UNKNOWN_OPERATION_KIND',
  'E_UNKNOWN_OPERATION_STATUS',
  'E_UNKNOWN_TARGET_TYPE',
  'E_UNKNOWN_LEDGER_DIRECTION',
  'E_UNKNOWN_LEDGER_KIND',
  'E_UNKNOWN_RANKING_WINDOW',
  'E_UNKNOWN_FINE_STATUS',
  'E_UNKNOWN_ROLE',
  'E_REASON_REQUIRED',
  'E_REASON_TOO_LONG',
  'E_INVALID_UUID',
  'E_INVALID_TIMESTAMP',
  'E_INVALID_IDEMPOTENCY_KEY',
  'E_DELTA_OUT_OF_RANGE',
  'E_DELTA_ZERO_NOT_ALLOWED',
  'E_AMOUNT_OUT_OF_RANGE',
  'E_INVALID_INPUT',
  'E_INVALID_STATE_TRANSITION',
  'E_REVERSAL_MISMATCH',
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface DomainErrorOptions {
  readonly cause?: unknown;
  readonly path?: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly path: string | undefined;

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: DomainErrorOptions,
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'DomainError';
    this.code = code;
    this.path = options?.path;
  }
}

export function isDomainErrorCode(value: string): value is DomainErrorCode {
  return DOMAIN_ERROR_CODES.some((code) => code === value);
}

export function assertIntegerBalance(next: number): void {
  if (!Number.isInteger(next)) {
    throw new DomainError('E_INTEGER_REQUIRED', 'balance must be an integer');
  }
  if (next < MIN_BALANCE) {
    throw new DomainError('E_BALANCE_NEGATIVE', 'balance must not be negative');
  }
}
