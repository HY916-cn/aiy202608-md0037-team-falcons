import { SupabaseTeachingDemoAdapter } from '@dolphincloud/api-client';
import {
  DemoTodaySummaryDataSource,
  MockAiExperienceAdapter,
  MockTeachingDemoAdapter,
  type AiExperienceAdapter,
  type TeachingDemoAdapter,
  type TodaySummaryDataSource,
} from '@dolphincloud/experience';
import { createClient } from '@supabase/supabase-js';
import { createContext, useContext, useState, type ReactNode } from 'react';

type ExperienceContextValue = {
  readonly aiAdapter: AiExperienceAdapter;
  readonly summaryDataSource: TodaySummaryDataSource;
  readonly teachingAdapter: TeachingDemoAdapter;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

function createDefaultTeachingAdapter(): TeachingDemoAdapter {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || anonKey === undefined) {
    return new MockTeachingDemoAdapter();
  }
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
  });
  return new SupabaseTeachingDemoAdapter(client);
}

export function ExperienceProvider({ children }: { readonly children: ReactNode }) {
  const [value] = useState<ExperienceContextValue>(() => ({
    aiAdapter: new MockAiExperienceAdapter(),
    summaryDataSource: new DemoTodaySummaryDataSource(),
    teachingAdapter: createDefaultTeachingAdapter(),
  }));
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext);
  if (value === null) {
    throw new Error('useExperience must be used within ExperienceProvider');
  }
  return value;
}
