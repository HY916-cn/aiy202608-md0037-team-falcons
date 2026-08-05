import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function FamilyRoute() {
  return (
    <RoleRouteGuard requiredRole="family">
      <AuthenticatedRoleHomeScreen role="family" />
    </RoleRouteGuard>
  );
}
