import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthSessionProvider } from '@/features/auth';

export default function RootLayout() {
  return (
    <AuthSessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </AuthSessionProvider>
  );
}
