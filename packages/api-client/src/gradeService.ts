import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Assessment,
  GradeRecord,
  GradeRevision,
} from '@dolphincloud/domain';
import {
  createAssessmentDraftSchema,
  reviseGradeSchema,
  saveGradeDraftsSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';

export type CreateAssessmentDraftInput = {
  readonly classId: string;
  readonly subject: string;
  readonly title: string;
};

export type GradeDraftInput = {
  readonly comment: string;
  readonly score: number;
  readonly studentId: string;
};

export type ReviseGradeInput = {
  readonly comment: string;
  readonly reason: string;
  readonly score: number;
};

export interface GradeService {
  createAssessmentDraft(
    input: CreateAssessmentDraftInput,
  ): Promise<Assessment>;
  listRevisions(gradeId: string): Promise<readonly GradeRevision[]>;
  listStudentGrades(studentId: string): Promise<readonly GradeRecord[]>;
  publishAssessment(assessmentId: string): Promise<Assessment>;
  reviseGrade(gradeId: string, input: ReviseGradeInput): Promise<GradeRecord>;
  saveGradeDrafts(
    assessmentId: string,
    grades: readonly GradeDraftInput[],
  ): Promise<readonly GradeRecord[]>;
}

type AssessmentRow = {
  readonly class_id: string;
  readonly created_at: string;
  readonly id: string;
  readonly published_at: string | null;
  readonly status: Assessment['status'];
  readonly subject: string;
  readonly teacher_id: string;
  readonly title: string;
  readonly updated_at: string;
};

type GradeRecordRow = {
  readonly assessment_id: string;
  readonly comment: string;
  readonly created_at: string;
  readonly id: string;
  readonly score: number;
  readonly student_id: string;
  readonly updated_at: string;
};

type GradeRevisionRow = {
  readonly actor_id: string;
  readonly created_at: string;
  readonly grade_id: string;
  readonly id: string;
  readonly new_comment: string;
  readonly new_score: number;
  readonly old_comment: string;
  readonly old_score: number;
  readonly reason: string;
};

const ASSESSMENT_COLUMNS =
  'id, teacher_id, class_id, subject, title, status, published_at, created_at, updated_at';
const GRADE_COLUMNS =
  'id, assessment_id, student_id, score, comment, created_at, updated_at';

function mapAssessment(row: AssessmentRow): Assessment {
  return {
    classId: row.class_id,
    createdAt: row.created_at,
    id: row.id,
    publishedAt: row.published_at,
    status: row.status,
    subject: row.subject,
    teacherId: row.teacher_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function mapGradeRecord(row: GradeRecordRow): GradeRecord {
  return {
    assessmentId: row.assessment_id,
    comment: row.comment,
    createdAt: row.created_at,
    id: row.id,
    score: Number(row.score),
    studentId: row.student_id,
    updatedAt: row.updated_at,
  };
}

function mapGradeRevision(row: GradeRevisionRow): GradeRevision {
  return {
    actorId: row.actor_id,
    createdAt: row.created_at,
    gradeId: row.grade_id,
    id: row.id,
    newComment: row.new_comment,
    newScore: Number(row.new_score),
    oldComment: row.old_comment,
    oldScore: Number(row.old_score),
    reason: row.reason,
  };
}

export class SupabaseGradeService implements GradeService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createAssessmentDraft(
    input: CreateAssessmentDraftInput,
  ): Promise<Assessment> {
    const parsed = createAssessmentDraftSchema.safeParse(input);

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const { data, error } = await this.client
      .from('assessments')
      .insert({
        class_id: parsed.data.classId,
        subject: parsed.data.subject,
        title: parsed.data.title,
      })
      .select(ASSESSMENT_COLUMNS)
      .single();

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapAssessment(data as AssessmentRow);
  }

  async listRevisions(gradeId: string): Promise<readonly GradeRevision[]> {
    const { data, error } = await this.client
      .from('grade_revisions')
      .select(
        'id, grade_id, old_score, new_score, old_comment, new_comment, reason, actor_id, created_at',
      )
      .eq('grade_id', gradeId)
      .order('created_at', { ascending: false });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return (data as GradeRevisionRow[]).map(mapGradeRevision);
  }

  async listStudentGrades(studentId: string): Promise<readonly GradeRecord[]> {
    const { data, error } = await this.client
      .from('grade_records')
      .select(GRADE_COLUMNS)
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return (data as GradeRecordRow[]).map(mapGradeRecord);
  }

  async publishAssessment(assessmentId: string): Promise<Assessment> {
    const { data, error } = await this.client.rpc('publish_assessment', {
      target_assessment_id: assessmentId,
    });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapAssessment(data as AssessmentRow);
  }

  async reviseGrade(
    gradeId: string,
    input: ReviseGradeInput,
  ): Promise<GradeRecord> {
    const parsed = reviseGradeSchema.safeParse({ gradeId, ...input });

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const { data, error } = await this.client.rpc('revise_grade', {
      revised_comment: parsed.data.comment,
      revised_score: parsed.data.score,
      revision_reason: parsed.data.reason,
      target_grade_id: parsed.data.gradeId,
    });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapGradeRecord(data as GradeRecordRow);
  }

  async saveGradeDrafts(
    assessmentId: string,
    grades: readonly GradeDraftInput[],
  ): Promise<readonly GradeRecord[]> {
    const parsed = saveGradeDraftsSchema.safeParse({ assessmentId, grades });

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const { data, error } = await this.client
      .from('grade_records')
      .upsert(
        parsed.data.grades.map((grade) => ({
          assessment_id: parsed.data.assessmentId,
          comment: grade.comment,
          score: grade.score,
          student_id: grade.studentId,
        })),
        { onConflict: 'assessment_id,student_id' },
      )
      .select(GRADE_COLUMNS);

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return (data as GradeRecordRow[]).map(mapGradeRecord);
  }
}
