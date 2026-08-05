import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function CouncilRoute() {
  return (
    <RoleRouteGuard requiredRole="council">
      <AuthenticatedRoleHomeScreen role="council" />
    </RoleRouteGuard>
  );
}
