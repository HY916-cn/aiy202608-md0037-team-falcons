import { AuthenticatedRoleHomeScreen } from '@/features/auth';

export default function BankOperatorHomeRoute() {
  return <AuthenticatedRoleHomeScreen role="bank_operator" />;
}
