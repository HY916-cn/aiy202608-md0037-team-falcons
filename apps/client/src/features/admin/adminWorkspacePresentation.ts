import { ROLE_CODES, type RoleCode } from '@dolphincloud/auth';

import type {
  AdminAuditResult,
  AdminAuditRow,
  AdminUserRow,
  AdminUserStatus,
} from './adminWorkspaceService';

export type AdminWorkspaceLayout = 'compact' | 'wide';
export type AdminUserStatusFilter = 'all' | AdminUserStatus;
export type AdminAuditResultFilter = 'all' | AdminAuditResult;
export type AdminUserSort = 'name_asc' | 'newest';
export type AdminAuditSort = 'newest' | 'oldest' | 'action_asc';

export type PermissionLevel = '管理' | '读写' | '查看' | '无';

export type AdminPermissionRow = {
  readonly audit: PermissionLevel;
  readonly classScore: PermissionLevel;
  readonly dolphinCoin: PermissionLevel;
  readonly identity: PermissionLevel;
  readonly role: RoleCode;
  readonly studentScore: PermissionLevel;
  readonly teaching: PermissionLevel;
};

export const ADMIN_PERMISSION_MATRIX: readonly AdminPermissionRow[] = [
  {
    audit: '查看',
    classScore: '查看',
    dolphinCoin: '查看',
    identity: '管理',
    role: 'admin',
    studentScore: '查看',
    teaching: '查看',
  },
  {
    audit: '无',
    classScore: '查看',
    dolphinCoin: '查看',
    identity: '无',
    role: 'teacher',
    studentScore: '读写',
    teaching: '读写',
  },
  {
    audit: '无',
    classScore: '查看',
    dolphinCoin: '无',
    identity: '无',
    role: 'class_terminal',
    studentScore: '读写',
    teaching: '查看',
  },
  {
    audit: '无',
    classScore: '无',
    dolphinCoin: '查看',
    identity: '无',
    role: 'family',
    studentScore: '查看',
    teaching: '查看',
  },
  {
    audit: '无',
    classScore: '无',
    dolphinCoin: '读写',
    identity: '无',
    role: 'bank_operator',
    studentScore: '无',
    teaching: '无',
  },
  {
    audit: '无',
    classScore: '读写',
    dolphinCoin: '无',
    identity: '无',
    role: 'council',
    studentScore: '无',
    teaching: '无',
  },
] as const;

export function resolveAdminWorkspaceLayout(width: number): AdminWorkspaceLayout {
  return width < 720 ? 'compact' : 'wide';
}

function includesQuery(values: readonly string[], query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  return (
    normalizedQuery.length === 0 ||
    values.some((value) =>
      value.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
    )
  );
}

export function selectAdminUsers(
  users: readonly AdminUserRow[],
  query: string,
  status: AdminUserStatusFilter,
  sort: AdminUserSort,
): readonly AdminUserRow[] {
  const selected = users.filter(
    (user) =>
      (status === 'all' || user.status === status) &&
      includesQuery(
        [
          user.displayName,
          user.id,
          ...user.roleScopes.flatMap((scope) => [
            scope.role,
            scope.label,
            scope.scopeType,
          ]),
        ],
        query,
      ),
  );
  return [...selected].sort((left, right) =>
    sort === 'name_asc'
      ? left.displayName.localeCompare(right.displayName, 'zh-CN')
      : right.createdAt.localeCompare(left.createdAt),
  );
}

export function selectAdminAuditEvents(
  events: readonly AdminAuditRow[],
  query: string,
  result: AdminAuditResultFilter,
  sort: AdminAuditSort,
): readonly AdminAuditRow[] {
  const selected = events.filter(
    (event) =>
      (result === 'all' || event.result === result) &&
      includesQuery(
        [
          event.action,
          event.actorName,
          event.actorId,
          event.actorRole,
          event.targetType,
          event.targetId,
        ],
        query,
      ),
  );
  return [...selected].sort((left, right) => {
    if (sort === 'action_asc') {
      return left.action.localeCompare(right.action, 'zh-CN');
    }
    return sort === 'oldest'
      ? left.createdAt.localeCompare(right.createdAt)
      : right.createdAt.localeCompare(left.createdAt);
  });
}

export type CsvColumn<Row> = {
  readonly header: string;
  readonly value: (row: Row) => string;
};

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(','),
  );
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

export function assertPermissionMatrixComplete(): void {
  const roles = ADMIN_PERMISSION_MATRIX.map((row) => row.role);
  if (
    roles.length !== ROLE_CODES.length ||
    ROLE_CODES.some((role) => !roles.includes(role))
  ) {
    throw new Error('ADMIN_PERMISSION_MATRIX_INCOMPLETE');
  }
}
