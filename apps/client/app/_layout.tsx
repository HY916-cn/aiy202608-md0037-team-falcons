import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthSessionProvider } from '@/features/auth';
import { ExperienceProvider } from '@/features/experience';
import { SupabaseServiceProvider } from '@/features/supabase';

export default function RootLayout() {
  return (
    <SupabaseServiceProvider>
      <ExperienceProvider>
        <AuthSessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="dark" />
        </AuthSessionProvider>
      </ExperienceProvider>
    </SupabaseServiceProvider>
  );
}
