import { describe, expect, it } from 'vitest';

import { resolveRoleRouteGuard } from '../routeGuard';

const MOCK_USER = {
  displayName: '演示用户',
  id: 'demo_user_auth',
};

describe('resolveRoleRouteGuard', () => {
  it('会话加载时等待，不提前跳转', () => {
    expect(
      resolveRoleRouteGuard(
        { currentRole: null, isLoading: true, user: null },
        'teacher',
      ),
    ).toEqual({ type: 'loading' });
  });

  it('未登录访问角色路由时回登录页', () => {
    expect(
      resolveRoleRouteGuard(
        { currentRole: null, isLoading: false, user: null },
        'teacher',
      ),
    ).toEqual({ type: 'login' });
  });

  it('当前角色与路由一致时允许访问', () => {
    expect(
      resolveRoleRouteGuard(
        { currentRole: 'teacher', isLoading: false, user: MOCK_USER },
        'teacher',
      ),
    ).toEqual({ type: 'allow' });
  });

  it('越权访问其他角色路由时回当前角色首页', () => {
    expect(
      resolveRoleRouteGuard(
        { currentRole: 'family', isLoading: false, user: MOCK_USER },
        'admin',
      ),
    ).toEqual({ role: 'family', type: 'role_home' });
  });
});
