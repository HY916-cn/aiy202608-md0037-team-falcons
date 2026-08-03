import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function TeacherLayout() {
  return (
    <RoleRouteGuard requiredRole="teacher">
      <Slot />
    </RoleRouteGuard>
  );
}
