import type { ContentStatus } from './contentStatus';

export type Assignment = {
  readonly classId: string;
  readonly content: string;
  readonly createdAt: string;
  readonly dueAt: string;
  readonly id: string;
  readonly publishedAt: string | null;
  readonly status: ContentStatus;
  readonly subject: string;
  readonly teacherId: string;
  readonly title: string;
  readonly updatedAt: string;
};
