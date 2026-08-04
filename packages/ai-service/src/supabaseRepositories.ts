import type { RoleCode } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AiActionDraft,
  AiActionDraftRepository,
  AiActionExecutionAdapter,
  AiActionPreviewResolver,
} from './actionDraftService';
import type { AiWriteActionType } from './contracts';
import { AiServiceError } from './errors';
import type { AiSession, AiSessionRepository } from './sessionService';
import type { AiSkillContext } from './skillQueryService';

type AiSessionRow = {
  readonly coze_conversation_ref: string | null;
  readonly id: string;
  readonly status: AiSession['status'];
  readonly role_assignment_id: string;
  readonly user_id: string;
};

type AiActionDraftRow = {
  readonly action_type: AiWriteActionType;
  readonly expires_at: string;
  readonly id: string;
  readonly impact: readonly string[];
  readonly is_dangerous: boolean;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly permission_scope: string;
  readonly role: RoleCode;
  readonly role_assignment_id: string;
  readonly target_id: string;
  readonly target_type: AiActionDraft['targetType'];
  readonly target_version: string;
  readonly receipt: Readonly<Record<string, unknown>> | null;
  readonly status: AiActionDraft['status'];
  readonly targets: readonly string[];
  readonly user_id: string;
};

function mapSession(row: AiSessionRow): AiSession {
  return {
    conversationReference: row.coze_conversation_ref,
    id: row.id,
    roleAssignmentId: row.role_assignment_id,
    status: row.status,
    userId: row.user_id,
  };
}

function mapDraft(row: AiActionDraftRow): AiActionDraft {
  return {
    actionType: row.action_type,
    expiresAt: row.expires_at,
    id: row.id,
    impact: row.impact,
    isDangerous: row.is_dangerous,
    parameters: row.parameters,
    permissionScope: row.permission_scope,
    receipt: row.receipt,
    role: row.role,
    roleAssignmentId: row.role_assignment_id,
    status: row.status,
    targets: row.targets,
    targetId: row.target_id,
    targetType: row.target_type,
    targetVersion: row.target_version,
    userId: row.user_id,
  };
}

export class SupabaseAiSessionRepository implements AiSessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(_userId: string, roleAssignmentId: string): Promise<AiSession> {
    const { data, error } = await this.client.rpc('create_ai_session', {
      selected_role_assignment_id: roleAssignmentId,
    });
    if (error !== null || data === null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    return mapSession(data as AiSessionRow);
  }

  async findById(sessionId: string): Promise<AiSession | null> {
    const { data, error } = await this.client
      .from('ai_sessions')
      .select('id, user_id, role_assignment_id, coze_conversation_ref, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (error !== null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    return data === null ? null : mapSession(data as AiSessionRow);
  }

  async updateConversationReference(
    sessionId: string,
    conversationReference: string,
  ): Promise<void> {
    const { error } = await this.client.rpc('update_ai_session_conversation', {
      conversation_reference: conversationReference,
      target_session_id: sessionId,
    });
    if (error !== null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
  }
}

export class SupabaseAiActionDraftRepository
  implements AiActionDraftRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async create(
    draft: Omit<AiActionDraft, 'id' | 'status'>,
  ): Promise<AiActionDraft> {
    const { data, error } = await this.client.rpc('create_ai_action_draft', {
      requested_action_type: draft.actionType,
      requested_parameters: draft.parameters,
      selected_role_assignment_id: draft.roleAssignmentId,
    });
    if (error !== null || data === null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    return mapDraft(data as AiActionDraftRow);
  }

  async claim(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly now: string;
    readonly userId: string;
  }): Promise<AiActionDraft> {
    const { data, error } = await this.client.rpc('claim_ai_action_draft', {
      dangerous_confirmed: input.dangerousConfirmed,
      target_draft_id: input.draftId,
    });
    if (error !== null || data === null) {
      throw this.mapDraftError(error?.message);
    }
    const mapped = mapDraft(data as AiActionDraftRow);
    if (mapped.status === 'expired') {
      throw new AiServiceError('DRAFT_EXPIRED', 409);
    }
    return mapped;
  }

  async cancel(input: {
    readonly draftId: string;
    readonly userId: string;
  }): Promise<void> {
    const { error } = await this.client.rpc('cancel_ai_action_draft', {
      target_draft_id: input.draftId,
    });
    if (error !== null) {
      throw this.mapDraftError(error.message);
    }
  }

  async complete(
    draftId: string,
    receipt: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    return await this.finish(draftId, true, receipt);
  }

  async fail(draftId: string): Promise<void> {
    await this.finish(draftId, false, {});
  }

  private async finish(
    draftId: string,
    succeeded: boolean,
    receipt: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const { data, error } = await this.client.rpc('finish_ai_action_draft', {
      execution_receipt: receipt,
      succeeded,
      target_draft_id: draftId,
    });
    if (error !== null) {
      throw this.mapDraftError(error.message);
    }
    return isRecord(data) ? data : receipt;
  }

  private mapDraftError(message: string | undefined): AiServiceError {
    if (message?.includes('SECOND_CONFIRMATION_REQUIRED') === true) {
      return new AiServiceError('SECOND_CONFIRMATION_REQUIRED', 409);
    }
    if (message?.includes('DRAFT_EXPIRED') === true) {
      return new AiServiceError('DRAFT_EXPIRED', 409);
    }
    if (message?.includes('DRAFT_ALREADY_USED') === true) {
      return new AiServiceError('DRAFT_ALREADY_USED', 409);
    }
    if (message?.includes('DRAFT_IN_PROGRESS') === true) {
      return new AiServiceError('CONFLICT', 409);
    }
    if (message?.includes('TARGET_VERSION_CHANGED') === true) {
      return new AiServiceError('CONFLICT', 409);
    }
    if (message?.includes('FORBIDDEN') === true) {
      return new AiServiceError('FORBIDDEN', 403);
    }
    return new AiServiceError('NOT_FOUND', 404);
  }
}

export class SupabaseAiActionExecutionAdapter
  implements AiActionExecutionAdapter
{
  constructor(private readonly client: SupabaseClient) {}

  async execute(
    draft: AiActionDraft,
  ): Promise<Readonly<Record<string, unknown>>> {
    const idKey =
      draft.actionType === 'assignment_publish'
        ? 'assignmentId'
        : 'assessmentId';
    const targetId = draft.parameters[idKey];
    if (typeof targetId !== 'string') {
      throw new AiServiceError('VALIDATION_ERROR', 422);
    }
    const { error } = await this.client.rpc(
      draft.actionType === 'assignment_publish'
        ? 'publish_assignment'
        : 'publish_assessment',
      draft.actionType === 'assignment_publish'
        ? { target_assignment_id: targetId }
        : { target_assessment_id: targetId },
    );
    if (error !== null) {
      const currentTable =
        draft.targetType === 'assignment' ? 'assignments' : 'assessments';
      const { data: current } = await this.client
        .from(currentTable)
        .select('status')
        .eq('id', targetId)
        .maybeSingle();
      if (current?.status !== 'published') {
        throw new AiServiceError('FORBIDDEN', 403, { cause: error });
      }
    }
    return { status: 'published', targetId };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class SupabaseAiActionPreviewResolver
  implements AiActionPreviewResolver
{
  constructor(private readonly client: SupabaseClient) {}

  async resolve(
    input: Parameters<AiActionPreviewResolver['resolve']>[0],
  ): Promise<Awaited<ReturnType<AiActionPreviewResolver['resolve']>>> {
    const key =
      input.actionType === 'assignment_publish'
        ? 'assignmentId'
        : 'assessmentId';
    const targetId = input.parameters[key];
    if (
      typeof targetId !== 'string' ||
      Object.keys(input.parameters).some((parameter) => parameter !== key)
    ) {
      throw new AiServiceError('VALIDATION_ERROR', 422);
    }
    const table =
      input.actionType === 'assignment_publish' ? 'assignments' : 'assessments';
    const { data, error } = await this.client
      .from(table)
      .select('id, title, class_id, updated_at, status, classes(name)')
      .eq('id', targetId)
      .single();
    if (
      error !== null ||
      data === null ||
      data.status !== 'draft' ||
      typeof data.updated_at !== 'string'
    ) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    const classValue = data.classes;
    const className =
      isRecord(classValue) && typeof classValue.name === 'string'
        ? classValue.name
        : String(data.class_id);
    return {
      impact: [
        input.actionType === 'assignment_publish'
          ? '发布后班级端和绑定家庭端可见'
          : '发布后仅绑定家庭端可见个人成绩',
      ],
      isDangerous: true,
      parameters: { [key]: targetId },
      targetId,
      targetType:
        input.actionType === 'assignment_publish' ? 'assignment' : 'assessment',
      targetVersion: data.updated_at,
      targets: [`${className} · ${String(data.title)}`],
    };
  }
}

export async function resolveSupabaseSkillContext(
  client: SupabaseClient,
  userId: string,
  roleAssignmentId: string,
): Promise<AiSkillContext> {
  const { data, error } = await client
    .from('role_assignments')
    .select('id, role, scope_type, scope_id')
    .eq('id', roleAssignmentId)
    .eq('user_id', userId)
    .single();
  if (
    error !== null ||
    data === null ||
    typeof data.role !== 'string' ||
    typeof data.scope_type !== 'string' ||
    typeof data.scope_id !== 'string'
  ) {
    throw new AiServiceError('FORBIDDEN', 403, { cause: error });
  }
  return {
    permissionScope: `${data.scope_type}:${data.scope_id}`,
    role: data.role as RoleCode,
    roleAssignmentId,
    userId,
  };
}
