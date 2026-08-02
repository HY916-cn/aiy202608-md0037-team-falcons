import { describe, expect, it } from 'vitest';

import {
  isRoleCode,
  resolveMockRole,
  ROLE_CODES,
  ROLE_LABELS,
} from '../roles';

describe('role definitions', () => {
  it('固定提供六种角色及界面名称', () => {
    expect(ROLE_CODES).toHaveLength(6);
    expect(ROLE_LABELS.class_terminal).toBe('班级端');
    expect(ROLE_LABELS.family).toBe('家庭端');
  });

  it('拒绝规范之外的角色名称', () => {
    expect(isRoleCode('teacher')).toBe(true);
    expect(isRoleCode('student')).toBe(false);
  });

  it('mock 角色缺失或非法时进入教师端', () => {
    expect(resolveMockRole(undefined)).toBe('teacher');
    expect(resolveMockRole('student')).toBe('teacher');
    expect(resolveMockRole('bank_operator')).toBe('bank_operator');
  });
});
