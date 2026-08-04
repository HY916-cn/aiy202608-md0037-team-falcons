import { describe, expect, it } from 'vitest';

import {
  DomainError,
  applyClassScoreAdjustment,
  applyStudentScoreAdjustment,
  buildReversal,
  type AuthorizedOperationCommand,
  type IdempotencyKey,
  type Timestamp,
  type Uuid,
} from '../index';

const NOW = '2026-08-04T05:00:00Z' as Timestamp;
const LATER = '2026-08-04T05:05:00Z' as Timestamp;

const STUDENT_ID = 'st-11112222-3333-4444-8555-666677778888' as Uuid;
const CLASS_ID = 'cl-22223333-4444-4555-8666-777788889999' as Uuid;
const ACTOR_ID = 'ac-33334444-5555-4666-8777-888899990000' as Uuid;
const OP_ID = 'op-44445555-6666-4777-8888-99990000aaaa' as Uuid;
const ENTRY_ID = 'le-55556666-7777-4888-8999-0000aaaabbbb' as Uuid;
const REV_OP_ID = 'op-66667777-8888-4999-8aaa-bbbbccccdddd' as Uuid;
const REV_LINK_ID = 'rl-77778888-9999-4aaa-8bbb-ccccddddeeee' as Uuid;
const REV_ENTRY_ID = 'le-88889999-aaaa-4bbb-8ccc-ddddeeeeffff' as Uuid;

function studentCommand(
  overrides: Partial<AuthorizedOperationCommand> = {},
): AuthorizedOperationCommand {
  return {
    kind: 'student_score_adjust',
    actorId: ACTOR_ID,
    actorRole: 'teacher',
    idempotencyKey: 'test-idempotency-student-score' as IdempotencyKey,
    reason: '值日出勤',
    targetType: 'student',
    targetId: STUDENT_ID,
    requestId: 'req-score-1',
    ...overrides,
  };
}

function classCommand(
  overrides: Partial<AuthorizedOperationCommand> = {},
): AuthorizedOperationCommand {
  return {
    kind: 'class_score_adjust',
    actorId: ACTOR_ID,
    actorRole: 'teacher',
    idempotencyKey: 'test-idempotency-class-score' as IdempotencyKey,
    reason: '班级早读',
    targetType: 'class',
    targetId: CLASS_ID,
    requestId: 'req-score-2',
    ...overrides,
  };
}

describe('applyStudentScoreAdjustment', () => {
  it('produces an applied operation and a credit entry for a positive delta', () => {
    const { operation, entry } = applyStudentScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: studentCommand(),
      delta: 3,
      studentId: STUDENT_ID,
      now: NOW,
    });
    expect(operation.status).toBe('applied');
    expect(operation.kind).toBe('student_score_adjust');
    expect(entry.kind).toBe('student_score');
    expect(entry.direction).toBe('credit');
    expect(entry.amount).toBe(3);
    expect(entry.subjectId).toBe(STUDENT_ID);
    expect(entry.operationId).toBe(OP_ID);
    expect(entry.reverseOfEntryId).toBeNull();
  });

  it('splits negative delta into debit direction with positive amount', () => {
    const { entry } = applyStudentScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: studentCommand({ reason: '迟到' }),
      delta: -2,
      studentId: STUDENT_ID,
      now: NOW,
    });
    expect(entry.direction).toBe('debit');
    expect(entry.amount).toBe(2);
  });

  it('rejects zero delta with E_DELTA_ZERO_NOT_ALLOWED', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand(),
        delta: 0,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_DELTA_ZERO_NOT_ALLOWED');
  });

  it('rejects fractional delta with E_INTEGER_REQUIRED', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand(),
        delta: 1.5,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_INTEGER_REQUIRED');
  });

  it('rejects command whose kind is not student_score_adjust', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand({ kind: 'class_score_adjust' }),
        delta: 2,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNKNOWN_OPERATION_KIND');
  });

  it('rejects command whose targetType is not student with E_UNKNOWN_TARGET_TYPE', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand({ targetType: 'class', targetId: CLASS_ID }),
        delta: 2,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNKNOWN_TARGET_TYPE');
  });

  it('rejects command whose targetId does not match studentId with E_UNAUTHORIZED', () => {
    const otherStudent = 'st-99999999-9999-4999-8999-999999999999' as Uuid;
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand({ targetId: otherStudent }),
        delta: 2,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNAUTHORIZED');
  });

  it('accepts delta equal to SCORE_DELTA_MIN and SCORE_DELTA_MAX (inclusive boundaries)', () => {
    const min = applyStudentScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: studentCommand(),
      delta: -1000,
      studentId: STUDENT_ID,
      now: NOW,
    });
    expect(min.entry.direction).toBe('debit');
    expect(min.entry.amount).toBe(1000);

    const max = applyStudentScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: studentCommand(),
      delta: 1000,
      studentId: STUDENT_ID,
      now: NOW,
    });
    expect(max.entry.direction).toBe('credit');
    expect(max.entry.amount).toBe(1000);
  });

  it('rejects delta just above SCORE_DELTA_MAX with E_DELTA_OUT_OF_RANGE', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand(),
        delta: 1001,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_DELTA_OUT_OF_RANGE');
  });

  it('rejects delta just below SCORE_DELTA_MIN with E_DELTA_OUT_OF_RANGE', () => {
    let caught: DomainError | undefined;
    try {
      applyStudentScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: studentCommand(),
        delta: -1001,
        studentId: STUDENT_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_DELTA_OUT_OF_RANGE');
  });

  it('the produced entry can be reversed through buildReversal and original stays untouched', () => {
    const { operation, entry } = applyStudentScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: studentCommand(),
      delta: 5,
      studentId: STUDENT_ID,
      now: NOW,
    });
    const result = buildReversal({
      original: operation,
      originalEntries: [entry],
      actorId: ACTOR_ID,
      actorRole: 'admin',
      reason: '录入错误',
      reversalOperationId: REV_OP_ID,
      reversalLinkId: REV_LINK_ID,
      plannedEntryIds: [REV_ENTRY_ID],
      idempotencyKey: 'test-idempotency-student-reversal' as IdempotencyKey,
      requestId: 'req-score-rev',
      now: LATER,
    });
    expect(result.updatedOriginal.status).toBe('reversed');
    expect(entry.direction).toBe('credit');
    expect(entry.amount).toBe(5);
    expect(entry.reverseOfEntryId).toBeNull();
    const [rev] = result.reverseEntries;
    expect(rev?.direction).toBe('debit');
    expect(rev?.amount).toBe(5);
    expect(rev?.reverseOfEntryId).toBe(ENTRY_ID);
  });
});

describe('applyClassScoreAdjustment', () => {
  it('produces applied operation and a credit entry with class_score kind and classId as subject', () => {
    const { operation, entry } = applyClassScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: classCommand(),
      delta: 4,
      classId: CLASS_ID,
      now: NOW,
    });
    expect(operation.status).toBe('applied');
    expect(operation.kind).toBe('class_score_adjust');
    expect(entry.kind).toBe('class_score');
    expect(entry.direction).toBe('credit');
    expect(entry.amount).toBe(4);
    expect(entry.subjectId).toBe(CLASS_ID);
  });

  it('splits negative delta into debit direction', () => {
    const { entry } = applyClassScoreAdjustment({
      operationId: OP_ID,
      entryId: ENTRY_ID,
      command: classCommand({ reason: '晚归' }),
      delta: -6,
      classId: CLASS_ID,
      now: NOW,
    });
    expect(entry.direction).toBe('debit');
    expect(entry.amount).toBe(6);
  });

  it('rejects command whose kind is not class_score_adjust', () => {
    let caught: DomainError | undefined;
    try {
      applyClassScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: classCommand({ kind: 'student_score_adjust' }),
        delta: 1,
        classId: CLASS_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNKNOWN_OPERATION_KIND');
  });

  it('rejects command whose targetType is not class with E_UNKNOWN_TARGET_TYPE', () => {
    let caught: DomainError | undefined;
    try {
      applyClassScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: classCommand({ targetType: 'student', targetId: STUDENT_ID }),
        delta: 1,
        classId: CLASS_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNKNOWN_TARGET_TYPE');
  });

  it('rejects command whose targetId does not match classId with E_UNAUTHORIZED', () => {
    const otherClass = 'cl-88888888-8888-4888-8888-888888888888' as Uuid;
    let caught: DomainError | undefined;
    try {
      applyClassScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: classCommand({ targetId: otherClass }),
        delta: 1,
        classId: CLASS_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_UNAUTHORIZED');
  });

  it('rejects class delta out of range with E_DELTA_OUT_OF_RANGE', () => {
    let caught: DomainError | undefined;
    try {
      applyClassScoreAdjustment({
        operationId: OP_ID,
        entryId: ENTRY_ID,
        command: classCommand(),
        delta: 1001,
        classId: CLASS_ID,
        now: NOW,
      });
    } catch (error) {
      caught = error as DomainError;
    }
    expect(caught?.code).toBe('E_DELTA_OUT_OF_RANGE');
  });
});
