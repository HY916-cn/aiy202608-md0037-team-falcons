import {
  ApiClientError,
  normalizeGradeReportCsvUpload,
  type GradeReportImportContext,
  type ReviseGradeReportValueInput,
  type SaveGradeReportSheetDraftInput,
} from '@dolphincloud/api-client';
import type { AuthRoleScope } from '@dolphincloud/auth';
import type { GradeReportSheet } from '@dolphincloud/domain';
import type { TeachingStudent } from '@dolphincloud/experience';

export type GradeReportColumnForm = {
  readonly key: string;
  readonly maxScore: string;
  readonly name: string;
};

export type GradeReportValueForm = {
  readonly comment: string;
  readonly score: string;
};

export type GradeReportRowForm = {
  readonly studentId: string;
  readonly studentName: string;
  readonly values: Readonly<Record<string, GradeReportValueForm>>;
};

export type GradeReportDraftForm = {
  readonly classId: string;
  readonly columns: readonly GradeReportColumnForm[];
  readonly publishedAt: string | null;
  readonly rows: readonly GradeReportRowForm[];
  readonly sheetId: string | null;
  readonly source: 'grid' | 'csv' | 'xlsx';
  readonly status: 'draft' | 'published';
  readonly subject: string;
  readonly title: string;
};

export class GradeReportFormError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeReportFormError';
  }
}

const BLANK_VALUE: GradeReportValueForm = { comment: '', score: '' };

function parseScore(value: string, label: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+(?:\.\d{1,2})?$/u.test(trimmed)) {
    throw new GradeReportFormError(`${label}必须是 0 到 99999.99 的数字，且最多两位小数。`);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999.99) {
    throw new GradeReportFormError(`${label}必须在 0 到 99999.99 之间。`);
  }
  return parsed;
}

export function createGradeReportDraftForm(
  classId: string,
  students: readonly TeachingStudent[],
): GradeReportDraftForm {
  const column: GradeReportColumnForm = {
    key: 'item_1',
    maxScore: '100',
    name: '成绩项目 1',
  };
  return {
    classId,
    columns: [column],
    publishedAt: null,
    rows: students
      .filter((student) => student.classId === classId)
      .map((student) => ({
        studentId: student.id,
        studentName: student.name,
        values: { [column.key]: BLANK_VALUE },
      })),
    sheetId: null,
    source: 'grid',
    status: 'draft',
    subject: '',
    title: '',
  };
}

export function addGradeReportColumn(
  form: GradeReportDraftForm,
): GradeReportDraftForm {
  const nextNumber =
    form.columns.reduce((largest, column) => {
      const match = /^item_(\d+)$/u.exec(column.key);
      return Math.max(largest, Number(match?.[1] ?? 0));
    }, 0) + 1;
  const column: GradeReportColumnForm = {
    key: `item_${nextNumber}`,
    maxScore: '100',
    name: `成绩项目 ${form.columns.length + 1}`,
  };
  return {
    ...form,
    columns: [...form.columns, column],
    rows: form.rows.map((row) => ({
      ...row,
      values: { ...row.values, [column.key]: BLANK_VALUE },
    })),
  };
}

export function removeGradeReportColumn(
  form: GradeReportDraftForm,
  columnKey: string,
): GradeReportDraftForm {
  if (form.columns.length === 1) {
    throw new GradeReportFormError('成绩单至少需要一个成绩项目。');
  }
  return {
    ...form,
    columns: form.columns.filter((column) => column.key !== columnKey),
    rows: form.rows.map((row) => ({
      ...row,
      values: Object.fromEntries(
        Object.entries(row.values).filter(([key]) => key !== columnKey),
      ),
    })),
  };
}

export function reopenGradeReportSheet(
  sheet: GradeReportSheet,
  students: readonly TeachingStudent[],
): GradeReportDraftForm {
  const names = new Map(students.map((student) => [student.id, student.name]));
  return {
    classId: sheet.classId,
    columns: [...sheet.columns]
      .sort((left, right) => left.position - right.position)
      .map((column) => ({
        key: column.columnKey,
        maxScore: column.maxScore === null ? '' : String(column.maxScore),
        name: column.name,
      })),
    publishedAt: sheet.publishedAt,
    rows: sheet.rows.map((row) => ({
      studentId: row.studentId,
      studentName: names.get(row.studentId) ?? '当前班级学生',
      values: Object.fromEntries(
        sheet.columns.map((column) => {
          const value = row.values.find(
            (candidate) => candidate.columnId === column.id,
          );
          return [
            column.columnKey,
            {
              comment: value?.comment ?? '',
              score: value === undefined ? '' : String(value.score),
            },
          ];
        }),
      ),
    })),
    sheetId: sheet.id,
    source: sheet.source,
    status: sheet.status,
    subject: sheet.subject,
    title: sheet.title,
  };
}

export function buildGradeReportDraftInput(
  form: GradeReportDraftForm,
): SaveGradeReportSheetDraftInput {
  if (form.status !== 'draft') {
    throw new GradeReportFormError('已发布成绩单不能覆盖保存，请使用成绩修订。');
  }
  if (form.title.trim() === '') throw new GradeReportFormError('请填写成绩单标题。');
  if (form.subject.trim() === '') throw new GradeReportFormError('请填写科目。');
  if (form.rows.length === 0) throw new GradeReportFormError('当前班级没有可填写的学生。');
  const names = new Set<string>();
  const columns = form.columns.map((column, position) => {
    const name = column.name.trim();
    if (name === '') throw new GradeReportFormError(`第 ${position + 1} 个成绩项目缺少名称。`);
    if (names.has(name)) throw new GradeReportFormError(`成绩项目“${name}”重复。`);
    names.add(name);
    return {
      columnKey: column.key,
      maxScore:
        column.maxScore.trim() === ''
          ? null
          : parseScore(column.maxScore, `“${name}”满分`),
      name,
      position,
    };
  });
  return {
    classId: form.classId,
    columns,
    rows: form.rows.map((row) => ({
      studentId: row.studentId,
      values: columns.map((column) => {
        const value = row.values[column.columnKey];
        if (value === undefined) {
          throw new GradeReportFormError(`${row.studentName}缺少“${column.name}”成绩。`);
        }
        const score = parseScore(value.score, `${row.studentName}的“${column.name}”成绩`);
        if (column.maxScore !== null && score > column.maxScore) {
          throw new GradeReportFormError(
            `${row.studentName}的“${column.name}”成绩超过满分 ${column.maxScore}。`,
          );
        }
        return { columnKey: column.columnKey, comment: value.comment, score };
      }),
    })),
    sheetId: form.sheetId,
    source: form.source,
    subject: form.subject.trim(),
    title: form.title.trim(),
  };
}

export function buildGradeReportRevisionInput(
  scoreText: string,
  comment: string,
  reason: string,
  maxScore: number | null,
): ReviseGradeReportValueInput {
  if (reason.trim() === '') throw new GradeReportFormError('修订原因不能为空。');
  const score = parseScore(scoreText, '修订成绩');
  if (maxScore !== null && score > maxScore) {
    throw new GradeReportFormError(`修订成绩不能超过满分 ${maxScore}。`);
  }
  return { comment, reason: reason.trim(), score };
}

export function prepareGradeReportCsvPreview(
  context: GradeReportImportContext,
  csv: string,
): SaveGradeReportSheetDraftInput {
  try {
    return normalizeGradeReportCsvUpload(context, csv);
  } catch (cause) {
    const detail = cause instanceof Error && cause.cause instanceof Error
      ? cause.cause.message
      : '';
    if (detail.includes('CSV_MISSING_STUDENT_ID')) {
      throw new GradeReportFormError('CSV 缺少 student_id 列。');
    }
    if (detail.includes('CSV_DUPLICATE_OR_EMPTY_HEADER')) {
      throw new GradeReportFormError('CSV 存在空列名或重复列名。');
    }
    if (detail.includes('CSV_MISSING_GRADE_ITEM')) {
      throw new GradeReportFormError('CSV 至少需要一个成绩项目列。');
    }
    if (cause instanceof ApiClientError) {
      throw new GradeReportFormError(
        'CSV 数据无效，请检查学生 ID、成绩项目、数字、满分和小数位。',
      );
    }
    throw cause;
  }
}

export function canWriteGradeReports(roleScope: AuthRoleScope): boolean {
  return roleScope.role === 'teacher';
}

export function resolveGradeReportLayout(width: number): 'compact' | 'table' {
  return width <= 720 ? 'compact' : 'table';
}

export type FamilyGradeReportState = {
  readonly isLoading: boolean;
  readonly sheets: readonly GradeReportSheet[];
  readonly studentId: string | null;
};

export function beginFamilyScopeLoad(): FamilyGradeReportState {
  return { isLoading: true, sheets: [], studentId: null };
}
