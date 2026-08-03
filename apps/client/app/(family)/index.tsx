import { AuthenticatedRoleHomeScreen } from '@/features/auth';

export default function FamilyHomeRoute() {
  return <AuthenticatedRoleHomeScreen role="family" />;
}
