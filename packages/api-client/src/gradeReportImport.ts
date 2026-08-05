import type { GradeReportImportSource } from '@dolphincloud/domain';
import {
  gradeReportImportDefinitionSchema,
  saveGradeReportSheetDraftSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';
import type { SaveGradeReportSheetDraftInput } from './gradeReportSheetService';

export type GradeReportImportDefinition = {
  readonly columns: readonly {
    readonly columnKey: string;
    readonly commentHeader: string | null;
    readonly maxScore: number | null;
    readonly name: string;
    readonly scoreHeader: string;
  }[];
  readonly studentIdHeader: string;
};

export type GradeReportImportContext = {
  readonly classId: string;
  readonly sheetId: string | null;
  readonly subject: string;
  readonly title: string;
};

type ImportCell = string | number | null;

export function parseGradeReportCsvRows(csv: string): ImportCell[][] {
  const rows: ImportCell[][] = [];
  let row: ImportCell[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && character === ',') {
      row.push(value);
      value = '';
      continue;
    }
    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && csv[index + 1] === '\n') {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => String(cell ?? '').trim() !== '')) {
        rows.push(row);
      }
      row = [];
      value = '';
      continue;
    }
    value += character;
  }

  if (inQuotes) {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  row.push(value);
  if (row.some((cell) => String(cell ?? '').trim() !== '')) {
    rows.push(row);
  }
  return rows;
}

function readHeader(cell: ImportCell | undefined): string {
  if (typeof cell !== 'string') {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  return cell.replace(/^\uFEFF/u, '').trim();
}

function readScore(cell: ImportCell | undefined): number {
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) {
      throw new ApiClientError('VALIDATION_ERROR');
    }
    return cell;
  }
  if (typeof cell !== 'string' || cell.trim() === '') {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  const score = Number(cell.trim());
  if (!Number.isFinite(score)) {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  return score;
}

function readText(cell: ImportCell | undefined): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  if (typeof cell !== 'string' && typeof cell !== 'number') {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  return String(cell).trim();
}

export function normalizeGradeReportMatrix(
  context: GradeReportImportContext,
  definition: GradeReportImportDefinition,
  matrix: readonly (readonly ImportCell[])[],
  source: Exclude<GradeReportImportSource, 'grid'>,
): SaveGradeReportSheetDraftInput {
  const parsedDefinition = gradeReportImportDefinitionSchema.safeParse(definition);
  if (!parsedDefinition.success || matrix.length < 2) {
    throw new ApiClientError('VALIDATION_ERROR', {
      cause: parsedDefinition.success ? undefined : parsedDefinition.error,
    });
  }

  const headerRow = matrix[0];
  if (headerRow === undefined) {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  const headers = headerRow.map(readHeader);
  if (headers.some((header) => header === '') || new Set(headers).size !== headers.length) {
    throw new ApiClientError('VALIDATION_ERROR');
  }

  const requireHeader = (header: string): number => {
    const index = headers.indexOf(header);
    if (index < 0) {
      throw new ApiClientError('VALIDATION_ERROR');
    }
    return index;
  };

  const studentIdIndex = requireHeader(parsedDefinition.data.studentIdHeader);
  const columnIndexes = parsedDefinition.data.columns.map((column) => ({
    column,
    commentIndex:
      column.commentHeader === null ? null : requireHeader(column.commentHeader),
    scoreIndex: requireHeader(column.scoreHeader),
  }));

  const rows = matrix.slice(1).map((row) => ({
    studentId: readText(row[studentIdIndex]),
    values: columnIndexes.map(({ column, commentIndex, scoreIndex }) => ({
      columnKey: column.columnKey,
      comment: commentIndex === null ? '' : readText(row[commentIndex]),
      score: readScore(row[scoreIndex]),
    })),
  }));

  const draft = {
    ...context,
    columns: parsedDefinition.data.columns.map((column, position) => ({
      columnKey: column.columnKey,
      maxScore: column.maxScore,
      name: column.name,
      position,
    })),
    rows,
    source,
  };
  const parsedDraft = saveGradeReportSheetDraftSchema.safeParse(draft);
  if (!parsedDraft.success) {
    throw new ApiClientError('VALIDATION_ERROR', { cause: parsedDraft.error });
  }
  return parsedDraft.data;
}

export function normalizeGradeReportCsv(
  context: GradeReportImportContext,
  definition: GradeReportImportDefinition,
  csv: string,
): SaveGradeReportSheetDraftInput {
  return normalizeGradeReportMatrix(
    context,
    definition,
    parseGradeReportCsvRows(csv),
    'csv',
  );
}

export function normalizeGradeReportCsvUpload(
  context: GradeReportImportContext,
  csv: string,
): SaveGradeReportSheetDraftInput {
  const matrix = parseGradeReportCsvRows(csv);
  const headerRow = matrix[0];
  if (headerRow === undefined) {
    throw new ApiClientError('VALIDATION_ERROR');
  }
  const headers = headerRow.map(readHeader);
  if (!headers.includes('student_id')) {
    throw new ApiClientError('VALIDATION_ERROR', {
      cause: new Error('CSV_MISSING_STUDENT_ID'),
    });
  }
  if (headers.some((header) => header === '') || new Set(headers).size !== headers.length) {
    throw new ApiClientError('VALIDATION_ERROR', {
      cause: new Error('CSV_DUPLICATE_OR_EMPTY_HEADER'),
    });
  }

  const commentHeaders = new Set(
    headers.filter((header) => header !== 'student_id' && header.endsWith('评语')),
  );
  const scoreHeaders = headers.filter(
    (header) => header !== 'student_id' && !commentHeaders.has(header),
  );
  if (scoreHeaders.length === 0) {
    throw new ApiClientError('VALIDATION_ERROR', {
      cause: new Error('CSV_MISSING_GRADE_ITEM'),
    });
  }

  const columns = scoreHeaders.map((scoreHeader, index) => {
    const match = /^(.*?)(?:\[([^\]]+)\])?$/u.exec(scoreHeader);
    const name = match?.[1]?.trim() ?? '';
    const maxScoreText = match?.[2]?.trim();
    if (name === '' || name.includes('[') || name.includes(']')) {
      throw new ApiClientError('VALIDATION_ERROR', {
        cause: new Error(`CSV_INVALID_GRADE_ITEM:${scoreHeader}`),
      });
    }
    const maxScore =
      maxScoreText === undefined || maxScoreText === ''
        ? null
        : Number(maxScoreText);
    if (maxScore !== null && !Number.isFinite(maxScore)) {
      throw new ApiClientError('VALIDATION_ERROR', {
        cause: new Error(`CSV_INVALID_MAX_SCORE:${scoreHeader}`),
      });
    }
    const commentHeader = `${name}评语`;
    return {
      columnKey: `item_${index + 1}`,
      commentHeader: commentHeaders.has(commentHeader) ? commentHeader : null,
      maxScore,
      name,
      scoreHeader,
    };
  });
  const knownCommentHeaders = new Set(
    columns.flatMap((column) =>
      column.commentHeader === null ? [] : [column.commentHeader],
    ),
  );
  if ([...commentHeaders].some((header) => !knownCommentHeaders.has(header))) {
    throw new ApiClientError('VALIDATION_ERROR', {
      cause: new Error('CSV_ORPHAN_COMMENT_COLUMN'),
    });
  }

  return normalizeGradeReportMatrix(
    context,
    { columns, studentIdHeader: 'student_id' },
    matrix,
    'csv',
  );
}
