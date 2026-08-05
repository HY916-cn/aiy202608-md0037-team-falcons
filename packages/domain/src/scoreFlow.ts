import { DomainError } from './errors';
import { SCORE_DELTA_MAX, SCORE_DELTA_MIN } from './constants';
import { buildLedgerEntry, type LedgerEntry } from './ledger';
import {
  createPendingOperation,
  markOperationApplied,
  type AuthorizedOperationCommand,
  type OperationRecord,
} from './operation';
import type {
  LedgerKind,
  OperationKind,
  OperationTargetType,
  StudentScoreCategoryKind,
  Timestamp,
  Uuid,
} from './index';

/**
 * 学生分/班级分流水都遵循同一形态：
 *  - 客户端提交非零整数 delta（正加、负扣）。
 *  - 领域层把 delta 拆成 (direction, amount>0) 落入不可变流水。
 *  - 撤销走 buildReversal，同样只新增反向流水，不改动原流水。
 * 本模块不做写库，返回纯值供事务层落库。
 */

export interface ScoreAdjustmentInput {
  readonly operationId: Uuid;
  readonly entryId: Uuid;
  readonly command: AuthorizedOperationCommand;
  readonly delta: number;
  readonly now: Timestamp;
}

export interface StudentScoreAdjustmentInput extends ScoreAdjustmentInput {
  readonly studentId: Uuid;
}

export interface ClassScoreAdjustmentInput extends ScoreAdjustmentInput {
  readonly classId: Uuid;
}

export interface ScoreAdjustmentResult {
  readonly operation: OperationRecord;
  readonly entry: LedgerEntry;
}

export interface StudentScoreCategoryDefinition {
  readonly id: Uuid;
  readonly schoolId: Uuid;
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: StudentScoreCategoryKind;
  readonly defaultDelta: number;
  readonly isActive: boolean;
}

export interface StudentScoreCategoryManageInput {
  readonly categoryId: Uuid | null;
  readonly schoolId: Uuid;
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: StudentScoreCategoryKind;
  readonly defaultDelta: number;
  readonly isActive: boolean;
}

/**
 * 学生分：kind 必须为 student_score_apply，subject 为 studentId，
 * ledger kind 为 student_score。
 * 授权目标必须 (targetType='student', targetId===studentId)，防止
 * 授权目标与实际写入的流水对象错位。
 */
export function applyStudentScoreAdjustment(
  input: StudentScoreAdjustmentInput,
): ScoreAdjustmentResult {
  return buildScoreAdjustment({
    expectedKind: 'student_score_apply',
    expectedTargetType: 'student',
    ledgerKind: 'student_score',
    subjectId: input.studentId,
    operationId: input.operationId,
    entryId: input.entryId,
    command: input.command,
    delta: input.delta,
    now: input.now,
  });
}

/**
 * 班级分：kind 必须为 class_score_apply，subject 为 classId，
 * ledger kind 为 class_score。
 * 授权目标必须 (targetType='class', targetId===classId)。
 */
export function applyClassScoreAdjustment(
  input: ClassScoreAdjustmentInput,
): ScoreAdjustmentResult {
  return buildScoreAdjustment({
    expectedKind: 'class_score_apply',
    expectedTargetType: 'class',
    ledgerKind: 'class_score',
    subjectId: input.classId,
    operationId: input.operationId,
    entryId: input.entryId,
    command: input.command,
    delta: input.delta,
    now: input.now,
  });
}

interface InternalAdjustmentInput {
  readonly expectedKind: OperationKind;
  readonly expectedTargetType: OperationTargetType;
  readonly ledgerKind: LedgerKind;
  readonly subjectId: Uuid;
  readonly operationId: Uuid;
  readonly entryId: Uuid;
  readonly command: AuthorizedOperationCommand;
  readonly delta: number;
  readonly now: Timestamp;
}

function buildScoreAdjustment(
  input: InternalAdjustmentInput,
): ScoreAdjustmentResult {
  if (input.command.kind !== input.expectedKind) {
    throw new DomainError(
      'E_UNKNOWN_OPERATION_KIND',
      `command kind ${input.command.kind} does not match ${input.expectedKind}`,
    );
  }
  if (input.command.targetType !== input.expectedTargetType) {
    throw new DomainError(
      'E_UNKNOWN_TARGET_TYPE',
      `command targetType ${input.command.targetType} does not match ${input.expectedTargetType}`,
    );
  }
  if (input.command.targetId !== input.subjectId) {
    throw new DomainError(
      'E_UNAUTHORIZED',
      `command targetId does not match adjustment subject; authorised target and ledger subject must be identical`,
    );
  }
  if (!Number.isInteger(input.delta)) {
    throw new DomainError(
      'E_INTEGER_REQUIRED',
      'score delta must be an integer',
    );
  }
  if (input.delta === 0) {
    throw new DomainError(
      'E_DELTA_ZERO_NOT_ALLOWED',
      'score delta must not be zero',
    );
  }
  if (input.delta < SCORE_DELTA_MIN || input.delta > SCORE_DELTA_MAX) {
    throw new DomainError(
      'E_DELTA_OUT_OF_RANGE',
      `score delta ${input.delta} outside [${SCORE_DELTA_MIN}, ${SCORE_DELTA_MAX}]`,
    );
  }

  const direction = input.delta > 0 ? 'credit' : 'debit';
  const amount = Math.abs(input.delta);

  const pending = createPendingOperation({
    id: input.operationId,
    command: input.command,
    now: input.now,
  });
  const operation = markOperationApplied(pending, input.now);

  const entry = buildLedgerEntry({
    id: input.entryId,
    kind: input.ledgerKind,
    direction,
    amount,
    subjectId: input.subjectId,
    operationId: operation.id,
    reason: input.command.reason,
    now: input.now,
  });

  return { operation, entry };
}
