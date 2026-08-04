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

const idempotencyKeyCharsetPattern = /^[A-Za-z0-9._-]+$/;

// 每个规则给出稳定的 code 前缀，供 parseWithDomainError 精确定位；
// 前缀字符串本身仅用于内部路由，绝不作为对外错误消息。
const CODE_TAG = 'DC_ERR::';

const tag = (code: DomainErrorCode, human: string) =>
  `${CODE_TAG}${code}::${human}`;

export const uuidSchema = z
  .string()
  .regex(uuidPattern, { message: tag('E_INVALID_UUID', 'invalid uuid') })
  .transform((value) => value as Uuid);

export const isoTimestampSchema = z
  .string()
  .regex(isoTimestampPattern, {
    message: tag('E_INVALID_TIMESTAMP', 'invalid timestamp format'),
  })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: tag('E_INVALID_TIMESTAMP', 'timestamp is not parseable'),
  })
  .transform((value) => value as Timestamp);

export const idempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN_LENGTH, {
    message: tag('E_INVALID_IDEMPOTENCY_KEY', 'idempotency key too short'),
  })
  .max(IDEMPOTENCY_KEY_MAX_LENGTH, {
    message: tag('E_INVALID_IDEMPOTENCY_KEY', 'idempotency key too long'),
  })
  .regex(idempotencyKeyCharsetPattern, {
    message: tag(
      'E_INVALID_IDEMPOTENCY_KEY',
      'idempotency key charset invalid',
    ),
  })
  .transform((value) => value as IdempotencyKey);

// reason 拆成 required 与 too_long 两个精确错误码，
// 用 union 顺序保证：空字符串命中 required 分支，超长命中 too_long 分支。
const reasonRequiredSchema = z.string().trim().min(1, {
  message: tag('E_REASON_REQUIRED', 'reason is required'),
});
const reasonMaxLengthSchema = reasonRequiredSchema.max(MAX_REASON_LENGTH, {
  message: tag('E_REASON_TOO_LONG', 'reason exceeds maximum length'),
});
export const reasonSchema = reasonMaxLengthSchema;

export const operationKindSchema = z.enum(OPERATION_KINDS, {
  message: tag('E_UNKNOWN_OPERATION_KIND', 'unknown operation kind'),
});

export const ledgerDirectionSchema = z.enum(LEDGER_DIRECTIONS, {
  message: tag('E_UNKNOWN_LEDGER_DIRECTION', 'unknown ledger direction'),
});

export const rankingWindowSchema = z.enum(RANKING_WINDOWS, {
  message: tag('E_UNKNOWN_RANKING_WINDOW', 'unknown ranking window'),
});

export const scoreDeltaSchema = z
  .number({
    message: tag('E_INTEGER_REQUIRED', 'delta must be a number'),
  })
  .int({ message: tag('E_INTEGER_REQUIRED', 'delta must be integer') })
  .refine((value) => value !== 0, {
    message: tag('E_DELTA_ZERO_NOT_ALLOWED', 'delta must not be zero'),
  })
  .refine((value) => value >= SCORE_DELTA_MIN && value <= SCORE_DELTA_MAX, {
    message: tag('E_DELTA_OUT_OF_RANGE', 'delta out of range'),
  });

export const coinAmountSchema = z
  .number({
    message: tag('E_INTEGER_REQUIRED', 'amount must be a number'),
  })
  .int({ message: tag('E_INTEGER_REQUIRED', 'amount must be integer') })
  .min(COIN_AMOUNT_MIN, {
    message: tag('E_AMOUNT_OUT_OF_RANGE', 'amount below minimum'),
  })
  .max(COIN_AMOUNT_MAX, {
    message: tag('E_AMOUNT_OUT_OF_RANGE', 'amount above maximum'),
  });

export const fineAmountSchema = z
  .number({
    message: tag('E_INTEGER_REQUIRED', 'amount must be a number'),
  })
  .int({ message: tag('E_INTEGER_REQUIRED', 'amount must be integer') })
  .min(FINE_AMOUNT_MIN, {
    message: tag('E_AMOUNT_OUT_OF_RANGE', 'amount below minimum'),
  })
  .max(FINE_AMOUNT_MAX, {
    message: tag('E_AMOUNT_OUT_OF_RANGE', 'amount above maximum'),
  });

/**
 * 外部 DTO：客户端提交的操作请求。
 * 严格禁止携带 actorId / role / class scope；这些字段必须由服务端从 JWT
 * 和授权表计算后注入 AuthorizedOperationCommand (@dolphincloud/domain)。
 */
export const operationRequestSchema = z.object({
  kind: operationKindSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: reasonSchema,
});
export type OperationRequest = z.infer<typeof operationRequestSchema>;

export const studentScoreEntrySchema = z.object({
  studentId: uuidSchema,
  classId: uuidSchema,
  delta: scoreDeltaSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type StudentScoreEntryInput = z.infer<typeof studentScoreEntrySchema>;

export const classScoreEntrySchema = z.object({
  classId: uuidSchema,
  delta: scoreDeltaSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type ClassScoreEntryInput = z.infer<typeof classScoreEntrySchema>;

export const coinLedgerEntrySchema = z.object({
  studentId: uuidSchema,
  direction: ledgerDirectionSchema,
  amount: coinAmountSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type CoinLedgerEntryInput = z.infer<typeof coinLedgerEntrySchema>;

export const fineOrderSchema = z.object({
  studentId: uuidSchema,
  ruleId: uuidSchema,
  amount: fineAmountSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type FineOrderInput = z.infer<typeof fineOrderSchema>;

interface DecodedIssue {
  readonly code: DomainErrorCode;
  readonly message: string;
}

function decodeIssue(issue: ZodIssue): DecodedIssue {
  const raw = issue.message;
  if (raw.startsWith(CODE_TAG)) {
    const body = raw.slice(CODE_TAG.length);
    const separator = body.indexOf('::');
    if (separator > 0) {
      const code = body.slice(0, separator) as DomainErrorCode;
      const message = body.slice(separator + 2);
      return { code, message };
    }
  }
  return { code: 'E_INVALID_INPUT', message: raw };
}

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
  const decoded = decodeIssue(issue);
  if (issue.path.length > 0) {
    throw new DomainError(decoded.code, decoded.message, {
      path: issue.path.join('.'),
    });
  }
  throw new DomainError(decoded.code, decoded.message);
}
