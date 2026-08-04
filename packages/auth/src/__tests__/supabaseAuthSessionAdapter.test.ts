import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseAuthSessionAdapter } from '../supabaseAuthSessionAdapter';

type FakeTable = 'profiles' | 'role_assignments' | 'schools';

function createFakeClient() {
  let authListener: ((event: string) => void) | null = null;
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn((listener: (event: string) => void) => {
    authListener = listener;
    return { data: { subscription: { unsubscribe } } };
  });
  const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: { id: 'demo-teacher-id' },
    },
    error: null,
  });
  const rows = {
    profiles: { display_name: '演示教师一号', id: 'demo-teacher-id' },
    role_assignments: [
      {
        role: 'teacher',
        scope_id: 'demo-school-id',
        scope_type: 'school',
      },
    ],
    schools: { name: '海豚云合成演示学校' },
  } as const;
  const from = vi.fn((table: FakeTable) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
        single: vi.fn().mockResolvedValue({ data: rows[table], error: null }),
      })),
    })),
  }));
  const client = {
    auth: { getUser, onAuthStateChange, signInWithPassword, signOut },
    from,
  } as unknown as SupabaseClient;

  return {
    client,
    from,
    getUser,
    signInWithPassword,
    signOut,
    triggerAuthEvent(event: string) {
      authListener?.(event);
    },
    unsubscribe,
  };
}

describe('SupabaseAuthSessionAdapter', () => {
  it('使用 Supabase 密码登录并从受 RLS 保护的表解析角色范围', async () => {
    const { client, from, signInWithPassword } = createFakeClient();
    const adapter = new SupabaseAuthSessionAdapter({ client });

    const session = await adapter.login({
      email: ' demo_teacher_01@dolphincloud.local ',
      password: 'synthetic-password',
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'demo_teacher_01@dolphincloud.local',
      password: 'synthetic-password',
    });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(from).toHaveBeenCalledWith('role_assignments');
    expect(session).toEqual({
      availableRoles: ['teacher'],
      availableRoleScopes: [
        {
          id: 'demo-school-id',
          label: '海豚云合成演示学校',
          role: 'teacher',
          type: 'school',
        },
      ],
      currentRole: 'teacher',
      roleScope: {
        id: 'demo-school-id',
        label: '海豚云合成演示学校',
        role: 'teacher',
        type: 'school',
      },
      user: {
        displayName: '演示教师一号',
        id: 'demo-teacher-id',
      },
    });
  });

  it('没有 Supabase 用户时返回空会话', async () => {
    const { client, getUser } = createFakeClient();
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const adapter = new SupabaseAuthSessionAdapter({ client });

    await expect(adapter.getSession()).resolves.toMatchObject({
      availableRoles: [],
      currentRole: null,
      user: null,
    });
  });

  it('拒绝切换到数据库未授予的角色', async () => {
    const { client } = createFakeClient();
    const adapter = new SupabaseAuthSessionAdapter({ client });

    await expect(adapter.switchRole('admin')).rejects.toThrow('FORBIDDEN');
  });

  it('令牌刷新和退出事件会更新共享会话并清理订阅', async () => {
    const { client, triggerAuthEvent, unsubscribe } = createFakeClient();
    const adapter = new SupabaseAuthSessionAdapter({ client });
    const listener = vi.fn();
    const stop = adapter.subscribe(listener);

    triggerAuthEvent('TOKEN_REFRESHED');
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ currentRole: 'teacher' }),
      );
    });

    triggerAuthEvent('SIGNED_OUT');
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ currentRole: null, user: null }),
    );
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
