import { resolveMockRole } from '@dolphincloud/auth';
import { Redirect } from 'expo-router';

import { ROLE_HOME_PATHS } from '@/shared/routing/roleRoutes';

export default function IndexRoute() {
  const role = resolveMockRole(process.env.EXPO_PUBLIC_MOCK_ROLE);

  return <Redirect href={ROLE_HOME_PATHS[role]} />;
}
