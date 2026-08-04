import type { ContentStatus } from './contentStatus';

export type Assessment = {
  readonly classId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly publishedAt: string | null;
  readonly status: ContentStatus;
  readonly subject: string;
  readonly teacherId: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type GradeRecord = {
  readonly assessmentId: string;
  readonly comment: string;
  readonly createdAt: string;
  readonly id: string;
  readonly score: number;
  readonly studentId: string;
  readonly updatedAt: string;
};

export type GradeRevision = {
  readonly actorId: string;
  readonly createdAt: string;
  readonly gradeId: string;
  readonly id: string;
  readonly newComment: string;
  readonly newScore: number;
  readonly oldComment: string;
  readonly oldScore: number;
  readonly reason: string;
};
