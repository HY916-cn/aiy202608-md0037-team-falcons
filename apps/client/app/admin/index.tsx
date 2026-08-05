import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function AdminRoute() {
  return (
    <RoleRouteGuard requiredRole="admin">
      <AuthenticatedRoleHomeScreen role="admin" />
    </RoleRouteGuard>
  );
}
