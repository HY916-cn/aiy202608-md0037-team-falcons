import { AuthenticatedRoleHomeScreen } from '@/features/auth';

export default function AdminHomeRoute() {
  return <AuthenticatedRoleHomeScreen role="admin" />;
}
