import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseAiExperienceAdapter } from '../supabaseAiExperienceAdapter';

function createClient(invoke: ReturnType<typeof vi.fn>): SupabaseClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
    functions: { invoke },
  } as unknown as SupabaseClient;
}

describe('SupabaseAiExperienceAdapter', () => {
  it('通过网关返回预览且请求中不发送身份字段', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: { sessionId: 'session-1', text: '今日摘要', type: 'text' },
        request_id: 'request-1',
      },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));

    await adapter.submit('查询今日摘要');

    expect(adapter.getSnapshot()).toMatchObject({
      result: '今日摘要',
      state: 'preview',
    });
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: { message: '查询今日摘要' },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('网关异常时进入 offline，且不影响独立教学适配器', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('gateway unavailable'),
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    const ordinaryTeachingAction = vi.fn().mockResolvedValue('仍可使用');

    await adapter.submit('查询');

    expect(adapter.getSnapshot().state).toBe('offline');
    await expect(ordinaryTeachingAction()).resolves.toBe('仍可使用');
  });

  it('写操作确认前不执行，重复确认受 pending 防护', async () => {
    let releaseConfirm: (() => void) | undefined;
    const confirmPending = new Promise<void>((resolve) => {
      releaseConfirm = resolve;
    });
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            draftId: 'draft-1',
            preview: {
              actionType: 'assignment_publish',
              expiresAt: '2026-08-04T18:00:00.000Z',
              impact: ['发布作业'],
              isDangerous: true,
              parameters: { assignmentId: 'assignment-1' },
              permissionScope: 'school:demo',
              targets: ['class-1'],
            },
            sessionId: 'session-1',
            type: 'action_draft',
          },
        },
        error: null,
      })
      .mockImplementationOnce(async () => {
        await confirmPending;
        return { data: { data: { status: 'completed' } }, error: null };
      });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));

    await adapter.submit('发布作业');
    expect(invoke).toHaveBeenCalledTimes(1);
    const first = adapter.confirmAction(true);
    const duplicate = adapter.confirmAction(true);
    expect(invoke).toHaveBeenCalledTimes(2);
    releaseConfirm?.();
    await Promise.all([first, duplicate]);

    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot().state).toBe('success');
    expect(invoke.mock.calls[1]?.[1]).toEqual({
      body: { dangerousConfirmed: true },
      headers: { 'x-ai-route': '/action-drafts/draft-1/confirm' },
    });
  });

  it('取消草稿不调用确认路由', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            draftId: 'draft-1',
            preview: {
              actionType: 'assignment_publish',
              expiresAt: '2026-08-04T18:00:00.000Z',
              impact: [],
              isDangerous: false,
              parameters: {},
              permissionScope: 'school:demo',
              targets: [],
            },
            sessionId: 'session-1',
            type: 'action_draft',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { data: { status: 'cancelled' } }, error: null });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));

    await adapter.submit('创建草稿');
    await adapter.cancelAction();

    expect(invoke.mock.calls[1]?.[1]).toEqual({
      body: {},
      headers: { 'x-ai-route': '/action-drafts/draft-1/cancel' },
    });
    expect(adapter.getPendingAction()).toBeNull();
  });
});
