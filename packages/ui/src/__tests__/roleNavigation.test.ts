import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import { resolveRoleNavigationKey, ROLE_NAVIGATION_KEYS } from '../roleNavigation';

describe('role navigation', () => {
  it('为六类角色提供唯一页面键，且首页为默认项', () => {
    expect(Object.keys(ROLE_NAVIGATION_KEYS).sort()).toEqual([...ROLE_CODES].sort());
    for (const role of ROLE_CODES) {
      expect(ROLE_NAVIGATION_KEYS[role][0]).toBe('home');
      expect(new Set(ROLE_NAVIGATION_KEYS[role]).size).toBe(
        ROLE_NAVIGATION_KEYS[role].length,
      );
    }
  });

  it('仅接受当前角色支持的 URL section', () => {
    expect(resolveRoleNavigationKey('teacher', 'courseware')).toBe('courseware');
    expect(resolveRoleNavigationKey('family', 'growth')).toBe('growth');
    expect(resolveRoleNavigationKey('family', 'courseware')).toBe('home');
    expect(resolveRoleNavigationKey('admin', 'ai')).toBe('home');
    expect(resolveRoleNavigationKey('teacher', undefined)).toBe('home');
  });
});
