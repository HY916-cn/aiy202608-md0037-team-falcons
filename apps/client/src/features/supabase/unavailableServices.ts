import type {
  GradeReportSheetService,
  GovernanceService,
} from '@dolphincloud/api-client';
import {
  EMPTY_AUTH_SESSION,
  type AuthLoginInput,
  type AuthSession,
  type AuthSessionAdapter,
  type RoleCode,
} from '@dolphincloud/auth';
import type {
  TeachingDemoAdapter,
  TodaySummaryDataSource,
} from '@dolphincloud/experience';

export class ServiceUnavailableError extends Error {
  readonly code = 'SERVICE_UNCONFIGURED';

  constructor() {
    super('SERVICE_UNCONFIGURED');
    this.name = 'ServiceUnavailableError';
  }
}

const rejectUnavailable = async (): Promise<never> => {
  throw new ServiceUnavailableError();
};

function createUnavailableService<TService extends object>(): TService {
  return new Proxy({} as TService, {
    get: () => rejectUnavailable,
  });
}

export class UnavailableAuthSessionAdapter implements AuthSessionAdapter {
  async getSession(): Promise<AuthSession> {
    return EMPTY_AUTH_SESSION;
  }

  async login(_input: AuthLoginInput): Promise<AuthSession> {
    return rejectUnavailable();
  }

  async logout(): Promise<AuthSession> {
    return EMPTY_AUTH_SESSION;
  }

  async switchRole(_role: RoleCode): Promise<AuthSession> {
    return rejectUnavailable();
  }

  async switchRoleScope(_roleAssignmentId: string): Promise<AuthSession> {
    return rejectUnavailable();
  }
}

export function createUnavailableGradeReportService(): GradeReportSheetService {
  return createUnavailableService<GradeReportSheetService>();
}

export function createUnavailableGovernanceService(): GovernanceService {
  return createUnavailableService<GovernanceService>();
}

export function createUnavailableTeachingAdapter(): TeachingDemoAdapter {
  return createUnavailableService<TeachingDemoAdapter>();
}

export function createUnavailableSummaryDataSource(): TodaySummaryDataSource {
  return createUnavailableService<TodaySummaryDataSource>();
}
