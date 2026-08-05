import type { RoleCode } from '@dolphincloud/auth';
import { resolveRoleNavigationKey, RoleHomeScreen } from '@dolphincloud/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
      onNavigate={(key) =>
        router.setParams({ section: key === 'home' ? undefined : key })
      }
      onSwitchRole={session.switchRole}
      onSwitchRoleScope={session.switchRoleScope}
      role={role}
      roleScope={session.roleScope}
      user={session.user}
    >
      <RoleExperienceSections
        activeNavigation={activeNavigation}
        onNavigate={(key) =>
          router.setParams({ section: key === 'home' ? undefined : key })
        }
        role={role}
        roleScope={session.roleScope}
      />
    </RoleHomeScreen>
  );
}
