import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function ClassTerminalRoute() {
  return (
    <RoleRouteGuard requiredRole="class_terminal">
      <AuthenticatedRoleHomeScreen role="class_terminal" />
    </RoleRouteGuard>
  );
}
