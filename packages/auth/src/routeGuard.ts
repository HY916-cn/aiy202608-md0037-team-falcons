import type { RoleCode } from './roles';
import type { AuthSession } from './session';

export type AuthRouteGuardSession = Pick<
  AuthSession,
  'currentRole' | 'user'
> & {
  readonly isLoading: boolean;
};

export type AuthRouteGuardDecision =
  | { readonly type: 'loading' }
  | { readonly type: 'login' }
  | { readonly type: 'allow' }
  | { readonly role: RoleCode; readonly type: 'role_home' };

export function resolveRoleRouteGuard(
  session: AuthRouteGuardSession,
  requiredRole: RoleCode,
): AuthRouteGuardDecision {
  if (session.isLoading) {
    return { type: 'loading' };
  }

  if (session.user === null || session.currentRole === null) {
    return { type: 'login' };
  }

  if (session.currentRole !== requiredRole) {
    return { role: session.currentRole, type: 'role_home' };
  }

  return { type: 'allow' };
}
