import type { RoleCode } from '@dolphincloud/auth';
import {
  resolveRoleNavigationKey,
  RoleHomeScreen,
  type RoleNavigationKey,
} from '@dolphincloud/ui';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

import { AdminWorkspaceScreen } from '../../admin';
import { RoleExperienceSections } from '../../experience';
import { useAuthSession } from '../AuthSessionProvider';

type AuthenticatedRoleHomeScreenProps = {
  readonly role: RoleCode;
};
export function AuthenticatedRoleHomeScreen({
  role,
}: AuthenticatedRoleHomeScreenProps) {
  const session = useAuthSession();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ readonly section?: string }>();
  const activeNavigation = resolveRoleNavigationKey(role, section);
  const navigate = (key: RoleNavigationKey) => {
    const path = ROLE_HOME_PATHS[role];
    router.replace(
      (key === 'home' ? path : `${path}?section=${key}`) as Href,
    );
  };
  const switchRole = async (nextRole: RoleCode) => {
    await session.switchRole(nextRole);
    router.replace(ROLE_HOME_PATHS[nextRole] as Href);
  };

  if (
    session.user === null ||
    session.currentRole === null ||
    session.roleScope === null
  ) {
    return null;
  }

  return (
    <RoleHomeScreen
      activeNavigation={activeNavigation}
      availableRoles={session.availableRoles}
      availableRoleScopes={session.availableRoleScopes}
      currentRole={session.currentRole}
      onLogout={session.logout}
      onNavigate={navigate}
      onSwitchRole={switchRole}
      onSwitchRoleScope={session.switchRoleScope}
      role={role}
      roleScope={session.roleScope}
      user={session.user}
    >
      {role === 'admin' ? (
        <AdminWorkspaceScreen
          activeNavigation={activeNavigation}
          roleScope={session.roleScope}
        />
      ) : (
        <RoleExperienceSections
          activeNavigation={activeNavigation}
          onNavigate={navigate}
          role={role}
          roleScope={session.roleScope}
        />
      )}
    </RoleHomeScreen>
  );
}
