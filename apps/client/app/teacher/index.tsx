import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function TeacherRoute() {
  return (
    <RoleRouteGuard requiredRole="teacher">
      <AuthenticatedRoleHomeScreen role="teacher" />
    </RoleRouteGuard>
  );
}
