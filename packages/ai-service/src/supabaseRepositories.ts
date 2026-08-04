import type { RoleCode } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AiActionDraft,
  AiActionDraftRepository,
  AiActionExecutionAdapter,
} from './actionDraftService';
import type { AiWriteActionType } from './contracts';
import { AiServiceError } from './errors';
import type { AiSession, AiSessionRepository } from './sessionService';
import type { AiSkillContext } from './skillQueryService';

type AiSessionRow = {
  readonly coze_conversation_ref: string | null;
  readonly id: string;
  readonly status: AiSession['status'];
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
  readonly status: AiActionDraft['status'];
  readonly targets: readonly string[];
  readonly user_id: string;
};

function mapSession(row: AiSessionRow): AiSession {
  return {
    conversationReference: row.coze_conversation_ref,
    id: row.id,
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
    role: row.role,
    status: row.status,
    targets: row.targets,
    userId: row.user_id,
  };
}

export class SupabaseAiSessionRepository implements AiSessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(_userId: string): Promise<AiSession> {
    const { data, error } = await this.client.rpc('create_ai_session');
    if (error !== null || data === null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    return mapSession(data as AiSessionRow);
  }

  async findById(sessionId: string): Promise<AiSession | null> {
    const { data, error } = await this.client
      .from('ai_sessions')
      .select('id, user_id, coze_conversation_ref, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (error !== null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
    return data === null ? null : mapSession(data as AiSessionRow);
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
      requested_impact: draft.impact,
      requested_parameters: draft.parameters,
      requested_targets: draft.targets,
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
    return mapDraft(data as AiActionDraftRow);
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

  async complete(draftId: string): Promise<void> {
    await this.finish(draftId, true);
  }

  async fail(draftId: string): Promise<void> {
    await this.finish(draftId, false);
  }

  private async finish(draftId: string, succeeded: boolean): Promise<void> {
    const { error } = await this.client.rpc('finish_ai_action_draft', {
      succeeded,
      target_draft_id: draftId,
    });
    if (error !== null) {
      throw this.mapDraftError(error.message);
    }
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

  async execute(draft: AiActionDraft): Promise<void> {
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
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
  }
}

export async function resolveSupabaseSkillContext(
  client: SupabaseClient,
  userId: string,
): Promise<AiSkillContext> {
  const { data, error } = await client
    .from('role_assignments')
    .select('role, scope_type, scope_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
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
    userId,
  };
}
