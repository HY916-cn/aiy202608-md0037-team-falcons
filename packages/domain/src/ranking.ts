import { DomainError } from './errors';
import type { LedgerEntry } from './ledger';
import type { LedgerKind, RankingWindow, Timestamp, Uuid } from './index';

/**
 * 排行榜条目。rank 采用标准竞赛并列名次：分数相同同名，下一名跳号 (1,2,2,4)。
 * score = Σcredit - Σdebit，反向流水自动抵消原流水，撤销后 net 归零。
 */
export interface RankingEntry {
  readonly subjectId: Uuid;
  readonly score: number;
  readonly rank: number;
}

export interface RankingComputationInput {
  readonly entries: readonly LedgerEntry[];
  readonly kind: LedgerKind;
  readonly window: RankingWindow;
  readonly at: Timestamp;
  readonly subjectIds?: readonly Uuid[];
}

const WINDOW_DURATION_MS: Readonly<Record<RankingWindow, number | null>> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  all_time: null,
};

/**
 * 计算排行榜（不查库、不落库，纯值）。
 *  - 只统计 ledger kind 匹配的条目。
 *  - 根据 window 过滤 createdAt >= at - duration。
 *  - 按 subjectId 聚合 net；正负流水都参与，反向流水天然抵消原流水。
 *  - 若 subjectIds 提供，则最终榜单会显式包含这些 subject（缺席时 score=0）。
 *  - 排序：score 降序；同分按 subjectId 字典升序稳定输出。
 *  - 名次：并列跳号。
 */
export function computeRanking(
  input: RankingComputationInput,
): readonly RankingEntry[] {
  const threshold = resolveWindowThreshold(input.window, input.at);

  const totals = new Map<Uuid, number>();
  for (const entry of input.entries) {
    if (entry.kind !== input.kind) {
      continue;
    }
    if (threshold !== null && entry.createdAt < threshold) {
      continue;
    }
    const signed = entry.direction === 'credit' ? entry.amount : -entry.amount;
    totals.set(entry.subjectId, (totals.get(entry.subjectId) ?? 0) + signed);
  }

  if (input.subjectIds !== undefined) {
    for (const subjectId of input.subjectIds) {
      if (!totals.has(subjectId)) {
        totals.set(subjectId, 0);
      }
    }
  }

  const rows = Array.from(totals.entries()).map(([subjectId, score]) => ({
    subjectId,
    score,
  }));
  rows.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0;
  });

  const ranked: RankingEntry[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    const position = index + 1;
    const rank = previousScore !== null && row.score === previousScore
      ? previousRank
      : position;
    previousScore = row.score;
    previousRank = rank;
    ranked.push({ subjectId: row.subjectId, score: row.score, rank });
  });

  return ranked;
}

function resolveWindowThreshold(
  window: RankingWindow,
  at: Timestamp,
): Timestamp | null {
  const durationMs = WINDOW_DURATION_MS[window];
  if (durationMs === null) {
    return null;
  }
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) {
    throw new DomainError(
      'E_INVALID_TIMESTAMP',
      `ranking anchor timestamp ${at} is not parseable`,
    );
  }
  const threshold = new Date(parsed - durationMs).toISOString();
  return threshold as Timestamp;
}
