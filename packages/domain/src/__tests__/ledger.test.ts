import { describe, expect, it } from 'vitest';

import {
  DomainError,
  buildLedgerEntry,
  buildReverseLedgerEntry,
  type Timestamp,
  type Uuid,
} from '../index';

const ENTRY_ID = 'le-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as Uuid;
const REV_ENTRY_ID = 'le-cccccccc-cccc-4ccc-8ccc-cccccccccccc' as Uuid;
const OP_ID = 'op-dddddddd-dddd-4ddd-8ddd-dddddddddddd' as Uuid;
const REV_OP_ID = 'op-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' as Uuid;
const SUBJECT_ID = 'st-ffffffff-ffff-4fff-8fff-ffffffffffff' as Uuid;
const NOW = '2026-08-04T03:00:00Z' as Timestamp;
const LATER = '2026-08-04T03:05:00Z' as Timestamp;

describe('buildLedgerEntry', () => {
  it('creates a fresh immutable entry with reverseOfEntryId=null', () => {
    const entry = buildLedgerEntry({
      id: ENTRY_ID,
      kind: 'coin',
      direction: 'credit',
      amount: 10,
      subjectId: SUBJECT_ID,
      operationId: OP_ID,
      reason: '奖励',
      now: NOW,
    });
    expect(entry.id).toBe(ENTRY_ID);
    expect(entry.kind).toBe('coin');
    expect(entry.direction).toBe('credit');
    expect(entry.amount).toBe(10);
    expect(entry.reverseOfEntryId).toBeNull();
    expect(entry.operationId).toBe(OP_ID);
    expect(entry.createdAt).toBe(NOW);
  });

  it('rejects non-integer amount with E_INTEGER_REQUIRED', () => {
    let caught: DomainError | undefined;
    try {
      buildLedgerEntry({
        id: ENTRY_ID,
        kind: 'coin',
        direction: 'credit',
        amount: 1.5,
        subjectId: SUBJECT_ID,
        operationId: OP_ID,
        reason: '奖励',
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INTEGER_REQUIRED');
  });

  it('rejects zero and negative amount with E_AMOUNT_OUT_OF_RANGE', () => {
    for (const bad of [0, -1]) {
      let caught: DomainError | undefined;
      try {
        buildLedgerEntry({
          id: ENTRY_ID,
          kind: 'coin',
          direction: 'credit',
          amount: bad,
          subjectId: SUBJECT_ID,
          operationId: OP_ID,
          reason: 'x',
          now: NOW,
        });
      } catch (error) {
        caught = error as DomainError;
      }
      expect(caught?.code).toBe('E_AMOUNT_OUT_OF_RANGE');
    }
  });
});

describe('buildReverseLedgerEntry', () => {
  it('flips direction and preserves amount and subject', () => {
    const original = buildLedgerEntry({
      id: ENTRY_ID,
      kind: 'coin',
      direction: 'credit',
      amount: 10,
      subjectId: SUBJECT_ID,
      operationId: OP_ID,
      reason: '奖励',
      now: NOW,
    });
    const reverse = buildReverseLedgerEntry({
      id: REV_ENTRY_ID,
      original,
      reversalOperationId: REV_OP_ID,
      reason: '撤销奖励',
      now: LATER,
    });
    expect(reverse.direction).toBe('debit');
    expect(reverse.amount).toBe(10);
    expect(reverse.subjectId).toBe(SUBJECT_ID);
    expect(reverse.operationId).toBe(REV_OP_ID);
    expect(reverse.reverseOfEntryId).toBe(ENTRY_ID);
    expect(reverse.createdAt).toBe(LATER);
    // original untouched (immutability)
    expect(original.direction).toBe('credit');
    expect(original.reverseOfEntryId).toBeNull();
  });

  it('flips debit to credit', () => {
    const debit = buildLedgerEntry({
      id: ENTRY_ID,
      kind: 'fine',
      direction: 'debit',
      amount: 5,
      subjectId: SUBJECT_ID,
      operationId: OP_ID,
      reason: '罚款',
      now: NOW,
    });
    const reverse = buildReverseLedgerEntry({
      id: REV_ENTRY_ID,
      original: debit,
      reversalOperationId: REV_OP_ID,
      reason: '撤销罚款',
      now: LATER,
    });
    expect(reverse.direction).toBe('credit');
  });
});
