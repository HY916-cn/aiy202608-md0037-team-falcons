import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseAuthSessionAdapter } from '../supabaseAuthSessionAdapter';

type FakeTable = 'classes' | 'profiles' | 'role_assignments' | 'schools';

type FakeRoleAssignment = {
  readonly id: string;
  readonly role: string;
  readonly scope_id: string;
  readonly scope_type: string;
};

function createFakeClient(
  roleAssignments: readonly FakeRoleAssignment[] = [
    {
      id: 'assignment-teacher-school',
      role: 'teacher',
      scope_id: 'demo-school-id',
      scope_type: 'school',
    },
  ],
) {
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
    classes: { name: '演示班级' },
    profiles: { display_name: '演示教师一号', id: 'demo-teacher-id' },
    role_assignments: roleAssignments,
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
          assignmentId: 'assignment-teacher-school',
          id: 'demo-school-id',
          label: '海豚云合成演示学校',
          role: 'teacher',
          type: 'school',
        },
      ],
      currentRole: 'teacher',
      roleScope: {
        assignmentId: 'assignment-teacher-school',
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

  it('同一角色有两个范围时可按 assignment id 切换到第二个范围', async () => {
    const { client } = createFakeClient([
      {
        id: 'assignment-teacher-class-1',
        role: 'teacher',
        scope_id: 'class-1',
        scope_type: 'class',
      },
      {
        id: 'assignment-teacher-class-2',
        role: 'teacher',
        scope_id: 'class-2',
        scope_type: 'class',
      },
    ]);
    const adapter = new SupabaseAuthSessionAdapter({ client });

    const session = await adapter.switchRoleScope('assignment-teacher-class-2');

    expect(session.roleScope).toMatchObject({
      assignmentId: 'assignment-teacher-class-2',
      id: 'class-2',
      role: 'teacher',
      type: 'class',
    });
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
