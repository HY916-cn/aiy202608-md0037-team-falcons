import { z } from 'zod';

import {
  GRADE_REPORT_IMPORT_SOURCES,
  GRADE_REPORT_SHEET_STATUSES,
} from '@dolphincloud/domain';

import { databaseIdSchema } from './databaseIdSchema';

const gradeReportTimestampSchema = z.string().refine(
  (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) && !Number.isNaN(Date.parse(value)),
  'Invalid grade report timestamp',
);

export const gradeReportScoreSchema = z
  .number()
  .finite()
  .min(0)
  .max(99999.99)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
    'Grade report score must have at most two decimal places',
  );

export const gradeReportSheetStatusSchema = z.enum(
  GRADE_REPORT_SHEET_STATUSES,
);

export const gradeReportColumnDraftSchema = z
  .object({
    columnKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/u),
    maxScore: gradeReportScoreSchema.nullable(),
    name: z.string().trim().min(1).max(80),
    position: z.number().int().min(0).max(49),
  })
  .strict();

export const gradeReportValueDraftSchema = z
  .object({
    columnKey: z.string().trim().min(1).max(64),
    comment: z.string().max(1000),
    score: gradeReportScoreSchema,
  })
  .strict();

export const gradeReportStudentRowDraftSchema = z
  .object({
    studentId: databaseIdSchema,
    values: z.array(gradeReportValueDraftSchema).min(1).max(50),
  })
  .strict();

export const saveGradeReportSheetDraftSchema = z
  .object({
    classId: databaseIdSchema,
    columns: z.array(gradeReportColumnDraftSchema).min(1).max(50),
    rows: z.array(gradeReportStudentRowDraftSchema).min(1).max(200),
    sheetId: databaseIdSchema.nullable(),
    source: z.enum(GRADE_REPORT_IMPORT_SOURCES),
    subject: z.string().trim().min(1).max(60),
    title: z.string().trim().min(1).max(120),
  })
  .strict()
  .superRefine((sheet, context) => {
    const columnKeys = new Set<string>();
    const columnNames = new Set<string>();
    const positions = new Set<number>();
    const maxScores = new Map<string, number | null>();

    sheet.columns.forEach((column, index) => {
      if (columnKeys.has(column.columnKey)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate grade report column key',
          path: ['columns', index, 'columnKey'],
        });
      }
      if (columnNames.has(column.name)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate grade report column name',
          path: ['columns', index, 'name'],
        });
      }
      if (positions.has(column.position)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate grade report column position',
          path: ['columns', index, 'position'],
        });
      }
      columnKeys.add(column.columnKey);
      columnNames.add(column.name);
      positions.add(column.position);
      maxScores.set(column.columnKey, column.maxScore);
    });

    const studentIds = new Set<string>();
    sheet.rows.forEach((row, rowIndex) => {
      if (studentIds.has(row.studentId)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate grade report student row',
          path: ['rows', rowIndex, 'studentId'],
        });
      }
      studentIds.add(row.studentId);

      const valueKeys = new Set<string>();
      row.values.forEach((value, valueIndex) => {
        const maxScore = maxScores.get(value.columnKey);
        if (!columnKeys.has(value.columnKey)) {
          context.addIssue({
            code: 'custom',
            message: 'Unknown grade report column key',
            path: ['rows', rowIndex, 'values', valueIndex, 'columnKey'],
          });
        }
        if (valueKeys.has(value.columnKey)) {
          context.addIssue({
            code: 'custom',
            message: 'Duplicate grade report value',
            path: ['rows', rowIndex, 'values', valueIndex, 'columnKey'],
          });
        }
        if (maxScore !== null && maxScore !== undefined && value.score > maxScore) {
          context.addIssue({
            code: 'custom',
            message: 'Grade report score exceeds max score',
            path: ['rows', rowIndex, 'values', valueIndex, 'score'],
          });
        }
        valueKeys.add(value.columnKey);
      });

      if (
        valueKeys.size !== columnKeys.size ||
        [...columnKeys].some((columnKey) => !valueKeys.has(columnKey))
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Grade report row must contain every column exactly once',
          path: ['rows', rowIndex, 'values'],
        });
      }
    });
  });

export const reviseGradeReportValueSchema = z
  .object({
    comment: z.string().max(1000),
    reason: z.string().trim().min(1).max(500),
    score: gradeReportScoreSchema,
    valueId: databaseIdSchema,
  })
  .strict();

export const gradeReportImportColumnSchema = z
  .object({
    columnKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/u),
    commentHeader: z.string().trim().min(1).max(120).nullable(),
    maxScore: gradeReportScoreSchema.nullable(),
    name: z.string().trim().min(1).max(80),
    scoreHeader: z.string().trim().min(1).max(120),
  })
  .strict();

export const gradeReportImportDefinitionSchema = z
  .object({
    columns: z.array(gradeReportImportColumnSchema).min(1).max(50),
    studentIdHeader: z.string().trim().min(1).max(120),
  })
  .strict();

export const gradeReportValueResponseSchema = z
  .object({
    columnId: databaseIdSchema,
    comment: z.string().max(1000),
    id: databaseIdSchema,
    score: gradeReportScoreSchema,
  })
  .strict();

export const gradeReportStudentRowResponseSchema = z
  .object({
    id: databaseIdSchema,
    studentId: databaseIdSchema,
    values: z.array(gradeReportValueResponseSchema).min(1).max(50),
  })
  .strict();

export const gradeReportColumnResponseSchema = z
  .object({
    columnKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/u),
    id: databaseIdSchema,
    maxScore: gradeReportScoreSchema.nullable(),
    name: z.string().trim().min(1).max(80),
    position: z.number().int().min(0).max(49),
  })
  .strict();

export const gradeReportSheetResponseSchema = z
  .object({
    classId: databaseIdSchema,
    columns: z.array(gradeReportColumnResponseSchema).min(1).max(50),
    createdAt: gradeReportTimestampSchema,
    id: databaseIdSchema,
    publishedAt: gradeReportTimestampSchema.nullable(),
    rows: z.array(gradeReportStudentRowResponseSchema).min(1).max(200),
    source: z.enum(GRADE_REPORT_IMPORT_SOURCES),
    status: gradeReportSheetStatusSchema,
    subject: z.string().trim().min(1).max(60),
    teacherId: databaseIdSchema,
    title: z.string().trim().min(1).max(120),
    updatedAt: gradeReportTimestampSchema,
  })
  .strict()
  .superRefine((sheet, context) => {
    if (
      (sheet.status === 'draft' && sheet.publishedAt !== null) ||
      (sheet.status === 'published' && sheet.publishedAt === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Grade report status and published timestamp do not match',
        path: ['publishedAt'],
      });
    }

    const columnIds = new Set(sheet.columns.map((column) => column.id));
    sheet.rows.forEach((row, rowIndex) => {
      const valueColumnIds = new Set(row.values.map((value) => value.columnId));
      if (
        valueColumnIds.size !== columnIds.size ||
        [...columnIds].some((columnId) => !valueColumnIds.has(columnId))
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Grade report response row does not match columns',
          path: ['rows', rowIndex, 'values'],
        });
      }
    });
  });

export const gradeReportSheetListResponseSchema = z.array(
  gradeReportSheetResponseSchema,
);

export const gradeReportValueRevisionRowSchema = z
  .object({
    actor_id: databaseIdSchema,
    created_at: gradeReportTimestampSchema,
    id: databaseIdSchema,
    new_comment: z.string().max(1000),
    new_score: gradeReportScoreSchema,
    old_comment: z.string().max(1000),
    old_score: gradeReportScoreSchema,
    reason: z.string().trim().min(1).max(500),
    value_id: databaseIdSchema,
  })
  .strict();

export const gradeReportValueRevisionRowsSchema = z.array(
  gradeReportValueRevisionRowSchema,
);
