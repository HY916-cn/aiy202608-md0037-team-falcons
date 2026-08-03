import { AuthenticatedRoleHomeScreen } from '@/features/auth';

export default function CouncilHomeRoute() {
  return <AuthenticatedRoleHomeScreen role="council" />;
}
