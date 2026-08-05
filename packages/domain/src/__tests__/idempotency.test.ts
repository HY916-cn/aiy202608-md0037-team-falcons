import { describe, expect, it } from 'vitest';

import {
  DomainError,
  InMemoryIdempotencyStore,
  createPendingOperation,
  fingerprintCommand,
  markOperationApplied,
  stableJson,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type IdempotencyRecord,
  type Timestamp,
  type Uuid,
} from '../index';

const OP_ID = 'op-88888888-8888-4888-8888-888888888888' as Uuid;
const ACTOR_ID = 'ac-99999999-9999-4999-8999-999999999999' as Uuid;
const TARGET_ID = 'tg-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as Uuid;
const KEY_A = 'test-idempotency-store-fixture' as IdempotencyKey;
const KEY_B = 'test-idempotency-other-fixture' as IdempotencyKey;
const NOW = '2026-08-04T02:00:00Z' as Timestamp;
const LATER = '2026-08-04T02:05:00Z' as Timestamp;

const command: AuthorizedOperationCommand = {
  kind: 'student_score_apply',
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
  it('produces a stable string from kind/actor/target/payload regardless of object key order', () => {
    const a = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { delta: 2, reason: '值日' },
    });
    const b = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { reason: '值日', delta: 2 },
    });
    expect(a).toBe(b);
  });

  it('recursively sorts nested object keys but preserves array order', () => {
    const a = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { nested: { z: 1, a: 2, m: [3, 1, 2] } },
    });
    const b = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { nested: { a: 2, m: [3, 1, 2], z: 1 } },
    });
    expect(a).toBe(b);

    const arrReordered = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { nested: { a: 2, m: [1, 2, 3], z: 1 } },
    });
    // Different array order => different fingerprint.
    expect(arrReordered).not.toBe(a);
  });

  it('differs when the payload value differs (1 vs "1" must not collide)', () => {
    const a = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { value: 1 },
    });
    const b = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { value: '1' },
    });
    expect(a).not.toBe(b);
  });

  it('distinguishes boolean, null and numeric zero', () => {
    const asBool = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { v: false },
    });
    const asNumber = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { v: 0 },
    });
    const asNull = fingerprintCommand({
      kind: 'student_score_apply',
      actorId: ACTOR_ID,
      targetType: 'student',
      targetId: TARGET_ID,
      payload: { v: null },
    });
    expect(asBool).not.toBe(asNumber);
    expect(asBool).not.toBe(asNull);
    expect(asNumber).not.toBe(asNull);
  });

  it('rejects non-finite numbers with E_INVALID_INPUT', () => {
    let caught: DomainError | undefined;
    try {
      fingerprintCommand({
        kind: 'student_score_apply',
        actorId: ACTOR_ID,
        targetType: 'student',
        targetId: TARGET_ID,
        payload: { v: Number.POSITIVE_INFINITY },
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_INPUT');
  });

  it('rejects unsupported types (undefined / function / symbol) via stableJson', () => {
    for (const value of [undefined, () => 1, Symbol('x')]) {
      let caught: DomainError | undefined;
      try {
        stableJson({ v: value });
      } catch (error) {
        caught = error as DomainError;
      }
      expect(caught?.code).toBe('E_INVALID_INPUT');
    }
  });
});

describe('InMemoryIdempotencyStore', () => {
  it('first reserve returns reserved; second reserve while still pending returns replay-pending', () => {
    const store = new InMemoryIdempotencyStore();
    const fp = 'fp-1';
    const record = makeReservationRecord(KEY_A, fp);

    const first = store.reserve(record);
    expect(first.outcome).toBe('reserved');

    const second = store.reserve(record);
    expect(second.outcome).toBe('replay-pending');
    if (second.outcome === 'replay-pending') {
      expect(second.record.key).toBe(KEY_A);
      expect(second.record.fingerprint).toBe(fp);
      expect(second.record.status).toBe('pending');
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

  it('reserve refuses a non-pending record via E_INVALID_STATE_TRANSITION', () => {
    const store = new InMemoryIdempotencyStore();
    let caught: DomainError | undefined;
    try {
      store.reserve({
        key: KEY_A,
        fingerprint: 'fp',
        operation: null,
        status: 'succeeded',
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });

  it('complete promotes pending to succeeded and later replays as replay-completed', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-a'));

    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command, now: NOW }),
      LATER,
    );
    const completed = store.complete(KEY_A, applied, 'succeeded');
    expect(completed.status).toBe('succeeded');
    expect(completed.operation?.id).toBe(OP_ID);

    const stored = store.get(KEY_A);
    expect(stored?.status).toBe('succeeded');

    const replay = store.reserve(makeReservationRecord(KEY_A, 'fp-a'));
    expect(replay.outcome).toBe('replay-completed');
    if (replay.outcome === 'replay-completed') {
      expect(replay.record.status).toBe('succeeded');
      expect(replay.record.operation?.id).toBe(OP_ID);
    }
  });

  it('complete refuses to overwrite a terminal status (succeeded -> succeeded) via E_INVALID_STATE_TRANSITION', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-a'));
    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command, now: NOW }),
      LATER,
    );
    store.complete(KEY_A, applied, 'succeeded');

    let caught: DomainError | undefined;
    try {
      store.complete(KEY_A, applied, 'succeeded');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });

  it('complete refuses to overwrite succeeded with failed', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-a'));
    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command, now: NOW }),
      LATER,
    );
    store.complete(KEY_A, applied, 'succeeded');

    let caught: DomainError | undefined;
    try {
      store.complete(KEY_A, applied, 'failed');
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INVALID_STATE_TRANSITION');
  });

  it('complete rejects an operation whose idempotencyKey does not match the reservation key', () => {
    const store = new InMemoryIdempotencyStore();
    store.reserve(makeReservationRecord(KEY_A, 'fp-a'));

    // Operation was built with KEY_B but caller uses KEY_A → conflict.
    const mismatchedCommand: AuthorizedOperationCommand = {
      ...command,
      idempotencyKey: KEY_B,
    };
    const applied = markOperationApplied(
      createPendingOperation({ id: OP_ID, command: mismatchedCommand, now: NOW }),
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
