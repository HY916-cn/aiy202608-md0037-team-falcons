import { Slot } from 'expo-router';

import { RoleRouteGuard } from '@/features/auth';

export default function ClassTerminalLayout() {
  return (
    <RoleRouteGuard requiredRole="class_terminal">
      <Slot />
    </RoleRouteGuard>
  );
}
