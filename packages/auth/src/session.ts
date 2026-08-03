import type { RoleCode } from './roles';

export const AUTH_SCOPE_TYPES = ['school', 'class', 'household'] as const;

export type AuthScopeType = (typeof AUTH_SCOPE_TYPES)[number];

export type AuthRoleScope = {
  readonly id: string;
  readonly label: string;
  readonly type: AuthScopeType;
};

export type AuthUser = {
  readonly displayName: string;
  readonly id: string;
};

export type AuthSession = {
  readonly availableRoles: readonly RoleCode[];
  readonly currentRole: RoleCode | null;
  readonly roleScope: AuthRoleScope | null;
  readonly user: AuthUser | null;
};

export const EMPTY_AUTH_SESSION: AuthSession = {
  availableRoles: [],
  currentRole: null,
  roleScope: null,
  user: null,
};

export interface AuthSessionAdapter {
  getSession(): Promise<AuthSession>;
  login(role: RoleCode): Promise<AuthSession>;
  logout(): Promise<AuthSession>;
  switchRole(role: RoleCode): Promise<AuthSession>;
}
