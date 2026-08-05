import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isRoleCode, type RoleCode } from './roles';
import {
  EMPTY_AUTH_SESSION,
  type AuthLoginInput,
  type AuthRoleScope,
  type AuthScopeType,
  type AuthSession,
  type AuthSessionAdapter,
} from './session';

const SCOPE_TYPES = ['school', 'class', 'household'] as const;

type RoleAssignmentRow = {
  readonly id: string;
  readonly role: string;
  readonly scope_id: string;
  readonly scope_type: string;
};

type ProfileRow = {
  readonly display_name: string;
  readonly id: string;
};

type SupabaseAuthSessionAdapterOptions = {
  readonly client: SupabaseClient;
};

type CreateSupabaseAuthSessionAdapterOptions = {
  readonly anonKey: string;
  readonly url: string;
};

function isScopeType(value: string): value is AuthScopeType {
  return SCOPE_TYPES.some((scopeType) => scopeType === value);
}

function uniqueRoles(scopes: readonly AuthRoleScope[]): readonly RoleCode[] {
  return [...new Set(scopes.map((scope) => scope.role))];
}

export class SupabaseAuthSessionAdapter implements AuthSessionAdapter {
  private readonly client: SupabaseClient;
  private currentRole: RoleCode | null = null;
  private currentRoleAssignmentId: string | null = null;

  constructor({ client }: SupabaseAuthSessionAdapterOptions) {
    this.client = client;
  }

  async getSession(): Promise<AuthSession> {
    return this.loadSession(this.currentRole, this.currentRoleAssignmentId);
  }

  async login(input: AuthLoginInput): Promise<AuthSession> {
    const email = input.email.trim();

    if (email.length === 0 || input.password.length === 0) {
      throw new Error('VALIDATION_ERROR');
    }

    const { error } = await this.client.auth.signInWithPassword({
      email,
      password: input.password,
    });

    if (error !== null) {
      throw new Error('UNAUTHENTICATED');
    }

    this.currentRole = null;
    this.currentRoleAssignmentId = null;
    return this.loadSession(null, null);
  }

  async logout(): Promise<AuthSession> {
    const { error } = await this.client.auth.signOut();

    if (error !== null) {
      throw new Error('INTERNAL_ERROR');
    }

    this.currentRole = null;
    this.currentRoleAssignmentId = null;
    return EMPTY_AUTH_SESSION;
  }

  subscribe(listener: (session: AuthSession) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.currentRole = null;
        this.currentRoleAssignmentId = null;
        listener(EMPTY_AUTH_SESSION);
        return;
      }

      if (
        event !== 'SIGNED_IN' &&
        event !== 'TOKEN_REFRESHED' &&
        event !== 'USER_UPDATED'
      ) {
        return;
      }

      // Supabase recommends deferring other auth calls until its callback lock is released.
      setTimeout(() => {
        void this.loadSession(this.currentRole, this.currentRoleAssignmentId)
          .then(listener)
          .catch(() => {
            this.currentRole = null;
            this.currentRoleAssignmentId = null;
            listener(EMPTY_AUTH_SESSION);
          });
      }, 0);
    });

    return () => data.subscription.unsubscribe();
  }

  async switchRole(role: RoleCode): Promise<AuthSession> {
    const session = await this.loadSession(role, null);

    if (!session.availableRoles.includes(role)) {
      throw new Error('FORBIDDEN');
    }

    this.currentRole = role;
    return session;
  }

  async switchRoleScope(roleAssignmentId: string): Promise<AuthSession> {
    const session = await this.loadSession(null, roleAssignmentId);
    if (session.roleScope?.assignmentId !== roleAssignmentId) {
      throw new Error('FORBIDDEN');
    }
    return session;
  }

  private async loadSession(
    preferredRole: RoleCode | null,
    preferredRoleAssignmentId: string | null,
  ): Promise<AuthSession> {
    const {
      data: { user },
      error: userError,
    } = await this.client.auth.getUser();

    if (userError !== null || user === null) {
      this.currentRole = null;
      this.currentRoleAssignmentId = null;
      return EMPTY_AUTH_SESSION;
    }

    const [profileResult, assignmentsResult] = await Promise.all([
      this.client
        .from('profiles')
        .select('id, display_name')
        .eq('id', user.id)
        .single(),
      this.client
        .from('role_assignments')
        .select('id, role, scope_type, scope_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ]);

    if (profileResult.error !== null || assignmentsResult.error !== null) {
      throw new Error('INTERNAL_ERROR');
    }

    const profile = profileResult.data as ProfileRow;
    const assignments = assignmentsResult.data as RoleAssignmentRow[];
    const availableRoleScopes = await Promise.all(
      assignments.map((assignment) => this.mapRoleScope(assignment)),
    );
    const availableRoles = uniqueRoles(availableRoleScopes);
    const preferredScope =
      preferredRoleAssignmentId === null
        ? null
        : (availableRoleScopes.find(
            (scope) => scope.assignmentId === preferredRoleAssignmentId,
          ) ?? null);
    if (preferredRoleAssignmentId !== null && preferredScope === null) {
      throw new Error('FORBIDDEN');
    }
    const currentRole =
      preferredScope?.role ??
      (preferredRole !== null && availableRoles.includes(preferredRole)
        ? preferredRole
        : (availableRoles[0] ?? null));
    const roleScope =
      preferredScope ??
      availableRoleScopes.find((scope) => scope.role === currentRole) ??
      null;

    this.currentRole = currentRole;
    this.currentRoleAssignmentId = roleScope?.assignmentId ?? null;

    return {
      availableRoles,
      availableRoleScopes,
      currentRole,
      roleScope,
      user: {
        displayName: profile.display_name,
        id: profile.id,
      },
    };
  }

  private async mapRoleScope(
    assignment: RoleAssignmentRow,
  ): Promise<AuthRoleScope> {
    if (!isRoleCode(assignment.role) || !isScopeType(assignment.scope_type)) {
      throw new Error('INTERNAL_ERROR');
    }

    const table =
      assignment.scope_type === 'school'
        ? 'schools'
        : assignment.scope_type === 'class'
          ? 'classes'
          : 'households';
    const { data, error } = await this.client
      .from(table)
      .select('name')
      .eq('id', assignment.scope_id)
      .single();

    if (error !== null || data === null || typeof data.name !== 'string') {
      throw new Error('INTERNAL_ERROR');
    }

    return {
      assignmentId: assignment.id,
      id: assignment.scope_id,
      label: data.name,
      role: assignment.role,
      type: assignment.scope_type,
    };
  }
}

export function createSupabaseAuthSessionAdapter({
  anonKey,
  url,
}: CreateSupabaseAuthSessionAdapterOptions): SupabaseAuthSessionAdapter {
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return new SupabaseAuthSessionAdapter({ client });
}
