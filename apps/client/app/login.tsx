import { Redirect } from 'expo-router';

import {
  AuthLoadingScreen,
  MockLoginScreen,
  useAuthSession,
} from '@/features/auth';
import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

export default function LoginRoute() {
  const { currentRole, isLoading, login, user } = useAuthSession();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (user !== null && currentRole !== null) {
    return <Redirect href={ROLE_HOME_PATHS[currentRole]} />;
  }

  return <MockLoginScreen onLogin={login} />;
}
