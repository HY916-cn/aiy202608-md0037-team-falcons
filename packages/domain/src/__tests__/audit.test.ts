import { describe, expect, it } from 'vitest';

import {
  buildAuditEvent,
  createPendingOperation,
  markOperationApplied,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type Timestamp,
  type Uuid,
} from '../index';

const OP_ID = 'op-44444444-4444-4444-8444-444444444444' as Uuid;
const AUDIT_ID = 'au-55555555-5555-4555-8555-555555555555' as Uuid;
const ACTOR_ID = 'ac-66666666-6666-4666-8666-666666666666' as Uuid;
const TARGET_ID = 'tg-77777777-7777-4777-8777-777777777777' as Uuid;
const NOW = '2026-08-04T01:00:00Z' as Timestamp;
const LATER = '2026-08-04T01:05:00Z' as Timestamp;

const command: AuthorizedOperationCommand = {
  kind: 'coin_grant',
  actorId: ACTOR_ID,
  actorRole: 'bank_operator',
  idempotencyKey: 'test-idempotency-audit-fixture' as IdempotencyKey,
  reason: '奖励',
  targetType: 'student',
  targetId: TARGET_ID,
  requestId: 'req-audit',
};

describe('buildAuditEvent', () => {
  it('projects the actor and resource fields from the operation record', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const applied = markOperationApplied(pending, LATER);
    const event = buildAuditEvent({
      id: AUDIT_ID,
      action: 'operation.applied',
      result: 'success',
      operation: applied,
      now: LATER,
    });

    expect(event.id).toBe(AUDIT_ID);
    expect(event.actorId).toBe(ACTOR_ID);
    expect(event.actorRole).toBe('bank_operator');
    expect(event.action).toBe('operation.applied');
    expect(event.result).toBe('success');
    expect(event.resourceType).toBe('student');
    expect(event.resourceId).toBe(TARGET_ID);
    expect(event.operationId).toBe(OP_ID);
    expect(event.requestId).toBe('req-audit');
    expect(event.errorCode).toBeNull();
    expect(event.createdAt).toBe(LATER);
  });

  it('records failure results with an error code', () => {
    const pending = createPendingOperation({ id: OP_ID, command, now: NOW });
    const event = buildAuditEvent({
      id: AUDIT_ID,
      action: 'operation.failed',
      result: 'failure',
      operation: pending,
      now: LATER,
      errorCode: 'E_UNAUTHORIZED',
    });

    expect(event.result).toBe('failure');
    expect(event.errorCode).toBe('E_UNAUTHORIZED');
  });
});
