import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import { ROLE_HOME_PATHS } from '../roleRoutes';

describe('ROLE_HOME_PATHS', () => {
  it('为六个角色各提供一个独立且稳定的 Web 路径', () => {
    expect(Object.keys(ROLE_HOME_PATHS).sort()).toEqual(
      [...ROLE_CODES].sort(),
    );
    expect(new Set(Object.values(ROLE_HOME_PATHS)).size).toBe(6);
    expect(ROLE_HOME_PATHS).toEqual({
      admin: '/(admin)',
      bank_operator: '/(bank-operator)',
      class_terminal: '/(class-terminal)',
      council: '/(council)',
      family: '/(family)',
      teacher: '/(teacher)',
    });
  });
});
