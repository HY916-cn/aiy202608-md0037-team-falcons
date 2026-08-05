export const APP_NAME = '海豚云';
export const APP_NAME_EN = 'DolphinCloud';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid = Brand<string, 'Uuid'>;
export type Timestamp = Brand<string, 'Timestamp'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

export const OPERATION_KINDS = [
  'student_score_category_manage',
  'student_score_apply',
  'student_score_apply_batch',
  'class_score_apply',
  'class_score_appeal_create',
  'class_score_appeal_resolve',
  'dolphin_grant',
  'dolphin_deduct',
  'dolphin_adjust',
  'fine_create',
  'fine_settle',
  'fine_cancel',
  'fine_rule_manage',
  'reversal_apply',
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_STATUSES = [
  'pending',
  'succeeded',
  'reversed',
  'failed',
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const OPERATION_TARGET_TYPES = [
  'student',
  'student_score_category',
  'class',
  'household',
  'wallet',
  'fine_order',
  'fine_rule',
  'operation',
] as const;
export type OperationTargetType = (typeof OPERATION_TARGET_TYPES)[number];

export const LEDGER_DIRECTIONS = ['credit', 'debit'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_KINDS = [
  'student_score',
  'class_score',
  'coin',
  'fine',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const RANKING_WINDOWS = ['weekly', 'monthly', 'all_time'] as const;
export type RankingWindow = (typeof RANKING_WINDOWS)[number];

export const STUDENT_SCORE_CATEGORY_KINDS = ['positive', 'negative'] as const;
export type StudentScoreCategoryKind =
  (typeof STUDENT_SCORE_CATEGORY_KINDS)[number];

export const FINE_STATUSES = ['pending', 'settled', 'cancelled', 'reversed'] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const ROLE_CODES_FOR_AUTHZ = [
  'teacher',
  'class_terminal',
  'family',
  'bank_operator',
  'council',
  'admin',
] as const;
export type AuthorizedRoleCode = (typeof ROLE_CODES_FOR_AUTHZ)[number];

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

export function isOperationKind(value: string): value is OperationKind {
  return OPERATION_KINDS.some((kind) => kind === value);
}

export function isOperationStatus(value: string): value is OperationStatus {
  return OPERATION_STATUSES.some((status) => status === value);
}

export function isOperationTargetType(
  value: string,
): value is OperationTargetType {
  return OPERATION_TARGET_TYPES.some((type) => type === value);
}

export function isLedgerDirection(value: string): value is LedgerDirection {
  return LEDGER_DIRECTIONS.some((direction) => direction === value);
}

export function isLedgerKind(value: string): value is LedgerKind {
  return LEDGER_KINDS.some((kind) => kind === value);
}

export function isRankingWindow(value: string): value is RankingWindow {
  return RANKING_WINDOWS.some((window) => window === value);
}

export function isStudentScoreCategoryKind(
  value: string,
): value is StudentScoreCategoryKind {
  return STUDENT_SCORE_CATEGORY_KINDS.some((kind) => kind === value);
}

export function isFineStatus(value: string): value is FineStatus {
  return FINE_STATUSES.some((status) => status === value);
}

export function isAuthorizedRoleCode(
  value: string,
): value is AuthorizedRoleCode {
  return ROLE_CODES_FOR_AUTHZ.some((role) => role === value);
}

export function isIntegerValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export * from './errors';
export * from './operation';
export * from './audit';
export * from './idempotency';
export * from './ledger';
export * from './reversal';
export * from './scoreFlow';
export * from './ranking';
export * from './assignment';
export * from './contentStatus';
export * from './courseware';
export * from './grade';
