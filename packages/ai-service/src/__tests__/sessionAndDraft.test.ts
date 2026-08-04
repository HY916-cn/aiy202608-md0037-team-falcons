import type { RoleCode } from '@dolphincloud/auth';
import { describe, expect, it, vi } from 'vitest';

import {
  type AiActionDraft,
  type AiActionDraftRepository,
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

  async create(userId: string): Promise<AiSession> {
    const session: AiSession = {
      conversationReference: null,
      id: `session-${this.sessions.size + 1}`,
      status: 'active',
      userId,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(sessionId: string): Promise<AiSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }
}

class MemoryDraftRepository implements AiActionDraftRepository {
  readonly drafts = new Map<string, AiActionDraft>();

  async create(draft: Omit<AiActionDraft, 'id' | 'status'>): Promise<AiActionDraft> {
    const created = { ...draft, id: `draft-${this.drafts.size + 1}`, status: 'pending' } as const;
    this.drafts.set(created.id, created);
    return created;
  }

  async claim(input: {
    readonly dangerousConfirmed: boolean;
    readonly draftId: string;
    readonly now: string;
    readonly userId: string;
  }): Promise<AiActionDraft> {
    const draft = this.drafts.get(input.draftId);
    if (draft === undefined) throw new AiServiceError('NOT_FOUND', 404);
    if (draft.userId !== input.userId) throw new AiServiceError('FORBIDDEN', 403);
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
    const draft = this.drafts.get(input.draftId);
    if (draft === undefined) throw new AiServiceError('NOT_FOUND', 404);
    if (draft.userId !== input.userId) throw new AiServiceError('FORBIDDEN', 403);
    if (draft.status !== 'pending') throw new AiServiceError('DRAFT_ALREADY_USED', 409);
    this.drafts.set(draft.id, { ...draft, status: 'cancelled' });
  }

  async complete(draftId: string): Promise<void> {
    const draft = this.requireDraft(draftId);
    this.drafts.set(draftId, { ...draft, status: 'completed' });
  }

  async fail(draftId: string): Promise<void> {
    const draft = this.requireDraft(draftId);
    this.drafts.set(draftId, { ...draft, status: 'failed' });
  }

  private requireDraft(draftId: string): AiActionDraft {
    const draft = this.drafts.get(draftId);
    if (draft === undefined) throw new Error('missing draft');
    return draft;
  }
}

const CONTEXT = {
  permissionScope: '演示一班',
  role: 'teacher' as RoleCode,
};

describe('AiSessionService', () => {
  it('拒绝未登录用户', async () => {
    await expect(new AiSessionService(new MemorySessionRepository()).resolve(null)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('拒绝跨用户读取会话', async () => {
    const repository = new MemorySessionRepository();
    const service = new AiSessionService(repository);
    const session = await service.resolve({ userId: 'user-a' });

    await expect(service.resolve({ userId: 'user-b' }, session.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('AiActionDraftService', () => {
  function createService() {
    const repository = new MemoryDraftRepository();
    const executionAdapter = { execute: vi.fn().mockResolvedValue(undefined) };
    return {
      executionAdapter,
      repository,
      service: new AiActionDraftService(
        repository,
        executionAdapter,
        () => new Date('2026-08-04T10:00:00.000Z'),
      ),
    };
  }

  async function propose(service: AiActionDraftService, isDangerous = false) {
    return service.propose({
      actionType: 'assignment_publish',
      context: CONTEXT,
      impact: ['发布后班级和家庭可见'],
      isDangerous,
      parameters: { assignmentId: 'assignment-1' },
      principal: { userId: 'user-a' },
      targets: ['演示一班'],
    });
  }

  it('未经确认不执行，确认后仅执行一次且重放失败', async () => {
    const { executionAdapter, service } = createService();
    const draft = await propose(service);
    expect(executionAdapter.execute).not.toHaveBeenCalled();

    await service.confirm({
      dangerousConfirmed: false,
      draftId: draft.id,
      principal: { userId: 'user-a' },
    });
    expect(executionAdapter.execute).toHaveBeenCalledOnce();
    await expect(
      service.confirm({
        dangerousConfirmed: false,
        draftId: draft.id,
        principal: { userId: 'user-a' },
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_ALREADY_USED' });
    expect(executionAdapter.execute).toHaveBeenCalledOnce();
  });

  it('危险操作必须二次确认', async () => {
    const { executionAdapter, service } = createService();
    const draft = await propose(service, true);

    await expect(
      service.confirm({
        dangerousConfirmed: false,
        draftId: draft.id,
        principal: { userId: 'user-a' },
      }),
    ).rejects.toMatchObject({ code: 'SECOND_CONFIRMATION_REQUIRED' });
    expect(executionAdapter.execute).not.toHaveBeenCalled();
    await service.confirm({
      dangerousConfirmed: true,
      draftId: draft.id,
      principal: { userId: 'user-a' },
    });
    expect(executionAdapter.execute).toHaveBeenCalledOnce();
  });

  it('取消后禁止执行', async () => {
    const { executionAdapter, service } = createService();
    const draft = await propose(service);
    await service.cancel({ userId: 'user-a' }, draft.id);

    await expect(
      service.confirm({
        dangerousConfirmed: false,
        draftId: draft.id,
        principal: { userId: 'user-a' },
      }),
    ).rejects.toMatchObject({ code: 'DRAFT_ALREADY_USED' });
    expect(executionAdapter.execute).not.toHaveBeenCalled();
  });

  it('拒绝跨用户确认和授权字段注入', async () => {
    const { service } = createService();
    const draft = await propose(service);
    await expect(
      service.confirm({
        dangerousConfirmed: false,
        draftId: draft.id,
        principal: { userId: 'user-b' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.propose({
        actionType: 'assignment_publish',
        context: CONTEXT,
        impact: [],
        isDangerous: false,
        parameters: { actorId: 'forged' },
        principal: { userId: 'user-a' },
        targets: [],
      }),
    ).rejects.toThrow('VALIDATION_ERROR');
  });
});
