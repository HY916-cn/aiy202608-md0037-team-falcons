import { describe, expect, it } from 'vitest';

import {
  DomainError,
  buildLedgerEntry,
  buildReverseLedgerEntry,
  computeRanking,
  type LedgerEntry,
  type LedgerKind,
  type Timestamp,
  type Uuid,
} from '../index';

const SUBJECT_A = 'st-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as Uuid;
const SUBJECT_B = 'st-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as Uuid;
const SUBJECT_C = 'st-cccccccc-cccc-4ccc-8ccc-cccccccccccc' as Uuid;
const SUBJECT_D = 'st-dddddddd-dddd-4ddd-8ddd-dddddddddddd' as Uuid;
const OP_ID = 'op-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as Uuid;
const OP_ID_2 = 'op-ffffffff-ffff-4fff-8fff-ffffffffffff' as Uuid;
const REV_OP_ID = 'op-11112222-3333-4444-8555-666677778888' as Uuid;

const AT = '2026-08-04T12:00:00Z' as Timestamp;

let idSeq = 0;
function nextEntryId(): Uuid {
  idSeq += 1;
  const hex = idSeq.toString(16).padStart(12, '0');
  return `le-11112222-3333-4444-8555-${hex}` as Uuid;
}

function makeEntry(params: {
  subjectId: Uuid;
  direction: 'credit' | 'debit';
  amount: number;
  kind?: LedgerKind;
  createdAt?: Timestamp;
  operationId?: Uuid;
  reverseOfEntryId?: Uuid | null;
}): LedgerEntry {
  return buildLedgerEntry({
    id: nextEntryId(),
    kind: params.kind ?? 'student_score',
    direction: params.direction,
    amount: params.amount,
    subjectId: params.subjectId,
    operationId: params.operationId ?? OP_ID,
    reason: 'test',
    now: params.createdAt ?? AT,
  });
}

describe('computeRanking basic aggregation', () => {
  it('orders subjects by net score descending with unique ranks', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ subjectId: SUBJECT_A, direction: 'credit', amount: 10 }),
      makeEntry({ subjectId: SUBJECT_B, direction: 'credit', amount: 8 }),
      makeEntry({ subjectId: SUBJECT_C, direction: 'credit', amount: 5 }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    expect(ranking.map((r) => r.subjectId)).toEqual([
      SUBJECT_A,
      SUBJECT_B,
      SUBJECT_C,
    ]);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranking.map((r) => r.score)).toEqual([10, 8, 5]);
  });

  it('debits reduce net score; net can be negative', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ subjectId: SUBJECT_A, direction: 'credit', amount: 5 }),
      makeEntry({ subjectId: SUBJECT_A, direction: 'debit', amount: 3 }),
      makeEntry({ subjectId: SUBJECT_B, direction: 'debit', amount: 4 }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    const a = ranking.find((r) => r.subjectId === SUBJECT_A);
    const b = ranking.find((r) => r.subjectId === SUBJECT_B);
    expect(a?.score).toBe(2);
    expect(b?.score).toBe(-4);
    expect(a?.rank).toBe(1);
    expect(b?.rank).toBe(2);
  });
});

describe('computeRanking tie handling (standard competition ranking)', () => {
  it('assigns the same rank to tied scores and skips the next rank', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ subjectId: SUBJECT_A, direction: 'credit', amount: 10 }),
      makeEntry({ subjectId: SUBJECT_B, direction: 'credit', amount: 8 }),
      makeEntry({ subjectId: SUBJECT_C, direction: 'credit', amount: 8 }),
      makeEntry({ subjectId: SUBJECT_D, direction: 'credit', amount: 6 }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    // Expect ranks [1, 2, 2, 4]
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    // Same-score subjects are ordered by subjectId ascending for stability.
    expect(ranking[1]?.subjectId).toBe(SUBJECT_B);
    expect(ranking[2]?.subjectId).toBe(SUBJECT_C);
  });
});

describe('computeRanking window filtering', () => {
  const insideWeek = '2026-08-01T00:00:00Z' as Timestamp; // 3d before AT
  const outsideWeek = '2026-07-20T00:00:00Z' as Timestamp; // 15d before AT
  const outsideMonth = '2026-06-15T00:00:00Z' as Timestamp; // > 30d before AT

  it('weekly window excludes entries older than 7 days', () => {
    const entries: LedgerEntry[] = [
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 5,
        createdAt: insideWeek,
      }),
      makeEntry({
        subjectId: SUBJECT_B,
        direction: 'credit',
        amount: 100,
        createdAt: outsideWeek,
      }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'weekly',
      at: AT,
    });
    expect(ranking).toHaveLength(1);
    expect(ranking[0]?.subjectId).toBe(SUBJECT_A);
  });

  it('monthly window includes entries within last 30 days but excludes older', () => {
    const entries: LedgerEntry[] = [
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 5,
        createdAt: outsideWeek,
      }),
      makeEntry({
        subjectId: SUBJECT_B,
        direction: 'credit',
        amount: 100,
        createdAt: outsideMonth,
      }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'monthly',
      at: AT,
    });
    expect(ranking).toHaveLength(1);
    expect(ranking[0]?.subjectId).toBe(SUBJECT_A);
  });

  it('all_time window keeps every matching entry regardless of age', () => {
    const entries: LedgerEntry[] = [
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 5,
        createdAt: outsideMonth,
      }),
      makeEntry({
        subjectId: SUBJECT_B,
        direction: 'credit',
        amount: 100,
        createdAt: outsideMonth,
      }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    expect(ranking).toHaveLength(2);
  });
});

describe('computeRanking kind filtering', () => {
  it('ignores entries whose ledger kind does not match', () => {
    const entries: LedgerEntry[] = [
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 5,
        kind: 'student_score',
      }),
      makeEntry({
        subjectId: SUBJECT_B,
        direction: 'credit',
        amount: 999,
        kind: 'coin',
      }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    expect(ranking.map((r) => r.subjectId)).toEqual([SUBJECT_A]);
  });
});

describe('computeRanking reversal offsets original entries', () => {
  it('reverse ledger entries drop net back to zero', () => {
    const original = makeEntry({
      subjectId: SUBJECT_A,
      direction: 'credit',
      amount: 7,
    });
    const reverse = buildReverseLedgerEntry({
      id: nextEntryId(),
      original,
      reversalOperationId: REV_OP_ID,
      reason: '撤销',
      now: AT,
    });
    const ranking = computeRanking({
      entries: [original, reverse],
      kind: 'student_score',
      window: 'all_time',
      at: AT,
    });
    // With subjectIds hint we get a zero row for SUBJECT_A; without hint the
    // subject still appears because at least one entry mentions it.
    expect(ranking).toHaveLength(1);
    expect(ranking[0]?.subjectId).toBe(SUBJECT_A);
    expect(ranking[0]?.score).toBe(0);
    expect(ranking[0]?.rank).toBe(1);
  });
});

describe('computeRanking subjectIds hint', () => {
  it('includes explicitly listed subjects with zero score when they have no entries', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ subjectId: SUBJECT_A, direction: 'credit', amount: 3 }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'student_score',
      window: 'all_time',
      at: AT,
      subjectIds: [SUBJECT_A, SUBJECT_B],
    });
    expect(ranking.map((r) => r.subjectId)).toEqual([SUBJECT_A, SUBJECT_B]);
    expect(ranking.map((r) => r.score)).toEqual([3, 0]);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('computeRanking timestamp validation', () => {
  it('rejects invalid anchor timestamp with E_INVALID_TIMESTAMP for time-windowed rankings', () => {
    let caught: DomainError | undefined;
    try {
      computeRanking({
        entries: [],
        kind: 'student_score',
        window: 'weekly',
        at: 'not-a-timestamp' as Timestamp,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_TIMESTAMP');
  });
});

describe('computeRanking supports class_score kind and monthly window together', () => {
  it('aggregates class ledger entries independently from student ledger', () => {
    const entries: LedgerEntry[] = [
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 5,
        kind: 'class_score',
        operationId: OP_ID_2,
      }),
      makeEntry({
        subjectId: SUBJECT_B,
        direction: 'credit',
        amount: 3,
        kind: 'class_score',
        operationId: OP_ID_2,
      }),
      makeEntry({
        subjectId: SUBJECT_A,
        direction: 'credit',
        amount: 999,
        kind: 'student_score',
      }),
    ];
    const ranking = computeRanking({
      entries,
      kind: 'class_score',
      window: 'monthly',
      at: AT,
    });
    expect(ranking).toHaveLength(2);
    expect(ranking[0]?.subjectId).toBe(SUBJECT_A);
    expect(ranking[0]?.score).toBe(5);
    expect(ranking[1]?.subjectId).toBe(SUBJECT_B);
    expect(ranking[1]?.score).toBe(3);
  });
});
