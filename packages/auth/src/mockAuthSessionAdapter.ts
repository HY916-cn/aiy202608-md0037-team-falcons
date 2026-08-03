import { ROLE_CODES, type RoleCode } from './roles';
import {
  EMPTY_AUTH_SESSION,
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
    id: 'demo_school',
    label: '海豚云演示学校',
    type: 'school',
  },
  class_terminal: {
    id: 'demo_class',
    label: '演示班级',
    type: 'class',
  },
  family: {
    id: 'demo_household',
    label: '演示家庭',
    type: 'household',
  },
  bank_operator: {
    id: 'demo_school',
    label: '海豚云演示学校',
    type: 'school',
  },
  council: {
    id: 'demo_school',
    label: '海豚云演示学校',
    type: 'school',
  },
  admin: {
    id: 'demo_school',
    label: '海豚云演示学校',
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

  async login(role: RoleCode): Promise<AuthSession> {
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

  private createSession(role: RoleCode | null): AuthSession {
    if (role === null) {
      return EMPTY_AUTH_SESSION;
    }

    return {
      availableRoles: ROLE_CODES,
      currentRole: role,
      roleScope: MOCK_ROLE_SCOPES[role],
      user: MOCK_AUTH_USER,
    };
  }
}
