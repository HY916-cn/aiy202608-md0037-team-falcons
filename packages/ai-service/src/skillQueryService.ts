import type { AuthRoleScope, AuthScopeType, RoleCode } from '@dolphincloud/auth';
import type {
  TeachingDemoAdapter,
  TodaySummaryDataSource,
} from '@dolphincloud/experience';

import type { AiReadSkill } from './contracts';
import { AiServiceError } from './errors';
import { assertNoAuthorizationInjection } from './inputSecurity';

export type AiSkillContext = {
  readonly permissionScope: string;
  readonly role: RoleCode;
  readonly roleAssignmentId: string;
  readonly scopeId: string;
  readonly scopeType: AuthScopeType;
  readonly userId: string;
};

const ALLOWED_ROLES = {
  get_today_summary: [
    'teacher',
    'class_terminal',
    'family',
    'bank_operator',
    'council',
    'admin',
  ],
  list_courseware: ['teacher', 'class_terminal'],
  list_assignments: ['teacher', 'class_terminal', 'family'],
  get_grades: ['teacher', 'family'],
} as const satisfies Record<AiReadSkill, readonly RoleCode[]>;

export class SkillQueryService {
  constructor(
    private readonly teachingAdapter: TeachingDemoAdapter,
    private readonly summaryDataSource: TodaySummaryDataSource,
  ) {}

  async query(
    skill: AiReadSkill,
    argumentsValue: Readonly<Record<string, unknown>>,
    context: AiSkillContext,
  ): Promise<unknown> {
    assertNoAuthorizationInjection(argumentsValue);
    if (Object.keys(argumentsValue).length > 0) {
      throw new AiServiceError('VALIDATION_ERROR', 422);
    }
    if (!(ALLOWED_ROLES[skill] as readonly RoleCode[]).includes(context.role)) {
      throw new AiServiceError('FORBIDDEN', 403);
    }
    const roleScope: AuthRoleScope = {
      assignmentId: context.roleAssignmentId,
      id: context.scopeId,
      label: context.permissionScope,
      role: context.role,
      type: context.scopeType,
    };
    if (skill === 'get_today_summary') {
      return this.summaryDataSource.load(roleScope);
    }
    const snapshot = await this.teachingAdapter.load(roleScope);
    if (skill === 'list_courseware') {
      return snapshot.courseware;
    }
    if (skill === 'list_assignments') {
      return snapshot.assignments;
    }
    return snapshot.grades;
  }
}
