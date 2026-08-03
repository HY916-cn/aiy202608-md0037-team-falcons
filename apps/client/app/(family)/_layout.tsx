import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function FamilyLayout() {
  return (
    <RoleRouteGuard requiredRole="family">
      <Slot />
    </RoleRouteGuard>
  );
}
