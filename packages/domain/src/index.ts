export const APP_NAME = '海豚云';
export const APP_NAME_EN = 'DolphinCloud';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid = Brand<string, 'Uuid'>;
export type Timestamp = Brand<string, 'Timestamp'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

export const OPERATION_KINDS = [
  'student_score_grant',
  'class_score_grant',
  'coin_grant',
  'coin_deduct',
  'fine_issue',
  'fine_settle',
  'reversal',
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_STATUSES = [
  'pending',
  'applied',
  'reversed',
  'failed',
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const LEDGER_DIRECTIONS = ['credit', 'debit'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const RANKING_WINDOWS = ['weekly', 'monthly', 'all_time'] as const;
export type RankingWindow = (typeof RANKING_WINDOWS)[number];

export const FINE_STATUSES = ['pending', 'settled', 'cancelled'] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const MIN_BALANCE = 0;
export const MAX_REASON_LENGTH = 200;
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const SCORE_DELTA_MIN = -1000;
export const SCORE_DELTA_MAX = 1000;
export const COIN_AMOUNT_MIN = 1;
export const COIN_AMOUNT_MAX = 1_000_000;
export const FINE_AMOUNT_MIN = 1;
export const FINE_AMOUNT_MAX = 1_000_000;

export const DOMAIN_ERROR_CODES = [
  'E_INTEGER_REQUIRED',
  'E_BALANCE_NEGATIVE',
  'E_IDEMPOTENCY_CONFLICT',
  'E_UNAUTHORIZED',
  'E_INVALID_REVOKE_TARGET',
  'E_OPERATION_ALREADY_REVOKED',
  'E_UNKNOWN_OPERATION_KIND',
  'E_REASON_TOO_LONG',
  'E_INVALID_UUID',
  'E_INVALID_TIMESTAMP',
  'E_INVALID_IDEMPOTENCY_KEY',
  'E_DELTA_OUT_OF_RANGE',
  'E_AMOUNT_OUT_OF_RANGE',
  'E_INVALID_INPUT',
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface DomainErrorOptions {
  readonly cause?: unknown;
  readonly path?: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly path: string | undefined;

  constructor(code: DomainErrorCode, message: string, options?: DomainErrorOptions) {
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

export function isOperationKind(value: string): value is OperationKind {
  return OPERATION_KINDS.some((kind) => kind === value);
}

export function isOperationStatus(value: string): value is OperationStatus {
  return OPERATION_STATUSES.some((status) => status === value);
}

export function isLedgerDirection(value: string): value is LedgerDirection {
  return LEDGER_DIRECTIONS.some((direction) => direction === value);
}

export function isRankingWindow(value: string): value is RankingWindow {
  return RANKING_WINDOWS.some((window) => window === value);
}

export function isFineStatus(value: string): value is FineStatus {
  return FINE_STATUSES.some((status) => status === value);
}

export function isIntegerValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function assertIntegerBalance(next: number): void {
  if (!Number.isInteger(next)) {
    throw new DomainError('E_INTEGER_REQUIRED', '余额必须为整数');
  }
  if (next < MIN_BALANCE) {
    throw new DomainError('E_BALANCE_NEGATIVE', '余额不能为负');
  }
}
