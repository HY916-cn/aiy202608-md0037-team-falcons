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
  complete(draftId: string): Promise<void>;
  create(draft: Omit<AiActionDraft, 'id' | 'status'>): Promise<AiActionDraft>;
  fail(draftId: string): Promise<void>;
}

export interface AiActionExecutionAdapter {
  execute(draft: AiActionDraft): Promise<void>;
}

export class AiActionDraftService {
  constructor(
    private readonly repository: AiActionDraftRepository,
    private readonly executionAdapter: AiActionExecutionAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 5 * 60 * 1_000,
  ) {}

  async propose(input: {
    readonly actionType: AiWriteActionType;
    readonly context: {
      readonly permissionScope: string;
      readonly role: RoleCode;
    };
    readonly impact: readonly string[];
    readonly isDangerous: boolean;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly principal: AiPrincipal;
    readonly targets: readonly string[];
  }): Promise<AiActionDraft> {
    assertNoAuthorizationInjection(input.parameters);
    const now = this.now();
    return this.repository.create({
      actionType: input.actionType,
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      impact: input.impact,
      isDangerous: input.isDangerous,
      parameters: input.parameters,
      permissionScope: input.context.permissionScope,
      role: input.context.role,
      targets: input.targets,
      userId: input.principal.userId,
    });
  }

  async confirm(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly principal: AiPrincipal | null;
  }): Promise<void> {
    if (input.principal === null) {
      throw new AiServiceError('UNAUTHENTICATED', 401);
    }
    const draft = await this.repository.claim({
      dangerousConfirmed: input.dangerousConfirmed,
      draftId: input.draftId,
      now: this.now().toISOString(),
      userId: input.principal.userId,
    });
    try {
      await this.executionAdapter.execute(draft);
      await this.repository.complete(draft.id);
    } catch (error) {
      await this.repository.fail(draft.id);
      throw error;
    }
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
