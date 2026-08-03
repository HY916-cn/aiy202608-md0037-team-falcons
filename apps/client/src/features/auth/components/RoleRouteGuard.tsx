import {
  resolveRoleRouteGuard,
  type RoleCode,
} from '@dolphincloud/auth';
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

import { useAuthSession } from '../AuthSessionProvider';
import { AuthLoadingScreen } from './AuthLoadingScreen';

type RoleRouteGuardProps = {
  readonly children: ReactNode;
  readonly requiredRole: RoleCode;
};

export function RoleRouteGuard({
  children,
  requiredRole,
}: RoleRouteGuardProps) {
  const session = useAuthSession();
  const decision = resolveRoleRouteGuard(session, requiredRole);

  switch (decision.type) {
    case 'loading':
      return <AuthLoadingScreen />;
    case 'login':
      return <Redirect href="/login" />;
    case 'role_home':
      return <Redirect href={ROLE_HOME_PATHS[decision.role]} />;
    case 'allow':
      return children;
  }
}
