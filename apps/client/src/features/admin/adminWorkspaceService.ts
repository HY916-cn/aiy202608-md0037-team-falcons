import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';
import { isRoleCode } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminWorkspaceSource = 'offline' | 'supabase';
export type AdminWorkspaceLoadState = 'offline' | 'partial' | 'ready';
export type AdminUserStatus = 'active' | 'disabled';
export type AdminAuditResult = 'success' | 'denied' | 'failed';
export type AdminServiceState = 'available' | 'degraded' | 'offline';

export type AdminRoleScopeRow = {
  readonly assignmentId: string;
  readonly label: string;
  readonly role: RoleCode;
  readonly scopeId: string;
  readonly scopeType: AuthRoleScope['type'];
};

export type AdminUserRow = {
  readonly createdAt: string;
  readonly displayName: string;
  readonly id: string;
  readonly roleScopes: readonly AdminRoleScopeRow[];
  readonly status: AdminUserStatus;
};

export type AdminAuditRow = {
  readonly action: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorRole: RoleCode;
  readonly createdAt: string;
  readonly id: string;
  readonly result: AdminAuditResult;
  readonly targetId: string;
  readonly targetType: string;
};

export type AdminServiceStatus = {
  readonly checkedAt: string;
  readonly detail: string;
  readonly id: 'identity' | 'directory' | 'audit';
  readonly label: string;
  readonly state: AdminServiceState;
};

export type AdminWorkspaceSnapshot = {
  readonly auditEvents: readonly AdminAuditRow[];
  readonly loadedAt: string;
  readonly loadState: AdminWorkspaceLoadState;
  readonly services: readonly AdminServiceStatus[];
  readonly source: AdminWorkspaceSource;
  readonly users: readonly AdminUserRow[];
};

export interface AdminWorkspaceService {
  load(roleScope: AuthRoleScope): Promise<AdminWorkspaceSnapshot>;
}

type ProfileRow = {
  readonly created_at: string;
  readonly display_name: string;
  readonly id: string;
  readonly status: AdminUserStatus;
};

type RoleAssignmentRow = {
  readonly id: string;
  readonly role: RoleCode;
  readonly scope_id: string;
  readonly scope_type: AuthRoleScope['type'];
  readonly user_id: string;
};

type AuditEventRow = {
  readonly action: string;
  readonly actor_id: string;
  readonly actor_role: RoleCode;
  readonly created_at: string;
  readonly id: string;
  readonly result: AdminAuditResult;
  readonly target_id: string;
  readonly target_type: string;
};

type DirectoryRow = {
  readonly id: string;
  readonly label: string;
};

const ADMIN_AUDIT_RESULTS = ['success', 'denied', 'failed'] as const;
const AUTH_SCOPE_TYPES = ['school', 'class', 'household'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isScopeType(value: unknown): value is AuthRoleScope['type'] {
  return AUTH_SCOPE_TYPES.some((scopeType) => scopeType === value);
}

function isUserStatus(value: unknown): value is AdminUserStatus {
  return value === 'active' || value === 'disabled';
}

function isAuditResult(value: unknown): value is AdminAuditResult {
  return ADMIN_AUDIT_RESULTS.some((result) => result === value);
}

function parseProfiles(value: unknown): readonly ProfileRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: ProfileRow[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isString(candidate.id) ||
      !isString(candidate.display_name) ||
      !isUserStatus(candidate.status) ||
      !isString(candidate.created_at)
    ) {
      return null;
    }
    rows.push({
      created_at: candidate.created_at,
      display_name: candidate.display_name,
      id: candidate.id,
      status: candidate.status,
    });
  }
  return rows;
}

function parseRoleAssignments(value: unknown): readonly RoleAssignmentRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: RoleAssignmentRow[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isString(candidate.id) ||
      !isString(candidate.user_id) ||
      typeof candidate.role !== 'string' ||
      !isRoleCode(candidate.role) ||
      !isScopeType(candidate.scope_type) ||
      !isString(candidate.scope_id)
    ) {
      return null;
    }
    rows.push({
      id: candidate.id,
      role: candidate.role,
      scope_id: candidate.scope_id,
      scope_type: candidate.scope_type,
      user_id: candidate.user_id,
    });
  }
  return rows;
}

function parseAuditEvents(value: unknown): readonly AuditEventRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AuditEventRow[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isString(candidate.id) ||
      !isString(candidate.action) ||
      !isString(candidate.actor_id) ||
      typeof candidate.actor_role !== 'string' ||
      !isRoleCode(candidate.actor_role) ||
      !isAuditResult(candidate.result) ||
      !isString(candidate.target_type) ||
      !isString(candidate.target_id) ||
      !isString(candidate.created_at)
    ) {
      return null;
    }
    rows.push({
      action: candidate.action,
      actor_id: candidate.actor_id,
      actor_role: candidate.actor_role,
      created_at: candidate.created_at,
      id: candidate.id,
      result: candidate.result,
      target_id: candidate.target_id,
      target_type: candidate.target_type,
    });
  }
  return rows;
}

function parseDirectoryRows(
  value: unknown,
  label: (candidate: Record<string, unknown>) => string | null,
): readonly DirectoryRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: DirectoryRow[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !isString(candidate.id)) return null;
    const resolvedLabel = label(candidate);
    if (resolvedLabel === null) return null;
    rows.push({ id: candidate.id, label: resolvedLabel });
  }
  return rows;
}

function status(
  checkedAt: string,
  id: AdminServiceStatus['id'],
  label: string,
  state: AdminServiceState,
  detail: string,
): AdminServiceStatus {
  return { checkedAt, detail, id, label, state };
}

export class OfflineAdminWorkspaceService implements AdminWorkspaceService {
  async load(roleScope: AuthRoleScope): Promise<AdminWorkspaceSnapshot> {
    if (roleScope.role !== 'admin' || roleScope.type !== 'school') {
      throw new Error('ADMIN_SCOPE_REQUIRED');
    }
    const checkedAt = new Date().toISOString();
    return {
      auditEvents: [],
      loadedAt: checkedAt,
      loadState: 'offline',
      services: [
        status(checkedAt, 'identity', '账号与角色范围', 'offline', '未配置 Supabase，未加载账号数据。'),
        status(checkedAt, 'directory', '学校与班级目录', 'offline', '未配置 Supabase，未加载目录数据。'),
        status(checkedAt, 'audit', '操作审计', 'offline', '未配置 Supabase，未加载审计事件。'),
      ],
      source: 'offline',
      users: [],
    };
  }
}

export class SupabaseAdminWorkspaceService implements AdminWorkspaceService {
  constructor(private readonly client: SupabaseClient) {}

  async load(roleScope: AuthRoleScope): Promise<AdminWorkspaceSnapshot> {
    if (roleScope.role !== 'admin' || roleScope.type !== 'school') {
      throw new Error('ADMIN_SCOPE_REQUIRED');
    }

    const scopeCheck = await this.client
      .from('role_assignments')
      .select('id')
      .eq('id', roleScope.assignmentId)
      .eq('role', 'admin')
      .eq('scope_type', 'school')
      .eq('scope_id', roleScope.id)
      .single();
    if (scopeCheck.error !== null || scopeCheck.data?.id !== roleScope.assignmentId) {
      throw new Error('ADMIN_SCOPE_FORBIDDEN');
    }

    const [profileResult, assignmentResult, auditResult, schoolResult, classResult, householdResult] =
      await Promise.all([
        this.client
          .from('profiles')
          .select('id, display_name, status, created_at')
          .order('display_name'),
        this.client
          .from('role_assignments')
          .select('id, user_id, role, scope_type, scope_id')
          .order('created_at', { ascending: false }),
        this.client
          .from('audit_events')
          .select('id, actor_id, actor_role, action, target_type, target_id, result, created_at')
          .eq('school_id', roleScope.id)
          .order('created_at', { ascending: false })
          .limit(500),
        this.client.from('schools').select('id, name').eq('id', roleScope.id),
        this.client
          .from('classes')
          .select('id, grade, name')
          .eq('school_id', roleScope.id)
          .order('grade')
          .order('name'),
        this.client.from('households').select('id, name').order('name'),
      ]);

    const checkedAt = new Date().toISOString();
    const profiles = profileResult.error === null ? parseProfiles(profileResult.data) : null;
    const assignments =
      assignmentResult.error === null ? parseRoleAssignments(assignmentResult.data) : null;
    const audits = auditResult.error === null ? parseAuditEvents(auditResult.data) : null;
    const schools =
      schoolResult.error === null
        ? parseDirectoryRows(schoolResult.data, (row) =>
            isString(row.name) ? row.name : null,
          )
        : null;
    const classes =
      classResult.error === null
        ? parseDirectoryRows(classResult.data, (row) =>
            isString(row.grade) && isString(row.name)
              ? `${row.grade} ${row.name}`
              : null,
          )
        : null;
    const households =
      householdResult.error === null
        ? parseDirectoryRows(householdResult.data, (row) =>
            isString(row.name) ? row.name : null,
          )
        : null;

    const identityReady = profiles !== null && assignments !== null;
    const directoryReady = schools !== null && classes !== null && households !== null;
    const auditReady = audits !== null;
    const directoryLabels = new Map<string, string>();
    for (const row of [...(schools ?? []), ...(classes ?? []), ...(households ?? [])]) {
      directoryLabels.set(row.id, row.label);
    }

    const roleScopesByUser = new Map<string, AdminRoleScopeRow[]>();
    for (const assignment of assignments ?? []) {
      const rows = roleScopesByUser.get(assignment.user_id) ?? [];
      rows.push({
        assignmentId: assignment.id,
        label: directoryLabels.get(assignment.scope_id) ?? assignment.scope_id,
        role: assignment.role,
        scopeId: assignment.scope_id,
        scopeType: assignment.scope_type,
      });
      roleScopesByUser.set(assignment.user_id, rows);
    }

    const profileNames = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));
    const users: readonly AdminUserRow[] = identityReady
      ? (profiles ?? []).map((profile) => ({
          createdAt: profile.created_at,
          displayName: profile.display_name,
          id: profile.id,
          roleScopes: roleScopesByUser.get(profile.id) ?? [],
          status: profile.status,
        }))
      : [];
    const auditEvents: readonly AdminAuditRow[] = auditReady
      ? (audits ?? []).map((event) => ({
          action: event.action,
          actorId: event.actor_id,
          actorName: profileNames.get(event.actor_id) ?? event.actor_id,
          actorRole: event.actor_role,
          createdAt: event.created_at,
          id: event.id,
          result: event.result,
          targetId: event.target_id,
          targetType: event.target_type,
        }))
      : [];

    const readyCount = [identityReady, directoryReady, auditReady].filter(Boolean).length;
    return {
      auditEvents,
      loadedAt: checkedAt,
      loadState: readyCount === 3 ? 'ready' : 'partial',
      services: [
        status(
          checkedAt,
          'identity',
          '账号与角色范围',
          identityReady ? 'available' : 'degraded',
          identityReady
            ? `已按当前 RLS 范围加载 ${users.length} 个账号。`
            : '账号或角色范围查询失败，未展示不完整记录。',
        ),
        status(
          checkedAt,
          'directory',
          '学校与班级目录',
          directoryReady ? 'available' : 'degraded',
          directoryReady
            ? `已加载 ${schools?.length ?? 0} 所学校、${classes?.length ?? 0} 个班级。`
            : '目录查询不完整，范围名称可能退回为技术标识。',
        ),
        status(
          checkedAt,
          'audit',
          '操作审计',
          auditReady ? 'available' : 'degraded',
          auditReady
            ? `已加载最近 ${auditEvents.length} 条审计事件。`
            : '审计查询失败，未展示伪造事件。',
        ),
      ],
      source: 'supabase',
      users,
    };
  }
}
