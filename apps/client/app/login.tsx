import { Redirect } from 'expo-router';

import {
  AuthLoadingScreen,
  LoginScreen,
  useAuthSession,
} from '@/features/auth';
import { useSupabaseServices } from '@/features/supabase';
import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

export default function LoginRoute() {
  const { currentRole, isLoading, login, user } = useAuthSession();
  const { configurationIssue } = useSupabaseServices();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (user !== null && currentRole !== null) {
    return <Redirect href={ROLE_HOME_PATHS[currentRole]} />;
  }

  return (
    <LoginScreen
      configurationIssue={configurationIssue}
      onLogin={login}
    />
  );
}
