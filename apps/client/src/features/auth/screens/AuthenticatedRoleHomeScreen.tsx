import type { RoleCode } from '@dolphincloud/auth';
import { RoleHomeScreen } from '@dolphincloud/ui';

import { RoleExperienceSections } from '../../experience';
import { useAuthSession } from '../AuthSessionProvider';

type AuthenticatedRoleHomeScreenProps = {
  readonly role: RoleCode;
};
export function AuthenticatedRoleHomeScreen({
  role,
}: AuthenticatedRoleHomeScreenProps) {
  const session = useAuthSession();

  if (
    session.user === null ||
    session.currentRole === null ||
    session.roleScope === null
  ) {
    return null;
  }

  return (
    <RoleHomeScreen
      availableRoles={session.availableRoles}
      availableRoleScopes={session.availableRoleScopes}
      currentRole={session.currentRole}
      onLogout={session.logout}
      onSwitchRole={session.switchRole}
      onSwitchRoleScope={session.switchRoleScope}
      role={role}
      roleScope={session.roleScope}
      user={session.user}
    >
      <RoleExperienceSections role={role} roleScope={session.roleScope} />
    </RoleHomeScreen>
  );
}
