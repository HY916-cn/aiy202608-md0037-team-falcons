import { Redirect } from 'expo-router';

import { AuthLoadingScreen, useAuthSession } from '@/features/auth';
import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

export default function IndexRoute() {
  const { currentRole, isLoading, user } = useAuthSession();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (user === null || currentRole === null) {
    return <Redirect href="/login" />;
  }

  return <Redirect href={ROLE_HOME_PATHS[currentRole]} />;
}
