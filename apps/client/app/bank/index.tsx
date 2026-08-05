import { AuthenticatedRoleHomeScreen, RoleRouteGuard } from '@/features/auth';

export default function BankRoute() {
  return (
    <RoleRouteGuard requiredRole="bank_operator">
      <AuthenticatedRoleHomeScreen role="bank_operator" />
    </RoleRouteGuard>
  );
}
