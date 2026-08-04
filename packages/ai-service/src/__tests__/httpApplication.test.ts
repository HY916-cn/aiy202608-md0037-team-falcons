import { describe, expect, it, vi } from 'vitest';

import type { AiActionDraftService } from '../actionDraftService';
import type { AiGatewayService } from '../gatewayService';
import { AiGatewayHttpApplication } from '../httpApplication';

const CONTEXT = {
  permissionScope: 'school:demo-school',
  role: 'teacher' as const,
  roleAssignmentId: 'context-a',
  userId: 'user-a',
};

function createApplication() {
  const gateway = {
    chat: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      text: '完成',
      type: 'text',
    }),
  } as unknown as AiGatewayService;
  const drafts = {
    cancel: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(undefined),
  } as unknown as AiActionDraftService;
  return {
    application: new AiGatewayHttpApplication(
      gateway,
      drafts,
      () => 'request-1',
    ),
    drafts,
    gateway,
  };
}

describe('AiGatewayHttpApplication', () => {
  it('未登录请求返回结构化 401 且不调用 AI', async () => {
    const { application, gateway } = createApplication();

    await expect(
      application.handle({
        body: { message: 'hello' },
        method: 'POST',
        path: '/chat',
        principal: null,
        skillContext: null,
      }),
    ).resolves.toEqual({
      body: {
        error: { code: 'UNAUTHENTICATED', message: '请先登录。' },
        request_id: 'request-1',
      },
      status: 401,
    });
    expect(gateway.chat).not.toHaveBeenCalled();
  });

  it('确认路由拒绝 actor 注入且不执行草稿', async () => {
    const { application, drafts } = createApplication();

    const result = await application.handle({
      body: { actorId: 'forged', dangerousConfirmed: true },
      method: 'POST',
      path: '/action-drafts/draft-1/confirm',
      principal: { userId: 'user-a' },
      skillContext: CONTEXT,
    });

    expect(result).toMatchObject({
      body: { error: { code: 'VALIDATION_ERROR' } },
      status: 422,
    });
    expect(drafts.confirm).not.toHaveBeenCalled();
  });

  it('拒绝 principal 与服务端权限上下文不一致', async () => {
    const { application, gateway } = createApplication();

    const result = await application.handle({
      body: { message: 'hello' },
      method: 'POST',
      path: '/chat',
      principal: { userId: 'user-b' },
      skillContext: CONTEXT,
    });

    expect(result).toMatchObject({
      body: { error: { code: 'FORBIDDEN' } },
      status: 403,
    });
    expect(gateway.chat).not.toHaveBeenCalled();
  });

  it('确认路由只接受二次确认字段', async () => {
    const { application, drafts } = createApplication();

    const result = await application.handle({
      body: { dangerousConfirmed: true, unexpected: true },
      method: 'POST',
      path: '/action-drafts/draft-1/confirm',
      principal: { userId: 'user-a' },
      skillContext: CONTEXT,
    });

    expect(result).toMatchObject({
      body: { error: { code: 'VALIDATION_ERROR' } },
      status: 400,
    });
    expect(drafts.confirm).not.toHaveBeenCalled();
  });
});
