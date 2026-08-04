import type { RoleCode } from './roles';

export const AUTH_SCOPE_TYPES = ['school', 'class', 'household'] as const;

export type AuthScopeType = (typeof AUTH_SCOPE_TYPES)[number];

export type AuthRoleScope = {
  readonly assignmentId: string;
  readonly id: string;
  readonly label: string;
  readonly role: RoleCode;
  readonly type: AuthScopeType;
};

export type AuthUser = {
  readonly displayName: string;
  readonly id: string;
};

export type AuthSession = {
  readonly availableRoles: readonly RoleCode[];
  readonly availableRoleScopes: readonly AuthRoleScope[];
  readonly currentRole: RoleCode | null;
  readonly roleScope: AuthRoleScope | null;
  readonly user: AuthUser | null;
};

export type AuthLoginInput = {
  readonly email: string;
  readonly password: string;
};

export const EMPTY_AUTH_SESSION: AuthSession = {
  availableRoles: [],
  availableRoleScopes: [],
  currentRole: null,
  roleScope: null,
  user: null,
};

export interface AuthSessionAdapter {
  getSession(): Promise<AuthSession>;
  login(input: AuthLoginInput): Promise<AuthSession>;
  logout(): Promise<AuthSession>;
  subscribe?(listener: (session: AuthSession) => void): () => void;
  switchRole(role: RoleCode): Promise<AuthSession>;
  switchRoleScope(roleAssignmentId: string): Promise<AuthSession>;
}
