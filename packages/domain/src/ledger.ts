import { DomainError } from './errors';
import type {
  LedgerDirection,
  LedgerKind,
  Timestamp,
  Uuid,
} from './index';

/**
 * 不可变账务/分数流水记录。撤销不改动原条目，只新增一条 direction 相反的反向流水，
 * 通过 reverseOfEntryId 建立链接，通过 operationId 保证与操作层的可追溯性。
 */
export interface LedgerEntry {
  readonly id: Uuid;
  readonly kind: LedgerKind;
  readonly direction: LedgerDirection;
  readonly amount: number;
  readonly subjectId: Uuid;
  readonly operationId: Uuid;
  readonly reverseOfEntryId: Uuid | null;
  readonly reason: string;
  readonly createdAt: Timestamp;
}

export interface BuildLedgerEntryInput {
  readonly id: Uuid;
  readonly kind: LedgerKind;
  readonly direction: LedgerDirection;
  readonly amount: number;
  readonly subjectId: Uuid;
  readonly operationId: Uuid;
  readonly reason: string;
  readonly now: Timestamp;
}

export function buildLedgerEntry(input: BuildLedgerEntryInput): LedgerEntry {
  assertLedgerAmountPositiveInteger(input.amount);
  return {
    id: input.id,
    kind: input.kind,
    direction: input.direction,
    amount: input.amount,
    subjectId: input.subjectId,
    operationId: input.operationId,
    reverseOfEntryId: null,
    reason: input.reason,
    createdAt: input.now,
  };
}

export interface BuildReverseLedgerEntryInput {
  readonly id: Uuid;
  readonly original: LedgerEntry;
  readonly reversalOperationId: Uuid;
  readonly reason: string;
  readonly now: Timestamp;
}

/**
 * 依据原流水构造反向流水：
 *  - direction 取反 (credit <-> debit)
 *  - amount 保持原值 (不允许修改原金额)
 *  - operationId 指向反向操作
 *  - reverseOfEntryId 指向原流水
 */
export function buildReverseLedgerEntry(
  input: BuildReverseLedgerEntryInput,
): LedgerEntry {
  const { original } = input;
  const flipped: LedgerDirection =
    original.direction === 'credit' ? 'debit' : 'credit';
  return {
    id: input.id,
    kind: original.kind,
    direction: flipped,
    amount: original.amount,
    subjectId: original.subjectId,
    operationId: input.reversalOperationId,
    reverseOfEntryId: original.id,
    reason: input.reason,
    createdAt: input.now,
  };
}

function assertLedgerAmountPositiveInteger(amount: number): void {
  if (!Number.isInteger(amount)) {
    throw new DomainError(
      'E_INTEGER_REQUIRED',
      'ledger entry amount must be an integer',
    );
  }
  if (amount <= 0) {
    throw new DomainError(
      'E_AMOUNT_OUT_OF_RANGE',
      'ledger entry amount must be positive',
    );
  }
}
