import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthSessionProvider } from '@/features/auth';
import { ExperienceProvider } from '@/features/experience';

export default function RootLayout() {
  return (
    <ExperienceProvider>
      <AuthSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </AuthSessionProvider>
    </ExperienceProvider>
  );
}
