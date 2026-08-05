export const GRADE_REPORT_IMPORT_SOURCES = ['grid', 'csv', 'xlsx'] as const;
export type GradeReportImportSource =
  (typeof GRADE_REPORT_IMPORT_SOURCES)[number];

export const GRADE_REPORT_SHEET_STATUSES = ['draft', 'published'] as const;
export type GradeReportSheetStatus =
  (typeof GRADE_REPORT_SHEET_STATUSES)[number];

export type GradeReportColumn = {
  readonly columnKey: string;
  readonly id: string;
  readonly maxScore: number | null;
  readonly name: string;
  readonly position: number;
};

export type GradeReportValue = {
  readonly columnId: string;
  readonly comment: string;
  readonly id: string;
  readonly score: number;
};

export type GradeReportStudentRow = {
  readonly id: string;
  readonly studentId: string;
  readonly values: readonly GradeReportValue[];
};

export type GradeReportSheet = {
  readonly classId: string;
  readonly columns: readonly GradeReportColumn[];
  readonly createdAt: string;
  readonly id: string;
  readonly publishedAt: string | null;
  readonly rows: readonly GradeReportStudentRow[];
  readonly source: GradeReportImportSource;
  readonly status: GradeReportSheetStatus;
  readonly subject: string;
  readonly teacherId: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type GradeReportValueRevision = {
  readonly actorId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly newComment: string;
  readonly newScore: number;
  readonly oldComment: string;
  readonly oldScore: number;
  readonly reason: string;
  readonly valueId: string;
};
