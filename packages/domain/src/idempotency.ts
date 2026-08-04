import { DomainError } from './errors';
import type { IdempotencyKey, OperationRecord } from './index';

/**
 * 幂等占位记录。
 *  - reserve() 首次调用写占位并返回 outcome='reserved'。
 *  - 同 key 后续调用：占位仍在 pending 且指纹一致 → outcome='replay-pending'
 *    （调用方需等待原请求完成，不得复制副作用）。
 *  - 占位已进入终态且指纹一致 → outcome='replay-completed'，返回既有结果。
 *  - 指纹不同 → 抛 E_IDEMPOTENCY_CONFLICT。
 * complete() 只允许 pending → succeeded/failed 一次性跃迁；重入终态抛冲突。
 */
export type IdempotencyRecordStatus = 'pending' | 'succeeded' | 'failed';
export type IdempotencyCompletionStatus = 'succeeded' | 'failed';

export interface IdempotencyRecord {
  readonly key: IdempotencyKey;
  readonly fingerprint: string;
  readonly operation: OperationRecord | null;
  readonly status: IdempotencyRecordStatus;
}

export type IdempotencyLookupResult =
  | { readonly outcome: 'reserved' }
  | { readonly outcome: 'replay-pending'; readonly record: IdempotencyRecord }
  | {
      readonly outcome: 'replay-completed';
      readonly record: IdempotencyRecord;
    };

export interface IdempotencyStore {
  reserve(record: IdempotencyRecord): IdempotencyLookupResult;
  complete(
    key: IdempotencyKey,
    operation: OperationRecord,
    status: IdempotencyCompletionStatus,
  ): IdempotencyRecord;
  get(key: IdempotencyKey): IdempotencyRecord | undefined;
}

export interface FingerprintCommandInput {
  readonly kind: string;
  readonly actorId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload?: unknown;
}

/**
 * 生成请求指纹：
 *  - 前四个字段固定顺序拼接，避免任意重排。
 *  - payload 使用递归确定性序列化：对象键排序，数组保留顺序，字符串加引号，
 *    数字/布尔/null 保留类型标记，避免 `1` 与 `'1'` 撞车。
 * 相同请求恒得相同指纹；结构不同的请求指纹必然不同。
 */
export function fingerprintCommand(input: FingerprintCommandInput): string {
  const header = [
    stableJson(input.kind),
    stableJson(input.actorId),
    stableJson(input.targetType),
    stableJson(input.targetId),
  ].join('|');
  return `${header}|${stableJson(input.payload ?? null)}`;
}

/**
 * 确定性 JSON：
 *  - null / boolean / number / string / bigint → 原生类型化输出
 *  - array 保序递归
 *  - plain object 键排序递归
 *  - undefined / function / symbol → 抛 E_INVALID_INPUT（不允许出现在幂等指纹中）
 */
export function stableJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DomainError(
        'E_INVALID_INPUT',
        'non-finite numbers are not allowed in fingerprint payload',
      );
    }
    return `n:${JSON.stringify(value)}`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'bigint') {
    return `bi:${value.toString()}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${stableJson(record[key])}`,
    );
    return `{${pairs.join(',')}}`;
  }
  throw new DomainError(
    'E_INVALID_INPUT',
    `unsupported value type ${typeof value} in fingerprint payload`,
  );
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<IdempotencyKey, IdempotencyRecord>();

  reserve(record: IdempotencyRecord): IdempotencyLookupResult {
    if (record.status !== 'pending') {
      throw new DomainError(
        'E_INVALID_STATE_TRANSITION',
        `reserve() expects a pending record; got status ${record.status}`,
      );
    }
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
    if (existing.status === 'pending') {
      return { outcome: 'replay-pending', record: existing };
    }
    return { outcome: 'replay-completed', record: existing };
  }

  complete(
    key: IdempotencyKey,
    operation: OperationRecord,
    status: IdempotencyCompletionStatus,
  ): IdempotencyRecord {
    const existing = this.records.get(key);
    if (existing === undefined) {
      throw new DomainError(
        'E_IDEMPOTENCY_CONFLICT',
        `idempotency key ${key} has no reservation`,
      );
    }
    if (existing.status !== 'pending') {
      throw new DomainError(
        'E_INVALID_STATE_TRANSITION',
        `idempotency record ${key} is already in terminal status ${existing.status}; refusing to overwrite`,
      );
    }
    if (operation.idempotencyKey !== key) {
      throw new DomainError(
        'E_IDEMPOTENCY_CONFLICT',
        `operation.idempotencyKey does not match reservation key`,
      );
    }
    const next: IdempotencyRecord = {
      key: existing.key,
      fingerprint: existing.fingerprint,
      operation,
      status,
    };
    this.records.set(key, next);
    return next;
  }

  get(key: IdempotencyKey): IdempotencyRecord | undefined {
    return this.records.get(key);
  }
}
