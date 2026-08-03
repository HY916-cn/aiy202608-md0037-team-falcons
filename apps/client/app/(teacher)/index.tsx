import { AuthenticatedRoleHomeScreen } from '@/features/auth';

export default function TeacherHomeRoute() {
  return <AuthenticatedRoleHomeScreen role="teacher" />;
}
