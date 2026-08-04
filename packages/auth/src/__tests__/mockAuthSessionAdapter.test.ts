import { describe, expect, it } from 'vitest';

import { MockAuthSessionAdapter } from '../mockAuthSessionAdapter';

describe('MockAuthSessionAdapter', () => {
  it('未指定自动演示角色时保持退出状态', async () => {
    const adapter = new MockAuthSessionAdapter();

    await expect(adapter.getSession()).resolves.toMatchObject({
      availableRoles: [],
      currentRole: null,
      roleScope: null,
      user: null,
    });
  });

  it('登录后暴露当前用户、六种角色和对应范围', async () => {
    const adapter = new MockAuthSessionAdapter();

    const session = await adapter.login({
      email: 'demo_class_01@dolphincloud.local',
      password: 'synthetic-password',
    });

    expect(session.user?.id).toBe('demo_user_auth');
    expect(session.availableRoles).toHaveLength(6);
    expect(session.currentRole).toBe('class_terminal');
    expect(session.roleScope).toEqual({
      id: 'demo_class',
      label: '演示班级',
      role: 'class_terminal',
      type: 'class',
    });
  });

  it('登录后可以切换角色及角色范围', async () => {
    const adapter = new MockAuthSessionAdapter({ initialRole: 'teacher' });

    const session = await adapter.switchRole('family');

    expect(session.currentRole).toBe('family');
    expect(session.roleScope?.type).toBe('household');
  });

  it('退出后清除用户、角色和范围', async () => {
    const adapter = new MockAuthSessionAdapter({ initialRole: 'admin' });

    await expect(adapter.logout()).resolves.toMatchObject({
      availableRoles: [],
      currentRole: null,
      roleScope: null,
      user: null,
    });
    await expect(adapter.getSession()).resolves.toMatchObject({
      currentRole: null,
      user: null,
    });
  });

  it('未登录时拒绝切换角色', async () => {
    const adapter = new MockAuthSessionAdapter();

    await expect(adapter.switchRole('teacher')).rejects.toThrow(
      'UNAUTHENTICATED',
    );
  });
});
