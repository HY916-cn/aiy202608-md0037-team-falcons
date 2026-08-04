import { describe, expect, it } from 'vitest';

import {
  DomainError,
  InMemoryIdempotencyStore,
  createPendingOperation,
  fingerprintCommand,
  markOperationApplied,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type IdempotencyRecord,
  type Timestamp,
  type Uuid,
} from '../index';

const OP_ID = 'op-88888888-8888-4888-8888-888888888888' as Uuid;
const ACTOR_ID = 'ac-99999999-9999-4999-8999-999999999999' as Uuid;
const TARGET_ID = 'tg-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as Uuid;
const KEY_A = 'ck-2026-idem-a-XYZ' as IdempotencyKey;
const NOW = '2026-08-04T02:00:00Z' as Timestamp;
const LATER = '2026-08-04T02:05:00Z' as Timestamp;

const command: AuthorizedOperationCommand = {
  kind: 'student_score_adjust',
  actorId: ACTOR_ID,
  actorRole: 'teacher',
  idempotencyKey: KEY_A,
  reason: '值日',
  targetType: 'student',
  targetId: TARGET_ID,
  requestId: 'req-idem',
};

function makeReservationRecord(
  key: IdempotencyKey,
  fingerprint: string,
): IdempotencyRecord {
  return { key, fingerprint, operation: null, status: 'pending' };
}

describe('fingerprintCommand', () => {
  it('produces a stable string from kind/actor/target/payload', () => {
    const a = fingerprintCommand({
      kind: 'student_score_adjust',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { delta: 2, reason: '值日' },
    });
    const b = fingerprintCommand({
      kind: 'student_score_adjust',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { reason: '值日', delta: 2 },
    });
    expect(a).toBe(b);
  });

  it('differs when the payload differs', () => {
    const a = fingerprintCommand({
      kind: 'student_score_adjust',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { delta: 2 },
    });
    const b = fingerprintCommand({
      kind: 'student_score_adjust',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { delta: 3 },
    });
    expect(a).not.toBe(b);
  });
});

describe('InMemoryIdempotencyStore', () => {
  it('first reserve returns reserved; second reserve with same fingerprint replays', () => {
    const store = new InMemoryIdempotencyStore();
    const fp = 'fp-1';
    const record = makeReservationRecord(KEY_A, fp);

    const first = store.reserve(record);
    expect(first.outcome).toBe('reserved');

    const second = store.reserve(record);
    expect(second.outcome).toBe('replay');
    if (second.outcome === 'replay') {
      expect(second.record.key).toBe(KEY_A);
      expect(second.record.fingerprint).toBe(fp);
    }
  });

  it('reserve with same key but different fingerprint throws E_IDEMPOTENCY_CONFLICT', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-original'));

    let caught: DomainError | undefined;
    try {
      store.reserve(makeReservationRecord(KEY_A, 'fp-different'));
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_IDEMPOTENCY_CONFLICT');
  });

  it('complete promotes the record to succeeded and preserves it for later replay', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-a'));

    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command, now: NOW }),
      LATER,
    );
    store.complete(KEY_A, applied, 'succeeded');

    const stored = store.get(KEY_A);
    expect(stored?.status).toBe('succeeded');
    expect(stored?.operation?.id).toBe(OP_ID);

    // A replay after completion still returns the completed record.
    const replay = store.reserve(makeReservationRecord(KEY_A, 'fp-a'));
    expect(replay.outcome).toBe('replay');
    if (replay.outcome === 'replay') {
      expect(replay.record.status).toBe('succeeded');
      expect(replay.record.operation?.id).toBe(OP_ID);
    }
  });

  it('complete without prior reservation throws E_IDEMPOTENCY_CONFLICT', () => {
    const store = new InMemoryIdempotencyStore();
    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command, now: NOW }),
      LATER,
    );

    let caught: DomainError | undefined;
    try {
      store.complete(KEY_A, applied, 'succeeded');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_IDEMPOTENCY_CONFLICT');
  });
});
