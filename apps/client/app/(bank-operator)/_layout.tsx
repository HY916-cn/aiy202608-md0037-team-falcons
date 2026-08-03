import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function BankOperatorLayout() {
  return (
    <RoleRouteGuard requiredRole="bank_operator">
      <Slot />
    </RoleRouteGuard>
  );
}
