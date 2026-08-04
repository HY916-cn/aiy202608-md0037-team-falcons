import type { RoleCode } from '@dolphincloud/auth';

export type RoleNavigationKey =
  | 'home'
  | 'courseware'
  | 'assignment'
  | 'class'
  | 'ai'
  | 'growth'
  | 'coins'
  | 'accounts'
  | 'fines'
  | 'transactions'
  | 'class_score'
  | 'inspections'
  | 'appeals'
  | 'users'
  | 'permissions'
  | 'audit'
  | 'settings';

export const ROLE_NAVIGATION_KEYS = {
  admin: ['home', 'users', 'permissions', 'audit', 'settings'],
  bank_operator: ['home', 'accounts', 'fines', 'transactions', 'ai'],
  class_terminal: ['home', 'courseware', 'assignment', 'class', 'ai'],
  council: ['home', 'class_score', 'inspections', 'appeals', 'ai'],
  family: ['home', 'assignment', 'growth', 'coins', 'ai'],
  teacher: ['home', 'courseware', 'assignment', 'class', 'ai'],
} as const satisfies Record<RoleCode, readonly RoleNavigationKey[]>;

export function resolveRoleNavigationKey(
  role: RoleCode,
  candidate: string | undefined,
): RoleNavigationKey {
  return ROLE_NAVIGATION_KEYS[role].some((key) => key === candidate)
    ? (candidate as RoleNavigationKey)
    : 'home';
}
