import type { RoleCode } from '@dolphincloud/auth';

import type { AiWriteActionType } from './contracts';
import { AiServiceError } from './errors';
import { assertNoAuthorizationInjection } from './inputSecurity';
import type { AiPrincipal } from './sessionService';

export type AiActionDraftStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type AiActionDraft = {
  readonly actionType: AiWriteActionType;
  readonly expiresAt: string;
  readonly id: string;
  readonly impact: readonly string[];
  readonly isDangerous: boolean;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly permissionScope: string;
  readonly role: RoleCode;
  readonly roleAssignmentId: string;
  readonly targetId: string;
  readonly targetType: 'assignment' | 'assessment';
  readonly targetVersion: string;
  readonly receipt: Readonly<Record<string, unknown>> | null;
  readonly status: AiActionDraftStatus;
  readonly targets: readonly string[];
  readonly userId: string;
};

export interface AiActionDraftRepository {
  cancel(input: { readonly draftId: string; readonly userId: string }): Promise<void>;
  claim(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly now: string;
    readonly userId: string;
  }): Promise<AiActionDraft>;
  complete(
    draftId: string,
    receipt: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
  create(draft: Omit<AiActionDraft, 'id' | 'status'>): Promise<AiActionDraft>;
  fail(draftId: string): Promise<void>;
}

export interface AiActionExecutionAdapter {
  execute(draft: AiActionDraft): Promise<Readonly<Record<string, unknown>>>;
}

export interface AiActionPreviewResolver {
  resolve(input: {
    readonly actionType: AiWriteActionType;
    readonly context: {
      readonly permissionScope: string;
      readonly role: RoleCode;
      readonly roleAssignmentId: string;
    };
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly principal: AiPrincipal;
  }): Promise<{
    readonly impact: readonly string[];
    readonly isDangerous: boolean;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly targetId: string;
    readonly targetType: 'assignment' | 'assessment';
    readonly targetVersion: string;
    readonly targets: readonly string[];
  }>;
}

export class AiActionDraftService {
  constructor(
    private readonly repository: AiActionDraftRepository,
    private readonly executionAdapter: AiActionExecutionAdapter,
    private readonly previewResolver: AiActionPreviewResolver,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 5 * 60 * 1_000,
  ) {}

  async propose(input: {
    readonly actionType: AiWriteActionType;
    readonly context: {
      readonly permissionScope: string;
      readonly role: RoleCode;
      readonly roleAssignmentId: string;
    };
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly principal: AiPrincipal;
  }): Promise<AiActionDraft> {
    assertNoAuthorizationInjection(input.parameters);
    const now = this.now();
    const derived = await this.previewResolver.resolve(input);
    return this.repository.create({
      actionType: input.actionType,
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      impact: derived.impact,
      isDangerous: derived.isDangerous,
      parameters: derived.parameters,
      permissionScope: input.context.permissionScope,
      receipt: null,
      role: input.context.role,
      roleAssignmentId: input.context.roleAssignmentId,
      targetId: derived.targetId,
      targetType: derived.targetType,
      targetVersion: derived.targetVersion,
      targets: derived.targets,
      userId: input.principal.userId,
    });
  }

  async confirm(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly principal: AiPrincipal | null;
  }): Promise<Readonly<Record<string, unknown>>> {
    if (input.principal === null) {
      throw new AiServiceError('UNAUTHENTICATED', 401);
    }
    const draft = await this.repository.claim({
      dangerousConfirmed: input.dangerousConfirmed,
      draftId: input.draftId,
      now: this.now().toISOString(),
      userId: input.principal.userId,
    });
    if (draft.status === 'completed' && draft.receipt !== null) {
      return draft.receipt;
    }
    let receipt: Readonly<Record<string, unknown>>;
    try {
      receipt = await this.executionAdapter.execute(draft);
    } catch (error) {
      await this.repository.fail(draft.id);
      throw error;
    }
    return await this.repository.complete(draft.id, receipt);
  }

  async cancel(
    principal: AiPrincipal | null,
    draftId: string,
  ): Promise<void> {
    if (principal === null) {
      throw new AiServiceError('UNAUTHENTICATED', 401);
    }
    await this.repository.cancel({ draftId, userId: principal.userId });
  }
}
