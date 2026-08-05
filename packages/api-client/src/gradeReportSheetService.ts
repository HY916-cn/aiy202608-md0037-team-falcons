import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  GradeReportSheet,
  GradeReportValueRevision,
} from '@dolphincloud/domain';
import {
  databaseIdSchema,
  gradeReportSheetListResponseSchema,
  gradeReportSheetResponseSchema,
  gradeReportValueRevisionRowsSchema,
  reviseGradeReportValueSchema,
  saveGradeReportSheetDraftSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';

export type SaveGradeReportSheetDraftInput = {
  readonly classId: string;
  readonly columns: readonly {
    readonly columnKey: string;
    readonly maxScore: number | null;
    readonly name: string;
    readonly position: number;
  }[];
  readonly rows: readonly {
    readonly studentId: string;
    readonly values: readonly {
      readonly columnKey: string;
      readonly comment: string;
      readonly score: number;
    }[];
  }[];
  readonly sheetId: string | null;
  readonly source: 'grid' | 'csv' | 'xlsx';
  readonly subject: string;
  readonly title: string;
};

export type ReviseGradeReportValueInput = {
  readonly comment: string;
  readonly reason: string;
  readonly score: number;
};

export interface GradeReportSheetService {
  getSheet(sheetId: string): Promise<GradeReportSheet>;
  listClassSheets(classId: string): Promise<readonly GradeReportSheet[]>;
  listStudentSheets(studentId: string): Promise<readonly GradeReportSheet[]>;
  listValueRevisions(
    valueId: string,
  ): Promise<readonly GradeReportValueRevision[]>;
  publishSheet(sheetId: string): Promise<GradeReportSheet>;
  reviseValue(
    valueId: string,
    input: ReviseGradeReportValueInput,
  ): Promise<GradeReportSheet>;
  saveDraft(input: SaveGradeReportSheetDraftInput): Promise<GradeReportSheet>;
}

type GradeReportRevisionRow = {
  readonly actor_id: string;
  readonly created_at: string;
  readonly id: string;
  readonly new_comment: string;
  readonly new_score: number;
  readonly old_comment: string;
  readonly old_score: number;
  readonly reason: string;
  readonly value_id: string;
};

function parseDatabaseId(value: string): string {
  const parsed = databaseIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
  }
  return parsed.data;
}

function parseSheet(value: unknown): GradeReportSheet {
  const parsed = gradeReportSheetResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiClientError('INTERNAL_ERROR', { cause: parsed.error });
  }
  return parsed.data;
}

function parseSheetList(value: unknown): readonly GradeReportSheet[] {
  const parsed = gradeReportSheetListResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiClientError('INTERNAL_ERROR', { cause: parsed.error });
  }
  return parsed.data;
}

function mapRevision(row: GradeReportRevisionRow): GradeReportValueRevision {
  return {
    actorId: row.actor_id,
    createdAt: row.created_at,
    id: row.id,
    newComment: row.new_comment,
    newScore: Number(row.new_score),
    oldComment: row.old_comment,
    oldScore: Number(row.old_score),
    reason: row.reason,
    valueId: row.value_id,
  };
}

function toRpcDraft(input: SaveGradeReportSheetDraftInput) {
  return {
    normalized_columns: input.columns.map((column) => ({
      column_key: column.columnKey,
      max_score: column.maxScore,
      name: column.name,
      position: column.position,
    })),
    normalized_rows: input.rows.map((row) => ({
      student_id: row.studentId,
      values: row.values.map((value) => ({
        column_key: value.columnKey,
        comment: value.comment,
        score: value.score,
      })),
    })),
    sheet_source: input.source,
    sheet_subject: input.subject,
    sheet_title: input.title,
    target_class_id: input.classId,
    target_sheet_id: input.sheetId,
  };
}

export class SupabaseGradeReportSheetService
  implements GradeReportSheetService
{
  constructor(private readonly client: SupabaseClient) {}

  async getSheet(sheetId: string): Promise<GradeReportSheet> {
    const parsedSheetId = parseDatabaseId(sheetId);
    const { data, error } = await this.client.rpc('get_grade_report_sheet', {
      target_sheet_id: parsedSheetId,
    });
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheet(data);
  }

  async listClassSheets(
    classId: string,
  ): Promise<readonly GradeReportSheet[]> {
    const parsedClassId = parseDatabaseId(classId);
    const { data, error } = await this.client.rpc(
      'list_grade_report_sheets_for_class',
      { target_class_id: parsedClassId },
    );
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheetList(data);
  }

  async listStudentSheets(
    studentId: string,
  ): Promise<readonly GradeReportSheet[]> {
    const parsedStudentId = parseDatabaseId(studentId);
    const { data, error } = await this.client.rpc(
      'list_published_grade_report_sheets_for_student',
      { target_student_id: parsedStudentId },
    );
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheetList(data);
  }

  async listValueRevisions(
    valueId: string,
  ): Promise<readonly GradeReportValueRevision[]> {
    const parsedValueId = parseDatabaseId(valueId);
    const { data, error } = await this.client
      .from('grade_report_value_revisions')
      .select(
        'id, value_id, old_score, new_score, old_comment, new_comment, reason, actor_id, created_at',
      )
      .eq('value_id', parsedValueId)
      .order('created_at', { ascending: false });
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    const parsedRows = gradeReportValueRevisionRowsSchema.safeParse(data);
    if (!parsedRows.success) {
      throw new ApiClientError('INTERNAL_ERROR', { cause: parsedRows.error });
    }
    return (parsedRows.data as GradeReportRevisionRow[]).map(mapRevision);
  }

  async publishSheet(sheetId: string): Promise<GradeReportSheet> {
    const parsedSheetId = parseDatabaseId(sheetId);
    const { data, error } = await this.client.rpc('publish_grade_report_sheet', {
      target_sheet_id: parsedSheetId,
    });
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheet(data);
  }

  async reviseValue(
    valueId: string,
    input: ReviseGradeReportValueInput,
  ): Promise<GradeReportSheet> {
    const parsed = reviseGradeReportValueSchema.safeParse({ valueId, ...input });
    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }
    const { data, error } = await this.client.rpc('revise_grade_report_value', {
      revised_comment: parsed.data.comment,
      revised_score: parsed.data.score,
      revision_reason: parsed.data.reason,
      target_value_id: parsed.data.valueId,
    });
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheet(data);
  }

  async saveDraft(
    input: SaveGradeReportSheetDraftInput,
  ): Promise<GradeReportSheet> {
    const parsed = saveGradeReportSheetDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }
    const { data, error } = await this.client.rpc(
      'save_grade_report_sheet_draft',
      toRpcDraft(parsed.data),
    );
    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
    return parseSheet(data);
  }
}
