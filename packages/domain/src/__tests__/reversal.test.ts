import { describe, expect, it } from 'vitest';

import {
  DomainError,
  buildLedgerEntry,
  buildReversal,
  createPendingOperation,
  markOperationApplied,
  markOperationFailed,
  previewReversal,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type LedgerEntry,
  type OperationRecord,
  type Timestamp,
  type Uuid,
} from '../index';

const ORIG_OP_ID = 'op-11112222-3333-4444-8555-666677778888' as Uuid;
const REV_OP_ID = 'op-aaaabbbb-cccc-4ddd-8eee-ffff00001111' as Uuid;
const LINK_ID = 'rl-22223333-4444-4555-8666-777788889999' as Uuid;
const ORIG_ENTRY_ID = 'le-33334444-5555-4666-8777-888899990000' as Uuid;
const REV_ENTRY_ID = 'le-44445555-6666-4777-8888-99990000aaaa' as Uuid;
const ACTOR_ID = 'ac-55556666-7777-4888-8999-0000aaaabbbb' as Uuid;
const REV_ACTOR_ID = 'ac-66667777-8888-4999-8aaa-bbbbccccdddd' as Uuid;
const TARGET_ID = 'tg-77778888-9999-4aaa-8bbb-ccccddddeeee' as Uuid;
const SUBJECT_ID = 'st-88889999-aaaa-4bbb-8ccc-ddddeeeeffff' as Uuid;
const NOW = '2026-08-04T04:00:00Z' as Timestamp;
const LATER = '2026-08-04T04:05:00Z' as Timestamp;

const origCommand: AuthorizedOperationCommand = {
  kind: 'student_score_apply',
  actorId: ACTOR_ID,
  actorRole: 'teacher',
  idempotencyKey: 'test-idempotency-reversal-orig' as IdempotencyKey,
  reason: '值日出勤',
  targetType: 'student',
  targetId: TARGET_ID,
  requestId: 'req-orig',
};

function seedAppliedWithEntry(): {
  operation: OperationRecord;
  entry: LedgerEntry;
} {
  const pending = createPendingOperation({
    id: ORIG_OP_ID,
    command: origCommand,
    now: NOW,
  });
  const operation = markOperationApplied(pending, NOW);
  const entry = buildLedgerEntry({
    id: ORIG_ENTRY_ID,
    kind: 'student_score',
    direction: 'credit',
    amount: 2,
    subjectId: SUBJECT_ID,
    operationId: ORIG_OP_ID,
    reason: '值日出勤',
    now: NOW,
  });
  return { operation, entry };
}

describe('previewReversal', () => {
  it('returns planned reverse entries without mutating state', () => {
    const { operation, entry } = seedAppliedWithEntry();
    const preview = previewReversal({
      original: operation,
      originalEntries: [entry],
      plannedReversalOperationId: REV_OP_ID,
      plannedEntryIds: [REV_ENTRY_ID],
      reason: '撤销值日',
      now: LATER,
    });
    expect(preview.originalOperation.status).toBe('succeeded');
    expect(preview.plannedReverseEntries).toHaveLength(1);
    const [planned] = preview.plannedReverseEntries;
    expect(planned?.direction).toBe('debit');
    expect(planned?.amount).toBe(entry.amount);
    expect(planned?.reverseOfEntryId).toBe(entry.id);
    expect(planned?.operationId).toBe(REV_OP_ID);
  });

  it('rejects mismatched entry id list length with E_REVERSAL_MISMATCH', () => {
    const { operation, entry } = seedAppliedWithEntry();
    let caught: DomainError | undefined;
    try {
      previewReversal({
        original: operation,
        originalEntries: [entry],
        plannedReversalOperationId: REV_OP_ID,
        plannedEntryIds: [],
        reason: '撤销',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REVERSAL_MISMATCH');
  });

  it('rejects an empty original entry list with E_REVERSAL_MISMATCH', () => {
    const { operation } = seedAppliedWithEntry();
    let caught: DomainError | undefined;
    try {
      previewReversal({
        original: operation,
        originalEntries: [],
        plannedReversalOperationId: REV_OP_ID,
        plannedEntryIds: [],
        reason: '撤销',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REVERSAL_MISMATCH');
  });

  it('rejects duplicate original entry ids with E_REVERSAL_MISMATCH', () => {
    const { operation, entry } = seedAppliedWithEntry();
    let caught: DomainError | undefined;
    try {
      previewReversal({
        original: operation,
        originalEntries: [entry, entry],
        plannedReversalOperationId: REV_OP_ID,
        plannedEntryIds: [REV_ENTRY_ID, 'le-different-4444-4444-8444-444444444444' as Uuid],
        reason: '撤销',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REVERSAL_MISMATCH');
  });

  it('rejects duplicate plannedEntryIds with E_REVERSAL_MISMATCH', () => {
    const { operation, entry } = seedAppliedWithEntry();
    const secondEntry = buildLedgerEntry({
      id: 'le-second-4222-4222-8222-222222222222' as Uuid,
      kind: 'student_score',
      direction: 'credit',
      amount: 1,
      subjectId: SUBJECT_ID,
      operationId: ORIG_OP_ID,
      reason: '值日',
      now: NOW,
    });
    let caught: DomainError | undefined;
    try {
      previewReversal({
        original: operation,
        originalEntries: [entry, secondEntry],
        plannedReversalOperationId: REV_OP_ID,
        plannedEntryIds: [REV_ENTRY_ID, REV_ENTRY_ID],
        reason: '撤销',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REVERSAL_MISMATCH');
  });
});

describe('buildReversal preconditions', () => {
  it('rejects reversing a non-succeeded (pending) operation with E_OPERATION_NOT_APPLIED', () => {
    const pending = createPendingOperation({
      id: ORIG_OP_ID,
      command: origCommand,
      now: NOW,
    });
    let caught: DomainError | undefined;
    try {
      buildReversal({
        original: pending,
        originalEntries: [],
        actorId: REV_ACTOR_ID,
        actorRole: 'admin',
        reason: '撤销',
        reversalOperationId: REV_OP_ID,
        reversalLinkId: LINK_ID,
        plannedEntryIds: [],
        idempotencyKey: 'test-idempotency-reversal-pending' as IdempotencyKey,
        requestId: 'req-rev',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_OPERATION_NOT_APPLIED');
  });

  it('rejects reversing a failed operation with E_OPERATION_NOT_APPLIED', () => {
    const pending = createPendingOperation({
      id: ORIG_OP_ID,
      command: origCommand,
      now: NOW,
    });
    const failed = markOperationFailed(pending);
    let caught: DomainError | undefined;
    try {
      buildReversal({
        original: failed,
        originalEntries: [],
        actorId: REV_ACTOR_ID,
        actorRole: 'admin',
        reason: '撤销',
        reversalOperationId: REV_OP_ID,
        reversalLinkId: LINK_ID,
        plannedEntryIds: [],
        idempotencyKey: 'test-idempotency-reversal-failed' as IdempotencyKey,
        requestId: 'req-rev',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_OPERATION_NOT_APPLIED');
  });

  it('rejects reversing an entry that does not belong to the original operation (E_REVERSAL_MISMATCH)', () => {
    const { operation } = seedAppliedWithEntry();
    const foreign = buildLedgerEntry({
      id: ORIG_ENTRY_ID,
      kind: 'student_score',
      direction: 'credit',
      amount: 2,
      subjectId: SUBJECT_ID,
      operationId: 'op-99999999-9999-4999-8999-999999999999' as Uuid,
      reason: '外部',
      now: NOW,
    });
    let caught: DomainError | undefined;
    try {
      buildReversal({
        original: operation,
        originalEntries: [foreign],
        actorId: REV_ACTOR_ID,
        actorRole: 'admin',
        reason: '撤销',
        reversalOperationId: REV_OP_ID,
        reversalLinkId: LINK_ID,
        plannedEntryIds: [REV_ENTRY_ID],
        idempotencyKey: 'test-idempotency-reversal-mismatch' as IdempotencyKey,
        requestId: 'req-rev',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_REVERSAL_MISMATCH');
  });

  it('rejects reversing a reversal (E_INVALID_REVOKE_TARGET)', () => {
    const pending = createPendingOperation({
      id: ORIG_OP_ID,
      command: { ...origCommand, kind: 'reversal_apply', targetType: 'operation' },
      now: NOW,
    });
    const applied = markOperationApplied(pending, NOW);
    let caught: DomainError | undefined;
    try {
      buildReversal({
        original: applied,
        originalEntries: [],
        actorId: REV_ACTOR_ID,
        actorRole: 'admin',
        reason: '再撤销',
        reversalOperationId: REV_OP_ID,
        reversalLinkId: LINK_ID,
        plannedEntryIds: [],
        idempotencyKey: 'test-idempotency-reversal-nested' as IdempotencyKey,
        requestId: 'req-rev',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_REVOKE_TARGET');
  });
});

describe('buildReversal happy path and idempotency of intent', () => {
  it('produces reversed original, succeeded reversal op, link and reverse entries', () => {
    const { operation, entry } = seedAppliedWithEntry();
    const result = buildReversal({
      original: operation,
      originalEntries: [entry],
      actorId: REV_ACTOR_ID,
      actorRole: 'admin',
      reason: '记录错误',
      reversalOperationId: REV_OP_ID,
      reversalLinkId: LINK_ID,
      plannedEntryIds: [REV_ENTRY_ID],
      idempotencyKey: 'test-idempotency-reversal-happy' as IdempotencyKey,
      requestId: 'req-rev',
      now: LATER,
    });

    // Original moves to reversed but original amount/direction on entry is untouched.
    expect(result.updatedOriginal.status).toBe('reversed');
    expect(result.updatedOriginal.reversedAt).toBe(LATER);
    // Original entry object stays untouched: buildReversal only adds new reverse entries.
    expect(entry.direction).toBe('credit');
    expect(entry.amount).toBe(2);
    expect(entry.reverseOfEntryId).toBeNull();

    expect(result.reversalOperation.status).toBe('succeeded');
    expect(result.reversalOperation.kind).toBe('reversal_apply');
    expect(result.reversalOperation.actorId).toBe(REV_ACTOR_ID);
    expect(result.reversalOperation.targetType).toBe('operation');
    expect(result.reversalOperation.targetId).toBe(operation.id);

    expect(result.reversalLink.id).toBe(LINK_ID);
    expect(result.reversalLink.originalOperationId).toBe(operation.id);
    expect(result.reversalLink.reversalOperationId).toBe(REV_OP_ID);
    expect(result.reversalLink.actorId).toBe(REV_ACTOR_ID);
    expect(result.reversalLink.actorRole).toBe('admin');
    expect(result.reversalLink.reason).toBe('记录错误');

    expect(result.reverseEntries).toHaveLength(1);
    const [rev] = result.reverseEntries;
    expect(rev?.direction).toBe('debit');
    expect(rev?.amount).toBe(2);
    expect(rev?.reverseOfEntryId).toBe(entry.id);
    expect(rev?.operationId).toBe(REV_OP_ID);
  });

  it('refuses double reversal via E_OPERATION_ALREADY_REVERSED', () => {
    const { operation, entry } = seedAppliedWithEntry();
    const first = buildReversal({
      original: operation,
      originalEntries: [entry],
      actorId: REV_ACTOR_ID,
      actorRole: 'admin',
      reason: '第一次撤销',
      reversalOperationId: REV_OP_ID,
      reversalLinkId: LINK_ID,
      plannedEntryIds: [REV_ENTRY_ID],
      idempotencyKey: 'test-idempotency-reversal-first' as IdempotencyKey,
      requestId: 'req-rev-1',
      now: LATER,
    });

    let caught: DomainError | undefined;
    try {
      buildReversal({
        original: first.updatedOriginal,
        originalEntries: [entry],
        actorId: REV_ACTOR_ID,
        actorRole: 'admin',
        reason: '第二次撤销',
        reversalOperationId: 'op-second-rev-4111-8111-111111111111' as Uuid,
        reversalLinkId: 'rl-second-link-4222-8222-222222222222' as Uuid,
        plannedEntryIds: ['le-second-4333-4333-8333-333333333333' as Uuid],
        idempotencyKey: 'test-idempotency-reversal-second' as IdempotencyKey,
        requestId: 'req-rev-2',
        now: LATER,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_OPERATION_ALREADY_REVERSED');
  });
});
