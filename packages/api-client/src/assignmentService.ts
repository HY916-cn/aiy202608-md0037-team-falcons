import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment } from '@dolphincloud/domain';
import {
  createAssignmentDraftSchema,
  updateAssignmentDraftSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';

export type CreateAssignmentDraftInput = {
  readonly classId: string;
  readonly content: string;
  readonly dueAt: string;
  readonly subject: string;
  readonly title: string;
};

export type UpdateAssignmentDraftInput = {
  readonly content?: string;
  readonly dueAt?: string;
  readonly subject?: string;
  readonly title?: string;
};

export interface AssignmentService {
  createDraft(input: CreateAssignmentDraftInput): Promise<Assignment>;
  listForClass(classId: string): Promise<readonly Assignment[]>;
  publish(assignmentId: string): Promise<Assignment>;
  updateDraft(
    assignmentId: string,
    input: UpdateAssignmentDraftInput,
  ): Promise<Assignment>;
}

type AssignmentRow = {
  readonly class_id: string;
  readonly content: string;
  readonly created_at: string;
  readonly due_at: string;
  readonly id: string;
  readonly published_at: string | null;
  readonly status: Assignment['status'];
  readonly subject: string;
  readonly teacher_id: string;
  readonly title: string;
  readonly updated_at: string;
};

const ASSIGNMENT_COLUMNS =
  'id, teacher_id, class_id, subject, title, content, due_at, status, published_at, created_at, updated_at';

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    classId: row.class_id,
    content: row.content,
    createdAt: row.created_at,
    dueAt: row.due_at,
    id: row.id,
    publishedAt: row.published_at,
    status: row.status,
    subject: row.subject,
    teacherId: row.teacher_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAssignmentService implements AssignmentService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createDraft(input: CreateAssignmentDraftInput): Promise<Assignment> {
    const parsed = createAssignmentDraftSchema.safeParse(input);

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const { data, error } = await this.client
      .from('assignments')
      .insert({
        class_id: parsed.data.classId,
        content: parsed.data.content,
        due_at: parsed.data.dueAt,
        subject: parsed.data.subject,
        title: parsed.data.title,
      })
      .select(ASSIGNMENT_COLUMNS)
      .single();

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapAssignment(data as AssignmentRow);
  }

  async listForClass(classId: string): Promise<readonly Assignment[]> {
    const { data, error } = await this.client
      .from('assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('class_id', classId)
      .order('due_at', { ascending: true });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return (data as AssignmentRow[]).map(mapAssignment);
  }

  async publish(assignmentId: string): Promise<Assignment> {
    const { data, error } = await this.client.rpc('publish_assignment', {
      target_assignment_id: assignmentId,
    });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapAssignment(data as AssignmentRow);
  }

  async updateDraft(
    assignmentId: string,
    input: UpdateAssignmentDraftInput,
  ): Promise<Assignment> {
    const parsed = updateAssignmentDraftSchema.safeParse(input);

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const values = {
      ...(parsed.data.content === undefined
        ? {}
        : { content: parsed.data.content }),
      ...(parsed.data.dueAt === undefined
        ? {}
        : { due_at: parsed.data.dueAt }),
      ...(parsed.data.subject === undefined
        ? {}
        : { subject: parsed.data.subject }),
      ...(parsed.data.title === undefined ? {} : { title: parsed.data.title }),
    };
    const { data, error } = await this.client
      .from('assignments')
      .update(values)
      .eq('id', assignmentId)
      .eq('status', 'draft')
      .select(ASSIGNMENT_COLUMNS)
      .single();

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapAssignment(data as AssignmentRow);
  }
}
