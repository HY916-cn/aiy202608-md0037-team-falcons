import {
  MockGradeReportSheetService,
  SupabaseGradeReportSheetService,
  SupabaseTeachingDemoAdapter,
  type GradeReportSheetService,
} from '@dolphincloud/api-client';
import {
  MockAuthSessionAdapter,
  SupabaseAuthSessionAdapter,
  parseMockRole,
  type AuthSessionAdapter,
} from '@dolphincloud/auth';
import {
  MockTeachingDemoAdapter,
  TeachingTodaySummaryDataSource,
  type TeachingDemoAdapter,
  type TodaySummaryDataSource,
} from '@dolphincloud/experience';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseServiceRuntime = {
  readonly authAdapter: AuthSessionAdapter;
  readonly client: SupabaseClient | null;
  readonly gradeReportService: GradeReportSheetService;
  readonly mode: 'demo' | 'supabase';
  readonly summaryDataSource: TodaySummaryDataSource;
  readonly teachingAdapter: TeachingDemoAdapter;
};

export type SupabaseRuntimeConfiguration = {
  readonly anonKey: string | undefined;
  readonly mockRole: string | undefined;
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
  const { anonKey, mockRole, url } = configuration;
  if ((url === undefined) !== (anonKey === undefined)) {
    throw new Error('SUPABASE_CONFIG_INCOMPLETE');
  }

  if (url === undefined || anonKey === undefined) {
    const role = parseMockRole(mockRole);
    const authAdapter =
      role === null
        ? new MockAuthSessionAdapter()
        : new MockAuthSessionAdapter({ initialRole: role });
    const teachingAdapter = new MockTeachingDemoAdapter({ seedData: true });
    return {
      authAdapter,
      client: null,
      gradeReportService: new MockGradeReportSheetService(),
      mode: 'demo',
      summaryDataSource: new TeachingTodaySummaryDataSource(
        teachingAdapter,
        () => new Date(),
        'demo',
      ),
      teachingAdapter,
    };
  }

  const client = clientFactory(url, anonKey);
  const teachingAdapter = new SupabaseTeachingDemoAdapter(client);
  return {
    authAdapter: new SupabaseAuthSessionAdapter({ client }),
    client,
    gradeReportService: new SupabaseGradeReportSheetService(client),
    mode: 'supabase',
    summaryDataSource: new TeachingTodaySummaryDataSource(teachingAdapter),
    teachingAdapter,
  };
}
