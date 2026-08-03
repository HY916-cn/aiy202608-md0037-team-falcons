import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function CouncilLayout() {
  return (
    <RoleRouteGuard requiredRole="council">
      <Slot />
    </RoleRouteGuard>
  );
}
