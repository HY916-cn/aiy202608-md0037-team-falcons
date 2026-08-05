import { describe, expect, it, vi } from 'vitest';

import {
  type AiActionDraft,
  type AiActionDraftRepository,
  type AiActionPreviewResolver,
  AiActionDraftService,
} from '../actionDraftService';
import { AiServiceError } from '../errors';
import {
  type AiSession,
  type AiSessionRepository,
  AiSessionService,
} from '../sessionService';

class MemorySessionRepository implements AiSessionRepository {
  readonly sessions = new Map<string, AiSession>();

  async create(userId: string, roleAssignmentId: string): Promise<AiSession> {
    const session: AiSession = {
      conversationReference: null,
      id: `session-${this.sessions.size + 1}`,
      roleAssignmentId,
      status: 'active',
      userId,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(sessionId: string): Promise<AiSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async updateConversationReference(
    sessionId: string,
    conversationReference: string,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      this.sessions.set(sessionId, { ...session, conversationReference });
    }
  }
}

class MemoryDraftRepository implements AiActionDraftRepository {
  readonly drafts = new Map<string, AiActionDraft>();

  async create(draft: Omit<AiActionDraft, 'id' | 'status'>): Promise<AiActionDraft> {
    const created: AiActionDraft = {
      ...draft,
      id: `draft-${this.drafts.size + 1}`,
      status: 'pending',
    };
    this.drafts.set(created.id, created);
    return created;
  }

  async claim(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly now: string;
    readonly userId: string;
  }): Promise<AiActionDraft> {
    const draft = this.requireDraft(input.draftId);
    if (draft.userId !== input.userId) throw new AiServiceError('FORBIDDEN', 403);
    if (draft.status === 'completed') return draft;
    if (draft.status !== 'pending') throw new AiServiceError('DRAFT_ALREADY_USED', 409);
    if (draft.expiresAt <= input.now) {
      this.drafts.set(draft.id, { ...draft, status: 'expired' });
      throw new AiServiceError('DRAFT_EXPIRED', 409);
    }
    if (draft.isDangerous && !input.dangerousConfirmed) {
      throw new AiServiceError('SECOND_CONFIRMATION_REQUIRED', 409);
    }
    const claimed: AiActionDraft = { ...draft, status: 'executing' };
    this.drafts.set(draft.id, claimed);
    return claimed;
  }

  async cancel(input: { readonly draftId: string; readonly userId: string }): Promise<void> {
    const draft = this.requireDraft(input.draftId);
    if (draft.userId !== input.userId) throw new AiServiceError('FORBIDDEN', 403);
    if (draft.status !== 'pending') throw new AiServiceError('DRAFT_ALREADY_USED', 409);
    this.drafts.set(draft.id, { ...draft, status: 'cancelled' });
  }

  async complete(
    draftId: string,
    receipt: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const draft = this.requireDraft(draftId);
    this.drafts.set(draftId, { ...draft, receipt, status: 'completed' });
    return receipt;
  }

  async fail(draftId: string): Promise<void> {
    const draft = this.requireDraft(draftId);
    this.drafts.set(draftId, { ...draft, status: 'failed' });
  }

  private requireDraft(draftId: string): AiActionDraft {
    const draft = this.drafts.get(draftId);
    if (draft === undefined) throw new AiServiceError('NOT_FOUND', 404);
    return draft;
  }
}

const CONTEXT = {
  permissionScope: 'school:demo',
  role: 'teacher' as const,
  roleAssignmentId: 'context-teacher',
};

function resolver(isDangerous = false): AiActionPreviewResolver {
  return {
    resolve: vi.fn().mockResolvedValue({
      impact: ['服务端派生影响'],
      isDangerous,
      parameters: { assignmentId: 'assignment-1' },
      targetId: 'assignment-1',
      targetType: 'assignment',
      targetVersion: 'version-1',
      targets: ['演示一班 · 作业 A'],
    }),
  };
}

describe('AiSessionService', () => {
  it('拒绝未登录和跨 active context 会话', async () => {
    const repository = new MemorySessionRepository();
    const service = new AiSessionService(repository);
    await expect(service.resolve(null, 'context-a')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const session = await service.resolve({ userId: 'user-a' }, 'context-a');
    await expect(
      service.resolve({ userId: 'user-a' }, 'context-b', session.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('写回并复用 Coze conversation reference', async () => {
    const repository = new MemorySessionRepository();
    const service = new AiSessionService(repository);
    const session = await service.resolve({ userId: 'user-a' }, 'context-a');
    await service.updateConversationReference(session.id, 'conversation-1');
    await expect(
      service.resolve({ userId: 'user-a' }, 'context-a', session.id),
    ).resolves.toMatchObject({ conversationReference: 'conversation-1' });
  });
});

describe('AiActionDraftService', () => {
  function createService(isDangerous = false) {
    const repository = new MemoryDraftRepository();
    const executionAdapter = {
      execute: vi.fn().mockResolvedValue({ operationId: 'operation-1' }),
    };
    return {
      executionAdapter,
      repository,
      service: new AiActionDraftService(
        repository,
        executionAdapter,
        resolver(isDangerous),
        () => new Date('2026-08-04T10:00:00.000Z'),
      ),
    };
  }

  async function propose(service: AiActionDraftService) {
    return service.propose({
      actionType: 'assignment_publish',
      context: CONTEXT,
      parameters: { assignmentId: 'assignment-1' },
      principal: { userId: 'user-a' },
    });
  }

  it('预览完全采用服务端派生目标，确认前不执行', async () => {
    const { executionAdapter, service } = createService();
    const draft = await propose(service);
    expect(draft).toMatchObject({
      impact: ['服务端派生影响'],
      targetVersion: 'version-1',
      targets: ['演示一班 · 作业 A'],
    });
    expect(executionAdapter.execute).not.toHaveBeenCalled();
  });

  it('危险操作二次确认，完成回执可幂等重放', async () => {
    const { executionAdapter, service } = createService(true);
    const draft = await propose(service);
    await expect(
      service.confirm({
        dangerousConfirmed: false,
        draftId: draft.id,
        principal: { userId: 'user-a' },
      }),
    ).rejects.toMatchObject({ code: 'SECOND_CONFIRMATION_REQUIRED' });
    const first = await service.confirm({
      dangerousConfirmed: true,
      draftId: draft.id,
      principal: { userId: 'user-a' },
    });
    const replay = await service.confirm({
      dangerousConfirmed: true,
      draftId: draft.id,
      principal: { userId: 'user-a' },
    });
    expect(first).toEqual({ operationId: 'operation-1' });
    expect(replay).toEqual(first);
    expect(executionAdapter.execute).toHaveBeenCalledOnce();
  });

  it('取消后禁止执行且跨用户确认被拒绝', async () => {
    const { executionAdapter, service } = createService();
    const draft = await propose(service);
    await expect(
      service.confirm({
        dangerousConfirmed: true,
        draftId: draft.id,
        principal: { userId: 'user-b' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await service.cancel({ userId: 'user-a' }, draft.id);
    await expect(
      service.confirm({
        dangerousConfirmed: true,
        draftId: draft.id,
        principal: { userId: 'user-a' },
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_ALREADY_USED' });
    expect(executionAdapter.execute).not.toHaveBeenCalled();
  });
});
