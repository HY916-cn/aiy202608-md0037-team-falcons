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

  constructor({ client }: SupabaseAuthSessionAdapterOptions) {
    this.client = client;
  }

  async getSession(): Promise<AuthSession> {
    return this.loadSession(this.currentRole);
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
    return this.loadSession(null);
  }

  async logout(): Promise<AuthSession> {
    const { error } = await this.client.auth.signOut();

    if (error !== null) {
      throw new Error('INTERNAL_ERROR');
    }

    this.currentRole = null;
    return EMPTY_AUTH_SESSION;
  }

  async switchRole(role: RoleCode): Promise<AuthSession> {
    const session = await this.loadSession(role);

    if (!session.availableRoles.includes(role)) {
      throw new Error('FORBIDDEN');
    }

    this.currentRole = role;
    return session;
  }

  private async loadSession(preferredRole: RoleCode | null): Promise<AuthSession> {
    const {
      data: { user },
      error: userError,
    } = await this.client.auth.getUser();

    if (userError !== null || user === null) {
      this.currentRole = null;
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
        .select('role, scope_type, scope_id')
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
    const currentRole =
      preferredRole !== null && availableRoles.includes(preferredRole)
        ? preferredRole
        : (availableRoles[0] ?? null);
    const roleScope =
      availableRoleScopes.find((scope) => scope.role === currentRole) ?? null;

    this.currentRole = currentRole;

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
