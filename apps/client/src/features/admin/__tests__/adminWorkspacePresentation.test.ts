import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSION_MATRIX,
  assertPermissionMatrixComplete,
  buildCsv,
  resolveAdminWorkspaceLayout,
  selectAdminAuditEvents,
  selectAdminUsers,
} from '../adminWorkspacePresentation';
import type { AdminAuditRow, AdminUserRow } from '../adminWorkspaceService';

const USERS: readonly AdminUserRow[] = [
  {
    createdAt: '2026-08-05T01:00:00Z',
    displayName: '陈老师',
    id: 'user-teacher',
    roleScopes: [
      {
        assignmentId: 'assignment-teacher',
        label: '八年级一班',
        role: 'teacher',
        scopeId: 'class-one',
        scopeType: 'class',
      },
    ],
    status: 'active',
  },
  {
    createdAt: '2026-08-05T02:00:00Z',
    displayName: '停用账号',
    id: 'user-disabled',
    roleScopes: [],
    status: 'disabled',
  },
];

const AUDIT_EVENTS: readonly AdminAuditRow[] = [
  {
    action: 'student_score_apply',
    actorId: 'user-teacher',
    actorName: '陈老师',
    actorRole: 'teacher',
    createdAt: '2026-08-05T03:00:00Z',
    id: 'audit-new',
    result: 'success',
    targetId: 'student-one',
    targetType: 'student',
  },
  {
    action: 'fine_create',
    actorId: 'user-teacher',
    actorName: '陈老师',
    actorRole: 'teacher',
    createdAt: '2026-08-05T02:00:00Z',
    id: 'audit-old',
    result: 'denied',
    targetId: 'fine-one',
    targetType: 'fine_order',
  },
];

describe('adminWorkspacePresentation', () => {
  it('390px 固定使用紧凑行列表，不压缩宽表格', () => {
    expect(resolveAdminWorkspaceLayout(390)).toBe('compact');
    expect(resolveAdminWorkspaceLayout(720)).toBe('wide');
  });

  it('账号搜索、状态筛选与排序只处理传入的已加载记录', () => {
    expect(selectAdminUsers(USERS, '八年级一班', 'all', 'name_asc')).toEqual([
      USERS[0],
    ]);
    expect(selectAdminUsers(USERS, '', 'disabled', 'newest')).toEqual([
      USERS[1],
    ]);
    expect(selectAdminUsers([], '任何内容', 'all', 'name_asc')).toEqual([]);
  });

  it('审计搜索、结果筛选和排序不会生成额外事件', () => {
    expect(
      selectAdminAuditEvents(AUDIT_EVENTS, '罚款', 'denied', 'newest'),
    ).toEqual([]);
    expect(
      selectAdminAuditEvents(AUDIT_EVENTS, 'fine', 'denied', 'newest'),
    ).toEqual([AUDIT_EVENTS[1]]);
    expect(
      selectAdminAuditEvents(AUDIT_EVENTS, '', 'all', 'oldest').map(
        (event) => event.id,
      ),
    ).toEqual(['audit-old', 'audit-new']);
  });

  it('CSV 正确转义逗号、引号和换行并保留 UTF-8 BOM', () => {
    expect(
      buildCsv(
        [{ name: '张三,一班', note: '他说"完成"\n已确认' }],
        [
          { header: '姓名', value: (row) => row.name },
          { header: '说明', value: (row) => row.note },
        ],
      ),
    ).toBe('\uFEFF姓名,说明\r\n"张三,一班","他说""完成""\n已确认"\r\n');
  });

  it('权限矩阵覆盖六种固定角色且不重复', () => {
    expect(() => assertPermissionMatrixComplete()).not.toThrow();
    expect(ADMIN_PERMISSION_MATRIX.map((row) => row.role).sort()).toEqual(
      [...ROLE_CODES].sort(),
    );
  });
});
