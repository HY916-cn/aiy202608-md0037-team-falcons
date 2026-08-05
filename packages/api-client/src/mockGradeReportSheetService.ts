import type {
  GradeReportColumn,
  GradeReportSheet,
  GradeReportStudentRow,
  GradeReportValue,
  GradeReportValueRevision,
} from '@dolphincloud/domain';
import {
  reviseGradeReportValueSchema,
  saveGradeReportSheetDraftSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';
import type {
  GradeReportSheetService,
  ReviseGradeReportValueInput,
  SaveGradeReportSheetDraftInput,
} from './gradeReportSheetService';

export const DEMO_GRADE_CLASS_ONE = '20000000-0000-0000-0000-000000000001';
export const DEMO_GRADE_CLASS_TWO = '20000000-0000-0000-0000-000000000002';
export const DEMO_GRADE_STUDENT_ONE = '50000000-0000-0000-0000-000000000001';
export const DEMO_GRADE_STUDENT_OTHER = '50000000-0000-0000-0000-000000000002';
export const DEMO_GRADE_STUDENT_TWO = '50000000-0000-0000-0000-000000000009';

const DEMO_TEACHER_ID = '30000000-0000-0000-0000-000000000001';
const SEED_TIMESTAMP = '2026-08-05T00:00:00.000Z';

function cloneValue(value: GradeReportValue): GradeReportValue {
  return { ...value };
}

function cloneRow(row: GradeReportStudentRow): GradeReportStudentRow {
  return { ...row, values: row.values.map(cloneValue) };
}

function cloneSheet(sheet: GradeReportSheet): GradeReportSheet {
  return {
    ...sheet,
    columns: sheet.columns.map((column) => ({ ...column })),
    rows: sheet.rows.map(cloneRow),
  };
}

function createSeedSheet({
  classId,
  columns,
  id,
  published,
  rows,
  title,
}: {
  readonly classId: string;
  readonly columns: readonly {
    readonly maxScore: number | null;
    readonly name: string;
  }[];
  readonly id: string;
  readonly published: boolean;
  readonly rows: readonly { readonly scores: readonly number[]; readonly studentId: string }[];
  readonly title: string;
}): GradeReportSheet {
  const reportColumns: GradeReportColumn[] = columns.map((column, index) => ({
    columnKey: `item_${index + 1}`,
    id: `86000000-0000-0000-0000-${id.slice(-8)}${String(index + 1).padStart(4, '0')}`,
    maxScore: column.maxScore,
    name: column.name,
    position: index,
  }));
  return {
    classId,
    columns: reportColumns,
    createdAt: SEED_TIMESTAMP,
    id,
    publishedAt: published ? SEED_TIMESTAMP : null,
    rows: rows.map((row, rowIndex) => ({
      id: `87000000-0000-0000-0000-${id.slice(-8)}${String(rowIndex + 1).padStart(4, '0')}`,
      studentId: row.studentId,
      values: row.scores.map((score, valueIndex) => ({
        columnId: reportColumns[valueIndex]?.id ?? '',
        comment: `合成评语 ${rowIndex + 1}-${valueIndex + 1}`,
        id: `88000000-0000-0000-0000-${id.slice(-8)}${String(rowIndex * 10 + valueIndex + 1).padStart(4, '0')}`,
        score,
      })),
    })),
    source: 'grid',
    status: published ? 'published' : 'draft',
    subject: '数学',
    teacherId: DEMO_TEACHER_ID,
    title,
    updatedAt: SEED_TIMESTAMP,
  };
}

export class MockGradeReportSheetService implements GradeReportSheetService {
  private revisions: GradeReportValueRevision[] = [];
  private sequence = 200;
  private sheets: GradeReportSheet[];

  constructor({ seedData = true }: { readonly seedData?: boolean } = {}) {
    this.sheets = seedData ? this.createSeedSheets() : [];
  }

  async getSheet(sheetId: string): Promise<GradeReportSheet> {
    const sheet = this.sheets.find((candidate) => candidate.id === sheetId);
    if (sheet === undefined) throw new ApiClientError('NOT_FOUND');
    return cloneSheet(sheet);
  }

  async listClassSheets(classId: string): Promise<readonly GradeReportSheet[]> {
    return this.sheets
      .filter((sheet) => sheet.classId === classId)
      .map(cloneSheet);
  }

  async listStudentSheets(studentId: string): Promise<readonly GradeReportSheet[]> {
    return this.sheets.flatMap((sheet) => {
      if (sheet.status !== 'published') return [];
      const row = sheet.rows.find((candidate) => candidate.studentId === studentId);
      return row === undefined ? [] : [{ ...cloneSheet(sheet), rows: [cloneRow(row)] }];
    });
  }

  async listValueRevisions(
    valueId: string,
  ): Promise<readonly GradeReportValueRevision[]> {
    return this.revisions
      .filter((revision) => revision.valueId === valueId)
      .map((revision) => ({ ...revision }));
  }

  async publishSheet(sheetId: string): Promise<GradeReportSheet> {
    const sheet = this.requireSheet(sheetId);
    if (sheet.status !== 'draft') throw new ApiClientError('NOT_FOUND');
    const publishedAt = new Date().toISOString();
    const published: GradeReportSheet = {
      ...sheet,
      publishedAt,
      status: 'published',
      updatedAt: publishedAt,
    };
    this.replaceSheet(published);
    return cloneSheet(published);
  }

  async reviseValue(
    valueId: string,
    input: ReviseGradeReportValueInput,
  ): Promise<GradeReportSheet> {
    const parsed = reviseGradeReportValueSchema.safeParse({ valueId, ...input });
    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }
    const sheet = this.sheets.find((candidate) =>
      candidate.rows.some((row) => row.values.some((value) => value.id === valueId)),
    );
    if (sheet === undefined || sheet.status !== 'published') {
      throw new ApiClientError('NOT_FOUND');
    }
    const row = sheet.rows.find((candidate) =>
      candidate.values.some((value) => value.id === valueId),
    );
    const previous = row?.values.find((value) => value.id === valueId);
    if (row === undefined || previous === undefined) {
      throw new ApiClientError('NOT_FOUND');
    }
    const column = sheet.columns.find((candidate) => candidate.id === previous.columnId);
    if (column?.maxScore !== null && column?.maxScore !== undefined && input.score > column.maxScore) {
      throw new ApiClientError('VALIDATION_ERROR');
    }
    const createdAt = new Date().toISOString();
    this.revisions = [
      {
        actorId: DEMO_TEACHER_ID,
        createdAt,
        id: this.nextId('89000000'),
        newComment: input.comment,
        newScore: input.score,
        oldComment: previous.comment,
        oldScore: previous.score,
        reason: input.reason.trim(),
        valueId,
      },
      ...this.revisions,
    ];
    const revised: GradeReportSheet = {
      ...sheet,
      rows: sheet.rows.map((candidate) =>
        candidate.id === row.id
          ? {
              ...candidate,
              values: candidate.values.map((value) =>
                value.id === valueId
                  ? { ...value, comment: input.comment, score: input.score }
                  : value,
              ),
            }
          : candidate,
      ),
      updatedAt: createdAt,
    };
    this.replaceSheet(revised);
    return cloneSheet(revised);
  }

  async saveDraft(input: SaveGradeReportSheetDraftInput): Promise<GradeReportSheet> {
    const parsed = saveGradeReportSheetDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }
    const existing =
      parsed.data.sheetId === null
        ? undefined
        : this.sheets.find((sheet) => sheet.id === parsed.data.sheetId);
    if (existing?.status === 'published') throw new ApiClientError('NOT_FOUND');
    const now = new Date().toISOString();
    const sheetId = parsed.data.sheetId ?? this.nextId('85000000');
    const columns: GradeReportColumn[] = parsed.data.columns.map((column) => ({
      ...column,
      id: this.nextId('86000000'),
    }));
    const saved: GradeReportSheet = {
      classId: parsed.data.classId,
      columns,
      createdAt: existing?.createdAt ?? now,
      id: sheetId,
      publishedAt: null,
      rows: parsed.data.rows.map((row) => ({
        id: this.nextId('87000000'),
        studentId: row.studentId,
        values: row.values.map((value) => ({
          columnId:
            columns.find((column) => column.columnKey === value.columnKey)?.id ?? '',
          comment: value.comment,
          id: this.nextId('88000000'),
          score: value.score,
        })),
      })),
      source: parsed.data.source,
      status: 'draft',
      subject: parsed.data.subject,
      teacherId: DEMO_TEACHER_ID,
      title: parsed.data.title,
      updatedAt: now,
    };
    this.sheets = existing === undefined ? [...this.sheets, saved] : this.sheets.map(
      (sheet) => (sheet.id === existing.id ? saved : sheet),
    );
    return cloneSheet(saved);
  }

  private createSeedSheets(): GradeReportSheet[] {
    return [
      createSeedSheet({
        classId: DEMO_GRADE_CLASS_ONE,
        columns: [{ maxScore: 100, name: '课堂表现' }],
        id: '85000000-0000-0000-0000-000000000101',
        published: true,
        rows: [
          { scores: [92], studentId: DEMO_GRADE_STUDENT_ONE },
          { scores: [88], studentId: DEMO_GRADE_STUDENT_OTHER },
        ],
        title: '单项成绩单',
      }),
      createSeedSheet({
        classId: DEMO_GRADE_CLASS_ONE,
        columns: [
          { maxScore: 100, name: '笔试' },
          { maxScore: 20, name: '实践' },
          { maxScore: 10, name: '表达' },
        ],
        id: '85000000-0000-0000-0000-000000000102',
        published: false,
        rows: [
          { scores: [90, 18, 9], studentId: DEMO_GRADE_STUDENT_ONE },
          { scores: [86, 17, 8], studentId: DEMO_GRADE_STUDENT_OTHER },
        ],
        title: '三项草稿成绩单',
      }),
      createSeedSheet({
        classId: DEMO_GRADE_CLASS_ONE,
        columns: [
          { maxScore: 100, name: '平时' },
          { maxScore: 100, name: '期中' },
          { maxScore: 100, name: '期末' },
        ],
        id: '85000000-0000-0000-0000-000000000103',
        published: true,
        rows: [
          { scores: [94, 91, 96], studentId: DEMO_GRADE_STUDENT_ONE },
          { scores: [89, 87, 90], studentId: DEMO_GRADE_STUDENT_OTHER },
        ],
        title: '三项已发布成绩单',
      }),
      createSeedSheet({
        classId: DEMO_GRADE_CLASS_TWO,
        columns: [{ maxScore: 100, name: '综合' }],
        id: '85000000-0000-0000-0000-000000000104',
        published: true,
        rows: [{ scores: [85], studentId: DEMO_GRADE_STUDENT_TWO }],
        title: '二班综合成绩单',
      }),
    ];
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`;
  }

  private replaceSheet(next: GradeReportSheet): void {
    this.sheets = this.sheets.map((sheet) => (sheet.id === next.id ? next : sheet));
  }

  private requireSheet(sheetId: string): GradeReportSheet {
    const sheet = this.sheets.find((candidate) => candidate.id === sheetId);
    if (sheet === undefined) throw new ApiClientError('NOT_FOUND');
    return sheet;
  }
}
