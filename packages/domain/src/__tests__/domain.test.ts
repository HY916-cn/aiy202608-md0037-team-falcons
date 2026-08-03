import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  DomainError,
  FINE_STATUSES,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  LEDGER_DIRECTIONS,
  MAX_REASON_LENGTH,
  MIN_BALANCE,
  OPERATION_KINDS,
  OPERATION_STATUSES,
  RANKING_WINDOWS,
  SCORE_DELTA_MAX,
  SCORE_DELTA_MIN,
  assertIntegerBalance,
  isDomainErrorCode,
  isFineStatus,
  isIntegerValue,
  isLedgerDirection,
  isOperationKind,
  isOperationStatus,
  isRankingWindow,
} from '../index';

describe('domain enums', () => {
  it('operations, statuses, ledger directions, ranking windows, fine statuses are frozen sets', () => {
    expect(OPERATION_KINDS).toContain('student_score_grant');
    expect(OPERATION_KINDS).toContain('reversal');
    expect(OPERATION_STATUSES).toEqual(['pending', 'applied', 'reversed', 'failed']);
    expect(LEDGER_DIRECTIONS).toEqual(['credit', 'debit']);
    expect(RANKING_WINDOWS).toEqual(['weekly', 'monthly', 'all_time']);
    expect(FINE_STATUSES).toEqual(['pending', 'settled', 'cancelled']);
  });

  it('guards reject non-members without leaking through', () => {
    expect(isOperationKind('student_score_grant')).toBe(true);
    expect(isOperationKind('unknown_kind')).toBe(false);

    expect(isOperationStatus('applied')).toBe(true);
    expect(isOperationStatus('done')).toBe(false);

    expect(isLedgerDirection('credit')).toBe(true);
    expect(isLedgerDirection('income')).toBe(false);

    expect(isRankingWindow('weekly')).toBe(true);
    expect(isRankingWindow('daily')).toBe(false);

    expect(isFineStatus('settled')).toBe(true);
    expect(isFineStatus('paid')).toBe(false);
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
    expect(DOMAIN_ERROR_CODES).toContain('E_OPERATION_ALREADY_REVOKED');
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
    expect(() => assertIntegerBalance(1.5)).toThrowError(
      expect.objectContaining({ code: 'E_INTEGER_REQUIRED' }),
    );
  });

  it('assertIntegerBalance rejects negative balances', () => {
    expect(() => assertIntegerBalance(-1)).toThrowError(
      expect.objectContaining({ code: 'E_BALANCE_NEGATIVE' }),
    );
  });

  it('assertIntegerBalance accepts zero and positive integers', () => {
    expect(() => assertIntegerBalance(0)).not.toThrow();
    expect(() => assertIntegerBalance(100)).not.toThrow();
  });
});
