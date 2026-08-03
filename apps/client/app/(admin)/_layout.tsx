import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function AdminLayout() {
  return (
    <RoleRouteGuard requiredRole="admin">
      <Slot />
    </RoleRouteGuard>
  );
}
