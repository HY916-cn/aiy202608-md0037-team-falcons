import { DomainError } from './errors';
import { buildReverseLedgerEntry, type LedgerEntry } from './ledger';
import {
  createPendingOperation,
  markOperationApplied,
  markOperationReversed,
  type AuthorizedOperationCommand,
  type OperationRecord,
} from './operation';
import type { AuthorizedRoleCode, Timestamp, Uuid } from './index';

/**
 * 反向操作与原操作的绑定。
 *  - 原操作不能被删除。
 *  - 同一原操作只能有一条有效 ReversalLink。
 *  - 需要保留操作者、原因、原操作和反向操作编号。
 */
export interface ReversalLink {
  readonly id: Uuid;
  readonly originalOperationId: Uuid;
  readonly reversalOperationId: Uuid;
  readonly actorId: Uuid;
  readonly actorRole: AuthorizedRoleCode;
  readonly reason: string;
  readonly createdAt: Timestamp;
}

export interface ReversalPreview {
  readonly originalOperation: OperationRecord;
  readonly originalEntries: readonly LedgerEntry[];
  readonly plannedReverseEntries: readonly LedgerEntry[];
}

export interface PreviewReversalInput {
  readonly original: OperationRecord;
  readonly originalEntries: readonly LedgerEntry[];
  readonly plannedReversalOperationId: Uuid;
  readonly plannedEntryIds: readonly Uuid[];
  readonly reason: string;
  readonly now: Timestamp;
}

/**
 * 计算反向影响并返回预览，不改变任何状态。
 *  - 原操作必须处于 succeeded 状态。
 *  - 原操作不能已经被标记 reversed。
 *  - 所有原流水必须与原操作 operationId 匹配。
 */
export function previewReversal(input: PreviewReversalInput): ReversalPreview {
  assertReversalPreconditions(input.original, input.originalEntries);
  assertPlannedEntryIds(input.plannedEntryIds, input.originalEntries.length);

  const plannedReverseEntries = input.originalEntries.map((original, index) => {
    const id = input.plannedEntryIds[index];
    if (id === undefined) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        'missing planned reverse entry id',
      );
    }
    return buildReverseLedgerEntry({
      id,
      original,
      reversalOperationId: input.plannedReversalOperationId,
      reason: input.reason,
      now: input.now,
    });
  });

  return {
    originalOperation: input.original,
    originalEntries: input.originalEntries,
    plannedReverseEntries,
  };
}

export interface BuildReversalInput {
  readonly original: OperationRecord;
  readonly originalEntries: readonly LedgerEntry[];
  readonly actorId: Uuid;
  readonly actorRole: AuthorizedRoleCode;
  readonly reason: string;
  readonly reversalOperationId: Uuid;
  readonly reversalLinkId: Uuid;
  readonly plannedEntryIds: readonly Uuid[];
  readonly idempotencyKey: OperationRecord['idempotencyKey'];
  readonly requestId: string;
  readonly now: Timestamp;
}

export interface BuildReversalResult {
  readonly updatedOriginal: OperationRecord;
  readonly reversalOperation: OperationRecord;
  readonly reversalLink: ReversalLink;
  readonly reverseEntries: readonly LedgerEntry[];
}

/**
 * 构造完整反向操作的纯值结果：
 *  - 新增 reversal OperationRecord (kind='reversal_apply', status='succeeded')
 *  - 新增 ReversalLink
 *  - 新增反向 LedgerEntry 列表
 *  - 原 OperationRecord 状态推进到 reversed
 * 全部为不可变新值，交给持久层在同一事务中写入。
 */
export function buildReversal(input: BuildReversalInput): BuildReversalResult {
  assertReversalPreconditions(input.original, input.originalEntries);
  assertPlannedEntryIds(input.plannedEntryIds, input.originalEntries.length);

  const command: AuthorizedOperationCommand = {
    kind: 'reversal_apply',
    actorId: input.actorId,
    actorRole: input.actorRole,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    targetType: 'operation',
    targetId: input.original.id,
    requestId: input.requestId,
    metadata: { originalOperationId: input.original.id },
  };

  const pendingReversal = createPendingOperation({
    id: input.reversalOperationId,
    command,
    now: input.now,
  });
  const appliedReversal = markOperationApplied(pendingReversal, input.now);

  const reverseEntries = input.originalEntries.map((original, index) => {
    const id = input.plannedEntryIds[index];
    if (id === undefined) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        'missing planned reverse entry id',
      );
    }
    return buildReverseLedgerEntry({
      id,
      original,
      reversalOperationId: input.reversalOperationId,
      reason: input.reason,
      now: input.now,
    });
  });

  const reversalLink: ReversalLink = {
    id: input.reversalLinkId,
    originalOperationId: input.original.id,
    reversalOperationId: input.reversalOperationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    reason: input.reason,
    createdAt: input.now,
  };

  const updatedOriginal = markOperationReversed(input.original, input.now);

  return {
    updatedOriginal,
    reversalOperation: appliedReversal,
    reversalLink,
    reverseEntries,
  };
}

function assertReversalPreconditions(
  original: OperationRecord,
  entries: readonly LedgerEntry[],
): void {
  if (original.kind === 'reversal_apply') {
    throw new DomainError(
      'E_INVALID_REVOKE_TARGET',
      'reversal operations cannot be reversed directly; reverse the original operation instead',
    );
  }
  if (original.status === 'reversed') {
    throw new DomainError(
      'E_OPERATION_ALREADY_REVERSED',
      `operation ${original.id} has already been reversed`,
    );
  }
  if (original.status !== 'succeeded') {
    throw new DomainError(
      'E_OPERATION_NOT_APPLIED',
      `only succeeded operations can be reversed; current status is ${original.status}`,
    );
  }
  if (entries.length === 0) {
    throw new DomainError(
      'E_REVERSAL_MISMATCH',
      `operation ${original.id} has no ledger entries to reverse`,
    );
  }
  const seenEntryIds = new Set<Uuid>();
  for (const entry of entries) {
    if (entry.operationId !== original.id) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        `ledger entry ${entry.id} does not belong to operation ${original.id}`,
      );
    }
    if (entry.reverseOfEntryId !== null) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        `ledger entry ${entry.id} is itself a reverse entry and cannot be reversed`,
      );
    }
    if (seenEntryIds.has(entry.id)) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        `duplicate original ledger entry id ${entry.id}`,
      );
    }
    seenEntryIds.add(entry.id);
  }
}

function assertPlannedEntryIds(
  plannedEntryIds: readonly Uuid[],
  expectedLength: number,
): void {
  if (plannedEntryIds.length !== expectedLength) {
    throw new DomainError(
      'E_REVERSAL_MISMATCH',
      'planned reverse entry ids must match original entries one-to-one',
    );
  }
  const seen = new Set<Uuid>();
  for (const id of plannedEntryIds) {
    if (seen.has(id)) {
      throw new DomainError(
        'E_REVERSAL_MISMATCH',
        `duplicate planned reverse entry id ${id}`,
      );
    }
    seen.add(id);
  }
}
