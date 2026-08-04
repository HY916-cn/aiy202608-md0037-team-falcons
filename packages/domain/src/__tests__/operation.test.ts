import { describe, expect, it } from 'vitest';

import {
  DomainError,
  assertOperationTransition,
  canTransitionOperation,
  createPendingOperation,
  markOperationApplied,
  markOperationFailed,
  markOperationReversed,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type Timestamp,
  type Uuid,
} from '../index';

const OP_ID = 'op-11111111-1111-4111-8111-111111111111' as Uuid;
const ACTOR_ID = 'ac-22222222-2222-4222-8222-222222222222' as Uuid;
const TARGET_ID = 'tg-33333333-3333-4333-8333-333333333333' as Uuid;
const NOW = '2026-08-04T00:00:00Z' as Timestamp;
const LATER = '2026-08-04T00:05:00Z' as Timestamp;

const command: AuthorizedOperationCommand = {
  kind: 'student_score_adjust',
  actorId: ACTOR_ID,
  actorRole: 'teacher',
  idempotencyKey: 'test-idempotency-operation-fixture' as IdempotencyKey,
  reason: '值日出勤',
  targetType: 'student',
  targetId: TARGET_ID,
  requestId: 'req-1',
};

describe('operation state machine', () => {
  it('allows pending -> applied and pending -> failed', () => {
    expect(canTransitionOperation('pending', 'applied')).toBe(true);
    expect(canTransitionOperation('pending', 'failed')).toBe(true);
  });

  it('allows applied -> reversed only', () => {
    expect(canTransitionOperation('applied', 'reversed')).toBe(true);
    expect(canTransitionOperation('applied', 'failed')).toBe(false);
    expect(canTransitionOperation('applied', 'pending')).toBe(false);
  });

  it('forbids any transition out of reversed or failed', () => {
    expect(canTransitionOperation('reversed', 'applied')).toBe(false);
    expect(canTransitionOperation('reversed', 'pending')).toBe(false);
    expect(canTransitionOperation('failed', 'applied')).toBe(false);
    expect(canTransitionOperation('failed', 'reversed')).toBe(false);
  });

  it('assertOperationTransition throws E_INVALID_STATE_TRANSITION for illegal moves', () => {
    let caught: DomainError | undefined;
    try {
      assertOperationTransition('reversed', 'applied');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });
});

describe('operation record builders', () => {
  it('createPendingOperation produces a fully populated pending record', () => {
    const record = createPendingOperation({ id: OP_ID, command, now: NOW });
    expect(record.id).toBe(OP_ID);
    expect(record.status).toBe('pending');
    expect(record.kind).toBe('student_score_adjust');
    expect(record.actorId).toBe(ACTOR_ID);
    expect(record.actorRole).toBe('teacher');
    expect(record.targetType).toBe('student');
    expect(record.targetId).toBe(TARGET_ID);
    expect(record.idempotencyKey).toBe(command.idempotencyKey);
    expect(record.reason).toBe('值日出勤');
    expect(record.createdAt).toBe(NOW);
    expect(record.appliedAt).toBeNull();
    expect(record.reversedAt).toBeNull();
    expect(record.metadata).toEqual({});
  });

  it('markOperationApplied transitions pending to applied and stamps appliedAt', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const applied = markOperationApplied(pending, LATER);
    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).toBe(LATER);
    // original stays immutable
    expect(pending.status).toBe('pending');
  });

  it('markOperationFailed transitions pending to failed', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const failed = markOperationFailed(pending);
    expect(failed.status).toBe('failed');
  });

  it('markOperationReversed requires applied state; rejects double reversal', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const applied = markOperationApplied(pending, LATER);
    const reversed = markOperationReversed(applied, LATER);
    expect(reversed.status).toBe('reversed');
    expect(reversed.reversedAt).toBe(LATER);

    let caught: DomainError | undefined;
    try {
      markOperationReversed(reversed, LATER);
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });

  it('markOperationApplied on already-applied throws', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const applied = markOperationApplied(pending, LATER);
    let caught: DomainError | undefined;
    try {
      markOperationApplied(applied, LATER);
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });
});
