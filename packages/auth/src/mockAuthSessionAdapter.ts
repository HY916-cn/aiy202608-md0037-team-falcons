import { ROLE_CODES, type RoleCode } from './roles';
import {
  EMPTY_AUTH_SESSION,
  type AuthLoginInput,
  type AuthRoleScope,
  type AuthSession,
  type AuthSessionAdapter,
  type AuthUser,
} from './session';

const MOCK_AUTH_USER: AuthUser = {
  displayName: '演示用户',
  id: 'demo_user_auth',
};

const MOCK_ROLE_SCOPES = {
  teacher: {
    assignmentId: 'demo_assignment_teacher',
    id: 'demo_school',
    label: '海豚云演示学校',
    role: 'teacher',
    type: 'school',
  },
  class_terminal: {
    assignmentId: 'demo_assignment_class_terminal',
    id: '20000000-0000-0000-0000-000000000001',
    label: '演示班级',
    role: 'class_terminal',
    type: 'class',
  },
  family: {
    assignmentId: 'demo_assignment_family',
    id: 'demo_household',
    label: '演示家庭',
    role: 'family',
    type: 'household',
  },
  bank_operator: {
    assignmentId: 'demo_assignment_bank_operator',
    id: 'demo_school',
    label: '海豚云演示学校',
    role: 'bank_operator',
    type: 'school',
  },
  council: {
    assignmentId: 'demo_assignment_council',
    id: 'demo_school',
    label: '海豚云演示学校',
    role: 'council',
    type: 'school',
  },
  admin: {
    assignmentId: 'demo_assignment_admin',
    id: 'demo_school',
    label: '海豚云演示学校',
    role: 'admin',
    type: 'school',
  },
} as const satisfies Record<RoleCode, AuthRoleScope>;

type MockAuthSessionAdapterOptions = {
  readonly initialRole?: RoleCode;
};

export class MockAuthSessionAdapter implements AuthSessionAdapter {
  private currentRole: RoleCode | null;

  constructor(options: MockAuthSessionAdapterOptions = {}) {
    this.currentRole = options.initialRole ?? null;
  }

  async getSession(): Promise<AuthSession> {
    return this.createSession(this.currentRole);
  }

  async login(input: AuthLoginInput): Promise<AuthSession> {
    const role = this.resolveRoleFromEmail(input.email);

    if (input.password.length === 0) {
      throw new Error('VALIDATION_ERROR');
    }

    this.currentRole = role;
    return this.createSession(role);
  }

  async logout(): Promise<AuthSession> {
    this.currentRole = null;
    return EMPTY_AUTH_SESSION;
  }

  async switchRole(role: RoleCode): Promise<AuthSession> {
    if (this.currentRole === null) {
      throw new Error('UNAUTHENTICATED');
    }

    this.currentRole = role;
    return this.createSession(role);
  }

  async switchRoleScope(roleAssignmentId: string): Promise<AuthSession> {
    if (this.currentRole === null) {
      throw new Error('UNAUTHENTICATED');
    }
    const scope = Object.values(MOCK_ROLE_SCOPES).find(
      (candidate) => candidate.assignmentId === roleAssignmentId,
    );
    if (scope === undefined) {
      throw new Error('FORBIDDEN');
    }
    this.currentRole = scope.role;
    return this.createSession(scope.role);
  }

  private createSession(role: RoleCode | null): AuthSession {
    if (role === null) {
      return EMPTY_AUTH_SESSION;
    }

    return {
      availableRoles: ROLE_CODES,
      availableRoleScopes: Object.values(MOCK_ROLE_SCOPES),
      currentRole: role,
      roleScope: MOCK_ROLE_SCOPES[role],
      user: MOCK_AUTH_USER,
    };
  }

  private resolveRoleFromEmail(email: string): RoleCode {
    const normalizedEmail = email.trim().toLowerCase();
    const role = ROLE_CODES.find((candidateRole) => {
      const prefix =
        candidateRole === 'class_terminal'
          ? 'demo_class_'
          : candidateRole === 'bank_operator'
            ? 'demo_bank_'
            : `demo_${candidateRole}_`;

      return normalizedEmail.startsWith(prefix);
    });

    if (role === undefined) {
      throw new Error('UNAUTHENTICATED');
    }

    return role;
  }
}
