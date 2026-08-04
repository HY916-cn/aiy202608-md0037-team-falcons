import type { OperationRecord } from './operation';
import type { Timestamp, Uuid } from './index';

export type AuditResult = 'success' | 'failure';

export interface AuditEvent {
  readonly id: Uuid;
  readonly actorId: Uuid;
  readonly actorRole: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: Uuid;
  readonly requestId: string;
  readonly operationId: Uuid | null;
  readonly result: AuditResult;
  readonly errorCode: string | null;
  readonly createdAt: Timestamp;
}

export interface BuildAuditEventInput {
  readonly id: Uuid;
  readonly action: string;
  readonly result: AuditResult;
  readonly operation: OperationRecord;
  readonly now: Timestamp;
  readonly errorCode?: string;
}

/**
 * 从 OperationRecord 派生结构化 audit event。
 * 不允许持久化操作，纯值构造，便于测试和统一写入路径。
 */
export function buildAuditEvent(input: BuildAuditEventInput): AuditEvent {
  const { id, action, result, operation, now } = input;
  return {
    id,
    actorId: operation.actorId,
    actorRole: operation.actorRole,
    action,
    resourceType: operation.targetType,
    resourceId: operation.targetId,
    requestId: operation.requestId,
    operationId: operation.id,
    result,
    errorCode: input.errorCode ?? null,
    createdAt: now,
  };
}
