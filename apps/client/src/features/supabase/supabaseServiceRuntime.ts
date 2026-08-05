import {
  SupabaseGradeReportSheetService,
  SupabaseGovernanceService,
  SupabaseTeachingDemoAdapter,
  type GradeReportSheetService,
  type GovernanceService,
} from '@dolphincloud/api-client';
import {
  SupabaseAuthSessionAdapter,
  type AuthSessionAdapter,
} from '@dolphincloud/auth';
import {
  TeachingTodaySummaryDataSource,
  type TeachingDemoAdapter,
  type TodaySummaryDataSource,
} from '@dolphincloud/experience';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  UnavailableAuthSessionAdapter,
  createUnavailableGovernanceService,
  createUnavailableGradeReportService,
  createUnavailableSummaryDataSource,
  createUnavailableTeachingAdapter,
} from './unavailableServices';

export type SupabaseConfigurationIssue = 'incomplete' | 'missing';

export type SupabaseServiceRuntime = {
  readonly authAdapter: AuthSessionAdapter;
  readonly client: SupabaseClient | null;
  readonly configurationIssue: SupabaseConfigurationIssue | null;
  readonly gradeReportService: GradeReportSheetService;
  readonly governanceService: GovernanceService;
  readonly mode: 'supabase' | 'unconfigured';
  readonly summaryDataSource: TodaySummaryDataSource;
  readonly teachingAdapter: TeachingDemoAdapter;
};

export type SupabaseRuntimeConfiguration = {
  readonly anonKey: string | undefined;
  readonly url: string | undefined;
};

export type SupabaseClientFactory = (
  url: string,
  anonKey: string,
) => SupabaseClient;

const defaultClientFactory: SupabaseClientFactory = (url, anonKey) =>
  createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

export function createSupabaseServiceRuntime(
  configuration: SupabaseRuntimeConfiguration,
  clientFactory: SupabaseClientFactory = defaultClientFactory,
): SupabaseServiceRuntime {
  const { anonKey, url } = configuration;

  if (url === undefined || anonKey === undefined) {
    return {
      authAdapter: new UnavailableAuthSessionAdapter(),
      client: null,
      configurationIssue:
        url === undefined && anonKey === undefined ? 'missing' : 'incomplete',
      gradeReportService: createUnavailableGradeReportService(),
      governanceService: createUnavailableGovernanceService(),
      mode: 'unconfigured',
      summaryDataSource: createUnavailableSummaryDataSource(),
      teachingAdapter: createUnavailableTeachingAdapter(),
    };
  }

  const client = clientFactory(url, anonKey);
  const teachingAdapter = new SupabaseTeachingDemoAdapter(client);
  return {
    authAdapter: new SupabaseAuthSessionAdapter({ client }),
    client,
    configurationIssue: null,
    gradeReportService: new SupabaseGradeReportSheetService(client),
    governanceService: new SupabaseGovernanceService(client),
    mode: 'supabase',
    summaryDataSource: new TeachingTodaySummaryDataSource(teachingAdapter),
    teachingAdapter,
  };
}
