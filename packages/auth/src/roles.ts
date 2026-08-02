export const ROLE_CODES = [
  'teacher',
  'class_terminal',
  'family',
  'bank_operator',
  'council',
  'admin',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS = {
  teacher: '教师端',
  class_terminal: '班级端',
  family: '家庭端',
  bank_operator: '银行端',
  council: '自治会端',
  admin: '管理端',
} as const satisfies Record<RoleCode, string>;

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.some((role) => role === value);
}
