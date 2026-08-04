import { DomainError } from './errors';
import type { IdempotencyKey, OperationRecord } from './index';

/**
 * 幂等占位记录。请求首次到达时写入占位；同一 key 后续到达时：
 *  - 若占位仍为 pending 且请求指纹相同，返回占位；调用方等待并复用。
 *  - 若已完成且请求指纹相同，返回已完成结果，不新增副作用。
 *  - 若指纹不同，拒绝 (E_IDEMPOTENCY_CONFLICT)。
 */
export interface IdempotencyRecord {
  readonly key: IdempotencyKey;
  readonly fingerprint: string;
  readonly operation: OperationRecord | null;
  readonly status: 'pending' | 'succeeded' | 'failed';
}

export interface IdempotencyStore {
  reserve(record: IdempotencyRecord): IdempotencyLookupResult;
  complete(
    key: IdempotencyKey,
    operation: OperationRecord,
    status: 'succeeded' | 'failed',
  ): void;
  get(key: IdempotencyKey): IdempotencyRecord | undefined;
}

export type IdempotencyLookupResult =
  | { readonly outcome: 'reserved' }
  | { readonly outcome: 'replay'; readonly record: IdempotencyRecord };

export function fingerprintCommand(input: {
  readonly kind: string;
  readonly actorId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}): string {
  const parts = [
    input.kind,
    input.actorId,
    input.targetType,
    input.targetId,
    stableStringify(input.payload ?? {}),
  ];
  return parts.join('|');
}

function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${key}=${String(value[key])}`);
  return pairs.join(',');
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<IdempotencyKey, IdempotencyRecord>();

  reserve(record: IdempotencyRecord): IdempotencyLookupResult {
    const existing = this.records.get(record.key);
    if (existing === undefined) {
      this.records.set(record.key, record);
      return { outcome: 'reserved' };
    }
    if (existing.fingerprint !== record.fingerprint) {
      throw new DomainError(
        'E_IDEMPOTENCY_CONFLICT',
        `idempotency key ${record.key} was reused with a different request fingerprint`,
      );
    }
    return { outcome: 'replay', record: existing };
  }

  complete(
    key: IdempotencyKey,
    operation: OperationRecord,
    status: 'succeeded' | 'failed',
  ): void {
    const existing = this.records.get(key);
    if (existing === undefined) {
      throw new DomainError(
        'E_IDEMPOTENCY_CONFLICT',
        `idempotency key ${key} has no reservation`,
      );
    }
    this.records.set(key, { ...existing, operation, status });
  }

  get(key: IdempotencyKey): IdempotencyRecord | undefined {
    return this.records.get(key);
  }
}
