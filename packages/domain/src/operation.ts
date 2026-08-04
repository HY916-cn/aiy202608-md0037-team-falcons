import { DomainError } from './errors';
import type {
  IdempotencyKey,
  OperationKind,
  OperationStatus,
  OperationTargetType,
  Timestamp,
  Uuid,
} from './index';

/**
 * 授权后的领域操作命令。
 *
 * 严格禁止在外部 DTO 中携带 actorId、role 或 scope；
 * 客户端只能声明它想执行的动作 (kind、target、payload)。
 * actor / role / scope 必须由服务端从 JWT 和授权表计算后注入本类型，
 * 再交给领域层生成 OperationRecord。
 */
export interface AuthorizedOperationCommand {
  readonly kind: OperationKind;
  readonly actorId: Uuid;
  readonly actorRole: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason: string;
  readonly targetType: OperationTargetType;
  readonly targetId: Uuid;
  readonly requestId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OperationRecord {
  readonly id: Uuid;
  readonly kind: OperationKind;
  readonly status: OperationStatus;
  readonly actorId: Uuid;
  readonly actorRole: string;
  readonly targetType: OperationTargetType;
  readonly targetId: Uuid;
  readonly idempotencyKey: IdempotencyKey;
  readonly reason: string;
  readonly requestId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
  readonly appliedAt: Timestamp | null;
  readonly reversedAt: Timestamp | null;
}

const ALLOWED_TRANSITIONS: Readonly<Record<OperationStatus, readonly OperationStatus[]>> = {
  pending: ['applied', 'failed'],
  applied: ['reversed'],
  reversed: [],
  failed: [],
};

export function canTransitionOperation(
  from: OperationStatus,
  to: OperationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].some((next) => next === to);
}

export function assertOperationTransition(
  from: OperationStatus,
  to: OperationStatus,
): void {
  if (!canTransitionOperation(from, to)) {
    throw new DomainError(
      'E_INVALID_STATE_TRANSITION',
      `operation status transition ${from} -> ${to} is not allowed`,
    );
  }
}

export interface CreateOperationInput {
  readonly id: Uuid;
  readonly command: AuthorizedOperationCommand;
  readonly now: Timestamp;
}

/**
 * 从授权命令生成 pending 状态的 OperationRecord。
 * 不做写入，只是纯值构造，方便测试和事务前的准备。
 */
export function createPendingOperation(
  input: CreateOperationInput,
): OperationRecord {
  const { id, command, now } = input;
  return {
    id,
    kind: command.kind,
    status: 'pending',
    actorId: command.actorId,
    actorRole: command.actorRole,
    targetType: command.targetType,
    targetId: command.targetId,
    idempotencyKey: command.idempotencyKey,
    reason: command.reason,
    requestId: command.requestId,
    metadata: command.metadata ?? {},
    createdAt: now,
    appliedAt: null,
    reversedAt: null,
  };
}

export function markOperationApplied(
  operation: OperationRecord,
  at: Timestamp,
): OperationRecord {
  assertOperationTransition(operation.status, 'applied');
  return { ...operation, status: 'applied', appliedAt: at };
}

export function markOperationFailed(
  operation: OperationRecord,
): OperationRecord {
  assertOperationTransition(operation.status, 'failed');
  return { ...operation, status: 'failed' };
}

export function markOperationReversed(
  operation: OperationRecord,
  at: Timestamp,
): OperationRecord {
  assertOperationTransition(operation.status, 'reversed');
  return { ...operation, status: 'reversed', reversedAt: at };
}
