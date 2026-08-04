import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DomainError } from '@dolphincloud/domain';

import {
  classScoreEntrySchema,
  coinLedgerEntrySchema,
  fineOrderSchema,
  idempotencyKeySchema,
  isoTimestampSchema,
  operationRequestSchema,
  parseWithDomainError,
  reasonSchema,
  scoreDeltaSchema,
  studentScoreEntrySchema,
  uuidSchema,
} from '../index';

const VALID_UUID = '3f6b1b2a-1c2a-4d3b-9e4f-5a6b7c8d9e0f';
const VALID_UUID_ALT = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
// 使用明显的非密钥测试字符串：全小写 + 描述性单词 + fixture 标记，
// 避免 gitleaks generic-api-key 规则对高熵字符串的误判。
const VALID_IDEMPOTENCY_KEY = 'test-idempotency-fixture-abc';

function expectDomainErrorCode(fn: () => unknown, expectedCode: string): void {
  let caught: DomainError | undefined;
  try {
    fn();
  } catch (error) {
    caught = error as DomainError;
  }
  expect(caught).toBeInstanceOf(DomainError);
  expect(caught?.code).toBe(expectedCode);
}

describe('uuid schema', () => {
  it('accepts a well-formed v4 uuid', () => {
    expect(uuidSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it('maps invalid uuid to precise E_INVALID_UUID code', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(uuidSchema, 'not-a-uuid'),
      'E_INVALID_UUID',
    );
  });
});

describe('iso timestamp schema', () => {
  it('accepts ISO-8601 with timezone', () => {
    expect(isoTimestampSchema.parse('2026-08-03T07:25:36Z')).toBe(
      '2026-08-03T07:25:36Z',
    );
    expect(isoTimestampSchema.parse('2026-08-03T07:25:36.123+08:00')).toBe(
      '2026-08-03T07:25:36.123+08:00',
    );
  });

  it('maps malformed timestamps to E_INVALID_TIMESTAMP', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(isoTimestampSchema, '2026-08-03 07:25:36'),
      'E_INVALID_TIMESTAMP',
    );
  });
});

describe('idempotency key schema', () => {
  it('accepts sufficiently long alphanumeric with allowed punctuation', () => {
    expect(idempotencyKeySchema.parse(VALID_IDEMPOTENCY_KEY)).toBe(
      VALID_IDEMPOTENCY_KEY,
    );
  });

  it('rejects short keys and keys with disallowed charset with E_INVALID_IDEMPOTENCY_KEY', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(idempotencyKeySchema, 'short'),
      'E_INVALID_IDEMPOTENCY_KEY',
    );
    expectDomainErrorCode(
      () => parseWithDomainError(idempotencyKeySchema, 'has space in key 1234'),
      'E_INVALID_IDEMPOTENCY_KEY',
    );
  });
});

describe('reason schema', () => {
  it('accepts trimmed reason within the length envelope', () => {
    expect(reasonSchema.parse('值日出勤加分')).toBe('值日出勤加分');
  });

  it('maps empty reason to E_REASON_REQUIRED, not E_REASON_TOO_LONG', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(reasonSchema, ''),
      'E_REASON_REQUIRED',
    );
    expectDomainErrorCode(
      () => parseWithDomainError(reasonSchema, '   '),
      'E_REASON_REQUIRED',
    );
  });

  it('maps oversize reason to E_REASON_TOO_LONG', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(reasonSchema, 'x'.repeat(500)),
      'E_REASON_TOO_LONG',
    );
  });
});

describe('score delta schema', () => {
  it('accepts positive and negative integers within range', () => {
    expect(scoreDeltaSchema.parse(3)).toBe(3);
    expect(scoreDeltaSchema.parse(-5)).toBe(-5);
  });

  it('rejects fractional values with E_INTEGER_REQUIRED', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(scoreDeltaSchema, 1.5),
      'E_INTEGER_REQUIRED',
    );
  });

  it('rejects zero delta with E_DELTA_ZERO_NOT_ALLOWED', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(scoreDeltaSchema, 0),
      'E_DELTA_ZERO_NOT_ALLOWED',
    );
  });

  it('rejects out-of-range delta with E_DELTA_OUT_OF_RANGE', () => {
    expectDomainErrorCode(
      () => parseWithDomainError(scoreDeltaSchema, 5_000),
      'E_DELTA_OUT_OF_RANGE',
    );
    expectDomainErrorCode(
      () => parseWithDomainError(scoreDeltaSchema, -5_000),
      'E_DELTA_OUT_OF_RANGE',
    );
  });
});

describe('operation request schema (external DTO)', () => {
  it('accepts a well-formed request using adjust naming', () => {
    const request = parseWithDomainError(operationRequestSchema, {
      kind: 'student_score_adjust',
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      reason: '值日出勤',
    });
    expect(request.kind).toBe('student_score_adjust');
    expect(request.idempotencyKey).toBe(VALID_IDEMPOTENCY_KEY);
  });

  it('accepts negative-intent kind via _adjust naming', () => {
    const request = parseWithDomainError(operationRequestSchema, {
      kind: 'class_score_adjust',
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      reason: '晚归扣分',
    });
    expect(request.kind).toBe('class_score_adjust');
  });

  it('rejects the old grant naming as unknown operation kind', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(operationRequestSchema, {
          kind: 'student_score_grant',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          reason: 'legacy',
        }),
      'E_UNKNOWN_OPERATION_KIND',
    );
  });

  it('maps unknown operation kind to E_UNKNOWN_OPERATION_KIND (not a generic error)', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(operationRequestSchema, {
          kind: 'unknown_kind',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          reason: 'test',
        }),
      'E_UNKNOWN_OPERATION_KIND',
    );
  });

  it('rejects payloads carrying actorId with E_INVALID_INPUT (strict schema)', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(operationRequestSchema, {
          kind: 'coin_grant',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          reason: '奖励',
          actorId: VALID_UUID,
        } as unknown),
      'E_INVALID_INPUT',
    );
  });

  it('rejects payloads carrying role or scope with E_INVALID_INPUT (strict schema)', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(operationRequestSchema, {
          kind: 'coin_grant',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          reason: '奖励',
          role: 'teacher',
        } as unknown),
      'E_INVALID_INPUT',
    );
    expectDomainErrorCode(
      () =>
        parseWithDomainError(operationRequestSchema, {
          kind: 'coin_grant',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          reason: '奖励',
          scope: 'class:123',
        } as unknown),
      'E_INVALID_INPUT',
    );
  });
});

describe('student and class score entry schemas (no actor in external DTO)', () => {
  it('accepts entries without actorId', () => {
    expect(() =>
      parseWithDomainError(studentScoreEntrySchema, {
        studentId: VALID_UUID,
        classId: VALID_UUID_ALT,
        delta: 2,
        reason: '值日',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();

    expect(() =>
      parseWithDomainError(classScoreEntrySchema, {
        classId: VALID_UUID,
        delta: -1,
        reason: '晚归',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();
  });

  it('rejects injection of actorId / role / scope into external entry schemas (strict)', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(studentScoreEntrySchema, {
          studentId: VALID_UUID,
          classId: VALID_UUID_ALT,
          delta: 2,
          reason: '值日',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          actorId: VALID_UUID,
        } as unknown),
      'E_INVALID_INPUT',
    );
    expectDomainErrorCode(
      () =>
        parseWithDomainError(classScoreEntrySchema, {
          classId: VALID_UUID,
          delta: 1,
          reason: '值日',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          role: 'teacher',
        } as unknown),
      'E_INVALID_INPUT',
    );
    expectDomainErrorCode(
      () =>
        parseWithDomainError(coinLedgerEntrySchema, {
          studentId: VALID_UUID,
          direction: 'credit',
          amount: 5,
          reason: '奖励',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          scope: 'class:123',
        } as unknown),
      'E_INVALID_INPUT',
    );
    expectDomainErrorCode(
      () =>
        parseWithDomainError(fineOrderSchema, {
          studentId: VALID_UUID,
          ruleId: VALID_UUID_ALT,
          amount: 5,
          reason: '违规',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
          actorId: VALID_UUID,
        } as unknown),
      'E_INVALID_INPUT',
    );
  });
});

describe('coin ledger schema', () => {
  it('rejects zero amount with E_AMOUNT_OUT_OF_RANGE', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(coinLedgerEntrySchema, {
          studentId: VALID_UUID,
          direction: 'credit',
          amount: 0,
          reason: '奖励',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
        }),
      'E_AMOUNT_OUT_OF_RANGE',
    );
  });

  it('rejects fractional amount with E_INTEGER_REQUIRED', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(coinLedgerEntrySchema, {
          studentId: VALID_UUID,
          direction: 'debit',
          amount: 1.5,
          reason: '扣款',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
        }),
      'E_INTEGER_REQUIRED',
    );
  });

  it('rejects unknown direction with E_UNKNOWN_LEDGER_DIRECTION', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(coinLedgerEntrySchema, {
          studentId: VALID_UUID,
          direction: 'income',
          amount: 10,
          reason: '奖励',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
        }),
      'E_UNKNOWN_LEDGER_DIRECTION',
    );
  });
});

describe('fine order schema', () => {
  it('accepts a complete fine order without actorId', () => {
    expect(() =>
      parseWithDomainError(fineOrderSchema, {
        studentId: VALID_UUID,
        ruleId: VALID_UUID_ALT,
        amount: 5,
        reason: '迟到',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();
  });

  it('rejects over-ceiling amount with E_AMOUNT_OUT_OF_RANGE', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(fineOrderSchema, {
          studentId: VALID_UUID,
          ruleId: VALID_UUID_ALT,
          amount: 10_000_000,
          reason: '违规',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
        }),
      'E_AMOUNT_OUT_OF_RANGE',
    );
  });

  it('rejects negative amount with E_AMOUNT_OUT_OF_RANGE', () => {
    expectDomainErrorCode(
      () =>
        parseWithDomainError(fineOrderSchema, {
          studentId: VALID_UUID,
          ruleId: VALID_UUID_ALT,
          amount: -1,
          reason: '违规',
          idempotencyKey: VALID_IDEMPOTENCY_KEY,
        }),
      'E_AMOUNT_OUT_OF_RANGE',
    );
  });
});

describe('parseWithDomainError path metadata and code routing', () => {
  it('carries the failing field path when validation fails', () => {
    let caught: DomainError | undefined;
    try {
      parseWithDomainError(studentScoreEntrySchema, {
        studentId: 'invalid',
        classId: VALID_UUID,
        delta: 1,
        reason: '值日',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught?.code).toBe('E_INVALID_UUID');
    expect(caught?.path).toBe('studentId');
  });

  it('does not use message substring matching; empty reason maps to REQUIRED not TOO_LONG', () => {
    let caught: DomainError | undefined;
    try {
      parseWithDomainError(studentScoreEntrySchema, {
        studentId: VALID_UUID,
        classId: VALID_UUID_ALT,
        delta: 1,
        reason: '',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REASON_REQUIRED');
    expect(caught?.code).not.toBe('E_REASON_TOO_LONG');
    expect(caught?.path).toBe('reason');
  });

  it('falls back to E_INVALID_INPUT when an issue message carries an unrecognised tag code (no unsafe cast)', () => {
    const bogusTagSchema = z
      .string()
      .refine(() => false, { message: 'DC_ERR::E_NOT_A_REAL_CODE::should-fallback' });
    let caught: DomainError | undefined;
    try {
      parseWithDomainError(bogusTagSchema, 'anything');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_INPUT');
  });

  it('falls back to E_INVALID_INPUT when message does not carry the DC_ERR tag prefix at all', () => {
    const plainSchema = z.string().refine(() => false, {
      message: 'no tag prefix here',
    });
    let caught: DomainError | undefined;
    try {
      parseWithDomainError(plainSchema, 'anything');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_INPUT');
  });
});
