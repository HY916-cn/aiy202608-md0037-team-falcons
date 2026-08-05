import {
  type AiExperienceAdapter,
  type TeachingDemoAdapter,
  type TodaySummaryDataSource,
} from '@dolphincloud/experience';
import { SupabaseAiExperienceAdapter } from '@dolphincloud/api-client';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { useSupabaseServices } from '@/features/supabase';

import { UnavailableAiExperienceAdapter } from './UnavailableAiExperienceAdapter';

type ExperienceContextValue = {
  readonly aiAdapter: AiExperienceAdapter;
  readonly summaryDataSource: TodaySummaryDataSource;
  readonly teachingAdapter: TeachingDemoAdapter;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { readonly children: ReactNode }) {
  const { client, summaryDataSource, teachingAdapter } = useSupabaseServices();
  const [value] = useState<ExperienceContextValue>(() => ({
    aiAdapter:
      client !== null && process.env.EXPO_PUBLIC_AI_GATEWAY_FUNCTION !== undefined
        ? new SupabaseAiExperienceAdapter(
            client,
            process.env.EXPO_PUBLIC_AI_GATEWAY_FUNCTION,
          )
        : new UnavailableAiExperienceAdapter(),
    summaryDataSource,
    teachingAdapter,
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
