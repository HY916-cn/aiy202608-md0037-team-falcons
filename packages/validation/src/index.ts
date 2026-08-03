import { z, type ZodIssue } from 'zod';

import {
  COIN_AMOUNT_MAX,
  COIN_AMOUNT_MIN,
  DomainError,
  FINE_AMOUNT_MAX,
  FINE_AMOUNT_MIN,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  LEDGER_DIRECTIONS,
  MAX_REASON_LENGTH,
  OPERATION_KINDS,
  RANKING_WINDOWS,
  SCORE_DELTA_MAX,
  SCORE_DELTA_MIN,
  type DomainErrorCode,
  type IdempotencyKey,
  type Timestamp,
  type Uuid,
} from '@dolphincloud/domain';

export const nonEmptyStringSchema = z.string().trim().min(1);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const uuidSchema = z
  .string()
  .regex(uuidPattern, { message: 'invalid uuid' })
  .transform((value) => value as Uuid);

export const isoTimestampSchema = z
  .string()
  .regex(isoTimestampPattern, { message: 'invalid timestamp' })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'invalid timestamp',
  })
  .transform((value) => value as Timestamp);

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN_LENGTH, { message: 'idempotency key too short' })
  .max(IDEMPOTENCY_KEY_MAX_LENGTH, { message: 'idempotency key too long' })
  .regex(/^[A-Za-z0-9._-]+$/, { message: 'idempotency key charset invalid' })
  .transform((value) => value as IdempotencyKey);

export const reasonSchema = z
  .string()
  .trim()
  .min(1, { message: 'reason required' })
  .max(MAX_REASON_LENGTH, { message: 'reason too long' });

export const operationKindSchema = z.enum(OPERATION_KINDS);
export const ledgerDirectionSchema = z.enum(LEDGER_DIRECTIONS);
export const rankingWindowSchema = z.enum(RANKING_WINDOWS);

export const scoreDeltaSchema = z
  .number()
  .int({ message: 'delta must be integer' })
  .refine((value) => value !== 0, { message: 'delta must not be zero' })
  .refine((value) => value >= SCORE_DELTA_MIN && value <= SCORE_DELTA_MAX, {
    message: 'delta out of range',
  });

export const coinAmountSchema = z
  .number()
  .int({ message: 'amount must be integer' })
  .min(COIN_AMOUNT_MIN, { message: 'amount below minimum' })
  .max(COIN_AMOUNT_MAX, { message: 'amount above maximum' });

export const fineAmountSchema = z
  .number()
  .int({ message: 'amount must be integer' })
  .min(FINE_AMOUNT_MIN, { message: 'amount below minimum' })
  .max(FINE_AMOUNT_MAX, { message: 'amount above maximum' });

export const operationRequestSchema = z.object({
  kind: operationKindSchema,
  actorId: uuidSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: reasonSchema,
});
export type OperationRequest = z.infer<typeof operationRequestSchema>;

export const studentScoreEntrySchema = z.object({
  studentId: uuidSchema,
  classId: uuidSchema,
  actorId: uuidSchema,
  delta: scoreDeltaSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type StudentScoreEntryInput = z.infer<typeof studentScoreEntrySchema>;

export const classScoreEntrySchema = z.object({
  classId: uuidSchema,
  actorId: uuidSchema,
  delta: scoreDeltaSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type ClassScoreEntryInput = z.infer<typeof classScoreEntrySchema>;

export const coinLedgerEntrySchema = z.object({
  studentId: uuidSchema,
  actorId: uuidSchema,
  direction: ledgerDirectionSchema,
  amount: coinAmountSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type CoinLedgerEntryInput = z.infer<typeof coinLedgerEntrySchema>;

export const fineOrderSchema = z.object({
  studentId: uuidSchema,
  ruleId: uuidSchema,
  actorId: uuidSchema,
  amount: fineAmountSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type FineOrderInput = z.infer<typeof fineOrderSchema>;

const zodIssueToDomainCode = (issue: ZodIssue): DomainErrorCode => {
  const message = issue.message;
  if (message.includes('uuid')) return 'E_INVALID_UUID';
  if (message.includes('timestamp')) return 'E_INVALID_TIMESTAMP';
  if (message.includes('idempotency key')) return 'E_INVALID_IDEMPOTENCY_KEY';
  if (message.includes('reason')) return 'E_REASON_TOO_LONG';
  if (message.includes('integer')) return 'E_INTEGER_REQUIRED';
  if (message.includes('delta')) return 'E_DELTA_OUT_OF_RANGE';
  if (message.includes('amount')) return 'E_AMOUNT_OUT_OF_RANGE';
  return 'E_INVALID_INPUT';
};

export function parseWithDomainError<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  if (issue === undefined) {
    throw new DomainError('E_INVALID_INPUT', 'invalid input');
  }
  const code = zodIssueToDomainCode(issue);
  if (issue.path.length > 0) {
    throw new DomainError(code, issue.message, { path: issue.path.join('.') });
  }
  throw new DomainError(code, issue.message);
}
