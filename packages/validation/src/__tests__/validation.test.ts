import { describe, expect, it } from 'vitest';

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
const VALID_UUID_ALT2 = 'b1a2c3d4-e5f6-4a7b-89cd-0e1f2a3b4c5e';
const VALID_UUID_ALT3 = 'c1a2c3d4-e5f6-4a7b-8acd-0e1f2a3b4c5e';
const VALID_IDEMPOTENCY_KEY = 'ck-2026-abc-0001-XYZ';

describe('uuid schema', () => {
  it('accepts a well-formed v4 uuid and rejects garbage', () => {
    expect(uuidSchema.parse(VALID_UUID)).toBe(VALID_UUID);
    expect(() =>
      parseWithDomainError(uuidSchema, 'not-a-uuid'),
    ).toThrowError(
      expect.objectContaining({
        code: 'E_INVALID_UUID',
      }),
    );
  });
});

describe('iso timestamp schema', () => {
  it('accepts ISO-8601 with timezone and rejects arbitrary strings', () => {
    expect(isoTimestampSchema.parse('2026-08-03T07:25:36Z')).toBe(
      '2026-08-03T07:25:36Z',
    );
    expect(isoTimestampSchema.parse('2026-08-03T07:25:36.123+08:00')).toBe(
      '2026-08-03T07:25:36.123+08:00',
    );
    expect(() =>
      parseWithDomainError(isoTimestampSchema, '2026-08-03 07:25:36'),
    ).toThrowError(
      expect.objectContaining({ code: 'E_INVALID_TIMESTAMP' }),
    );
  });
});

describe('idempotency key schema', () => {
  it('accepts sufficiently long alphanumeric with allowed punctuation', () => {
    expect(idempotencyKeySchema.parse(VALID_IDEMPOTENCY_KEY)).toBe(
      VALID_IDEMPOTENCY_KEY,
    );
  });

  it('rejects short keys, keys with spaces, and non-strings', () => {
    expect(() =>
      parseWithDomainError(idempotencyKeySchema, 'short'),
    ).toThrowError(
      expect.objectContaining({ code: 'E_INVALID_IDEMPOTENCY_KEY' }),
    );
    expect(() =>
      parseWithDomainError(idempotencyKeySchema, 'has space in key 1234'),
    ).toThrowError(DomainError);
  });
});

describe('reason schema', () => {
  it('accepts trimmed reason within the length envelope', () => {
    expect(reasonSchema.parse('值日出勤加分')).toBe('值日出勤加分');
  });

  it('rejects empty reason and reasons over MAX_REASON_LENGTH', () => {
    expect(() => parseWithDomainError(reasonSchema, '')).toThrowError(
      DomainError,
    );
    expect(() =>
      parseWithDomainError(reasonSchema, 'x'.repeat(500)),
    ).toThrowError(
      expect.objectContaining({ code: 'E_REASON_TOO_LONG' }),
    );
  });
});

describe('score delta schema', () => {
  it('accepts positive and negative integers within range', () => {
    expect(scoreDeltaSchema.parse(3)).toBe(3);
    expect(scoreDeltaSchema.parse(-5)).toBe(-5);
  });

  it('rejects fractional values, zero, and out-of-range values', () => {
    expect(() => parseWithDomainError(scoreDeltaSchema, 1.5)).toThrowError(
      expect.objectContaining({ code: 'E_INTEGER_REQUIRED' }),
    );
    expect(() => parseWithDomainError(scoreDeltaSchema, 0)).toThrowError(
      expect.objectContaining({ code: 'E_DELTA_OUT_OF_RANGE' }),
    );
    expect(() =>
      parseWithDomainError(scoreDeltaSchema, 5_000),
    ).toThrowError(
      expect.objectContaining({ code: 'E_DELTA_OUT_OF_RANGE' }),
    );
  });
});

describe('operation request schema', () => {
  it('accepts a well-formed operation request', () => {
    const request = parseWithDomainError(operationRequestSchema, {
      kind: 'student_score_grant',
      actorId: VALID_UUID,
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      reason: '值日出勤',
    });
    expect(request.kind).toBe('student_score_grant');
  });

  it('rejects unknown operation kinds', () => {
    expect(() =>
      parseWithDomainError(operationRequestSchema, {
        kind: 'unknown_kind',
        actorId: VALID_UUID,
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
        reason: 'test',
      }),
    ).toThrowError(DomainError);
  });
});

describe('student and class score entry schemas', () => {
  it('accept complete entries', () => {
    expect(() =>
      parseWithDomainError(studentScoreEntrySchema, {
        studentId: VALID_UUID,
        classId: VALID_UUID_ALT,
        actorId: VALID_UUID_ALT2,
        delta: 2,
        reason: '值日',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();

    expect(() =>
      parseWithDomainError(classScoreEntrySchema, {
        classId: VALID_UUID,
        actorId: VALID_UUID_ALT,
        delta: -1,
        reason: '晚归',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();
  });
});

describe('coin ledger schema', () => {
  it('rejects zero and fractional amounts', () => {
    expect(() =>
      parseWithDomainError(coinLedgerEntrySchema, {
        studentId: VALID_UUID,
        actorId: VALID_UUID_ALT,
        direction: 'credit',
        amount: 0,
        reason: '奖励',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'E_AMOUNT_OUT_OF_RANGE' }),
    );

    expect(() =>
      parseWithDomainError(coinLedgerEntrySchema, {
        studentId: VALID_UUID,
        actorId: VALID_UUID_ALT,
        direction: 'debit',
        amount: 1.5,
        reason: '扣款',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'E_INTEGER_REQUIRED' }),
    );
  });

  it('rejects unknown direction', () => {
    expect(() =>
      parseWithDomainError(coinLedgerEntrySchema, {
        studentId: VALID_UUID,
        actorId: VALID_UUID_ALT,
        direction: 'income',
        amount: 10,
        reason: '奖励',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).toThrowError(DomainError);
  });
});

describe('fine order schema', () => {
  it('accepts a complete fine order', () => {
    expect(() =>
      parseWithDomainError(fineOrderSchema, {
        studentId: VALID_UUID,
        ruleId: VALID_UUID_ALT,
        actorId: VALID_UUID_ALT2,
        amount: 5,
        reason: '迟到',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).not.toThrow();
  });

  it('rejects fine amount above the ceiling and negative amount', () => {
    expect(() =>
      parseWithDomainError(fineOrderSchema, {
        studentId: VALID_UUID,
        ruleId: VALID_UUID_ALT,
        actorId: VALID_UUID_ALT3,
        amount: 10_000_000,
        reason: '违规',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'E_AMOUNT_OUT_OF_RANGE' }),
    );

    expect(() =>
      parseWithDomainError(fineOrderSchema, {
        studentId: VALID_UUID,
        ruleId: VALID_UUID_ALT,
        actorId: VALID_UUID_ALT3,
        amount: -1,
        reason: '违规',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'E_AMOUNT_OUT_OF_RANGE' }),
    );
  });
});

describe('parseWithDomainError path metadata', () => {
  it('carries the failing field path when validation fails', () => {
    try {
      parseWithDomainError(studentScoreEntrySchema, {
        studentId: 'invalid',
        classId: VALID_UUID,
        actorId: VALID_UUID_ALT,
        delta: 1,
        reason: '值日',
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainError = error as DomainError;
      expect(domainError.code).toBe('E_INVALID_UUID');
      expect(domainError.path).toBe('studentId');
    }
  });
});
