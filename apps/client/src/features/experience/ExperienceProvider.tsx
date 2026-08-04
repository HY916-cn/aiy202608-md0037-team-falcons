import {
  MockAiExperienceAdapter,
  type AiExperienceAdapter,
  type TeachingDemoAdapter,
  type TodaySummaryDataSource,
} from '@dolphincloud/experience';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { useSupabaseServices } from '@/features/supabase';

type ExperienceContextValue = {
  readonly aiAdapter: AiExperienceAdapter;
  readonly summaryDataSource: TodaySummaryDataSource;
  readonly teachingAdapter: TeachingDemoAdapter;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { readonly children: ReactNode }) {
  const { summaryDataSource, teachingAdapter } = useSupabaseServices();
  const [value] = useState<ExperienceContextValue>(() => ({
    aiAdapter: new MockAiExperienceAdapter(),
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
