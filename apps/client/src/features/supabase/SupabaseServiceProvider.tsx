import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import {
  createSupabaseServiceRuntime,
  type SupabaseServiceRuntime,
} from './supabaseServiceRuntime';

const SupabaseServiceContext = createContext<SupabaseServiceRuntime | null>(null);

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

export function SupabaseServiceProvider({
  children,
  runtime,
}: {
  readonly children: ReactNode;
  readonly runtime?: SupabaseServiceRuntime;
}) {
  const [value] = useState(() =>
    runtime ??
    createSupabaseServiceRuntime({
      anonKey: nonEmpty(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
      url: nonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL),
    }),
  );

  return (
    <SupabaseServiceContext.Provider value={value}>
      {children}
    </SupabaseServiceContext.Provider>
  );
}

export function useSupabaseServices(): SupabaseServiceRuntime {
  const value = useContext(SupabaseServiceContext);
  if (value === null) {
    throw new Error(
      'useSupabaseServices must be used within SupabaseServiceProvider',
    );
  }
  return value;
}
