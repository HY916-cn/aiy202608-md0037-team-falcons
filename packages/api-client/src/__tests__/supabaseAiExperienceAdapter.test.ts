import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRoleScope } from '@dolphincloud/auth';

import { SupabaseAiExperienceAdapter } from '../supabaseAiExperienceAdapter';

const TEACHER_SCOPE: AuthRoleScope = {
  assignmentId: 'context-teacher',
  id: 'class-1',
  label: '演示一班',
  role: 'teacher',
  type: 'class',
};

const SECOND_TEACHER_SCOPE: AuthRoleScope = {
  assignmentId: 'context-teacher-class-2',
  id: 'class-2',
  label: '演示二班',
  role: 'teacher',
  type: 'class',
};

function createClient(invoke: ReturnType<typeof vi.fn>): SupabaseClient {
  const single = vi.fn().mockResolvedValue({
    data: { id: 'context-teacher' },
    error: null,
  });
  const query = { eq: vi.fn(), single };
  query.eq.mockReturnValue(query);
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    }),
    functions: { invoke },
  } as unknown as SupabaseClient;
}

describe('SupabaseAiExperienceAdapter', () => {
  it('同一教师拥有两个班级时精确提交当前选择的第二个 scope', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: { sessionId: 'session-2', text: '二班摘要', type: 'text' },
      },
      error: null,
    });
    const eq = vi.fn();
    const query = {
      eq,
      single: vi.fn().mockResolvedValue({
        data: { id: SECOND_TEACHER_SCOPE.assignmentId },
        error: null,
      }),
    };
    eq.mockReturnValue(query);
    const client = createClient(invoke) as unknown as {
      from: ReturnType<typeof vi.fn>;
    };
    client.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    });
    const adapter = new SupabaseAiExperienceAdapter(
      client as unknown as SupabaseClient,
    );

    await adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    await adapter.submit('查询当前班级');

    expect(eq.mock.calls).toEqual([
      ['id', 'context-teacher-class-2'],
      ['role', 'teacher'],
      ['scope_type', 'class'],
      ['scope_id', 'class-2'],
    ]);
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: {
        contextId: 'context-teacher-class-2',
        message: '查询当前班级',
      },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('通过网关返回预览且请求中不发送身份字段', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: { sessionId: 'session-1', text: '今日摘要', type: 'text' },
        request_id: 'request-1',
      },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('查询今日摘要');

    expect(adapter.getSnapshot()).toMatchObject({
      result: '今日摘要',
      state: 'preview',
    });
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: { contextId: 'context-teacher', message: '查询今日摘要' },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('网关异常时进入 offline，且不影响独立教学适配器', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('gateway unavailable'),
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);
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
              role: 'teacher',
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
    await adapter.selectActiveRole(TEACHER_SCOPE);

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
              role: 'teacher',
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
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('创建草稿');
    await adapter.cancelAction();

    expect(invoke.mock.calls[1]?.[1]).toEqual({
      body: {},
      headers: { 'x-ai-route': '/action-drafts/draft-1/cancel' },
    });
    expect(adapter.getPendingAction()).toBeNull();
  });

  it('返回修改会取消服务端草稿并保留可编辑状态', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          data: {
            draftId: 'draft-1',
            preview: {
              actionType: 'assignment_publish',
              expiresAt: '2026-08-04T18:00:00.000Z',
              impact: ['发布'],
              isDangerous: true,
              parameters: { assignmentId: 'assignment-1' },
              permissionScope: 'school:demo',
              role: 'teacher',
              targets: ['演示一班 · 作业 A'],
            },
            sessionId: 'session-1',
            type: 'action_draft',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { data: { status: 'cancelled' } }, error: null });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);
    await adapter.submit('发布作业');

    await adapter.returnToModify();

    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot().state).toBe('listening');
    expect(invoke.mock.calls[1]?.[1]).toMatchObject({
      headers: { 'x-ai-route': '/action-drafts/draft-1/cancel' },
    });
  });
});
