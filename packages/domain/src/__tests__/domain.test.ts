import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  DomainError,
  FINE_STATUSES,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  LEDGER_DIRECTIONS,
  LEDGER_KINDS,
  MAX_REASON_LENGTH,
  MIN_BALANCE,
  OPERATION_KINDS,
  OPERATION_STATUSES,
  OPERATION_TARGET_TYPES,
  RANKING_WINDOWS,
  ROLE_CODES_FOR_AUTHZ,
  SCORE_DELTA_MAX,
  SCORE_DELTA_MIN,
  assertIntegerBalance,
  isAuthorizedRoleCode,
  isDomainErrorCode,
  isFineStatus,
  isIntegerValue,
  isLedgerDirection,
  isLedgerKind,
  isOperationKind,
  isOperationStatus,
  isOperationTargetType,
  isRankingWindow,
} from '../index';

describe('domain enums', () => {
  it('operation kinds match the governance SQL contracts', () => {
    expect(OPERATION_KINDS).toContain('student_score_apply');
    expect(OPERATION_KINDS).toContain('student_score_apply_batch');
    expect(OPERATION_KINDS).toContain('class_score_apply');
    expect(OPERATION_KINDS).toContain('dolphin_grant');
    expect(OPERATION_KINDS).toContain('fine_rule_manage');
    expect(OPERATION_KINDS).toContain('reversal_apply');
  });

  it('operation statuses, target types, ledger kinds and ranking windows are frozen sets', () => {
    expect(OPERATION_STATUSES).toEqual(['pending', 'succeeded', 'reversed', 'failed']);
    expect(OPERATION_TARGET_TYPES).toEqual([
      'student',
      'class',
      'household',
      'wallet',
      'fine_order',
      'fine_rule',
      'operation',
    ]);
    expect(LEDGER_DIRECTIONS).toEqual(['credit', 'debit']);
    expect(LEDGER_KINDS).toEqual(['student_score', 'class_score', 'coin', 'fine']);
    expect(RANKING_WINDOWS).toEqual(['weekly', 'monthly', 'all_time']);
    expect(FINE_STATUSES).toEqual(['pending', 'settled', 'cancelled', 'reversed']);
    expect(ROLE_CODES_FOR_AUTHZ).toContain('teacher');
    expect(ROLE_CODES_FOR_AUTHZ).toContain('admin');
  });

  it('guards reject non-members without leaking through', () => {
    expect(isOperationKind('student_score_apply')).toBe(true);
    expect(isOperationKind('student_score_grant')).toBe(false);
    expect(isOperationStatus('succeeded')).toBe(true);
    expect(isOperationStatus('done')).toBe(false);
    expect(isOperationTargetType('student')).toBe(true);
    expect(isOperationTargetType('teacher')).toBe(false);
    expect(isLedgerDirection('credit')).toBe(true);
    expect(isLedgerDirection('income')).toBe(false);
    expect(isLedgerKind('coin')).toBe(true);
    expect(isLedgerKind('crypto')).toBe(false);
    expect(isRankingWindow('weekly')).toBe(true);
    expect(isRankingWindow('daily')).toBe(false);
    expect(isFineStatus('settled')).toBe(true);
    expect(isFineStatus('paid')).toBe(false);
    expect(isAuthorizedRoleCode('teacher')).toBe(true);
    expect(isAuthorizedRoleCode('root')).toBe(false);
  });
});

describe('invariant constants', () => {
  it('score delta range covers negative and positive integers around a bounded envelope', () => {
    expect(Number.isInteger(SCORE_DELTA_MIN)).toBe(true);
    expect(Number.isInteger(SCORE_DELTA_MAX)).toBe(true);
    expect(SCORE_DELTA_MIN).toBeLessThan(0);
    expect(SCORE_DELTA_MAX).toBeGreaterThan(0);
  });

  it('minimum balance is zero and reason length is bounded', () => {
    expect(MIN_BALANCE).toBe(0);
    expect(MAX_REASON_LENGTH).toBeGreaterThan(0);
    expect(IDEMPOTENCY_KEY_MIN_LENGTH).toBeGreaterThanOrEqual(16);
  });
});

describe('domain error catalog', () => {
  it('exposes stable error codes covering the governance surface', () => {
    expect(DOMAIN_ERROR_CODES).toContain('E_INTEGER_REQUIRED');
    expect(DOMAIN_ERROR_CODES).toContain('E_BALANCE_NEGATIVE');
    expect(DOMAIN_ERROR_CODES).toContain('E_IDEMPOTENCY_CONFLICT');
    expect(DOMAIN_ERROR_CODES).toContain('E_OPERATION_ALREADY_REVERSED');
    expect(DOMAIN_ERROR_CODES).toContain('E_OPERATION_NOT_APPLIED');
    expect(DOMAIN_ERROR_CODES).toContain('E_REASON_REQUIRED');
    expect(DOMAIN_ERROR_CODES).toContain('E_REASON_TOO_LONG');
    expect(DOMAIN_ERROR_CODES).toContain('E_UNKNOWN_OPERATION_KIND');
    expect(DOMAIN_ERROR_CODES).toContain('E_INVALID_STATE_TRANSITION');
    expect(DOMAIN_ERROR_CODES).toContain('E_REVERSAL_MISMATCH');
  });

  it('guards unknown codes', () => {
    expect(isDomainErrorCode('E_INTEGER_REQUIRED')).toBe(true);
    expect(isDomainErrorCode('E_MISSING')).toBe(false);
  });

  it('DomainError preserves code, message, cause and path', () => {
    const cause = new Error('root');
    const error = new DomainError('E_INVALID_INPUT', 'bad payload', {
      cause,
      path: 'actorId',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('E_INVALID_INPUT');
    expect(error.message).toBe('bad payload');
    expect(error.cause).toBe(cause);
    expect(error.path).toBe('actorId');
  });
});

describe('integer and balance invariants', () => {
  it('accepts integers only', () => {
    expect(isIntegerValue(1)).toBe(true);
    expect(isIntegerValue(0)).toBe(true);
    expect(isIntegerValue(-3)).toBe(true);
    expect(isIntegerValue(1.5)).toBe(false);
    expect(isIntegerValue(Number.NaN)).toBe(false);
    expect(isIntegerValue('1')).toBe(false);
  });

  it('assertIntegerBalance rejects fractional balances', () => {
    let caught: DomainError | undefined;
    try {
      assertIntegerBalance(1.5);
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INTEGER_REQUIRED');
  });

  it('assertIntegerBalance rejects negative balances', () => {
    let caught: DomainError | undefined;
    try {
      assertIntegerBalance(-1);
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_BALANCE_NEGATIVE');
  });

  it('assertIntegerBalance accepts zero and positive integers', () => {
    expect(() => assertIntegerBalance(0)).not.toThrow();
    expect(() => assertIntegerBalance(100)).not.toThrow();
  });
});
