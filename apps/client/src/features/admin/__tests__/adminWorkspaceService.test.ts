import type { AuthRoleScope } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  OfflineAdminWorkspaceService,
  SupabaseAdminWorkspaceService,
} from '../adminWorkspaceService';

const ADMIN_SCOPE: AuthRoleScope = {
  assignmentId: 'assignment-admin',
  id: 'school-one',
  label: '海豚实验学校',
  role: 'admin',
  type: 'school',
};

type QueryResult = { readonly data: unknown; readonly error: null };

class FakeQuery implements PromiseLike<QueryResult> {
  constructor(
    private readonly table: string,
    private readonly rows: Readonly<Record<string, unknown>>,
  ) {}

  eq(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  order(): this {
    return this;
  }

  select(): this {
    return this;
  }

  async single(): Promise<QueryResult> {
    return { data: { id: 'assignment-admin' }, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows[this.table] ?? [], error: null }).then(
      onfulfilled ?? undefined,
    );
  }
}

function createFakeClient(): SupabaseClient {
  const rows: Readonly<Record<string, unknown>> = {
    audit_events: [
      {
        action: 'student_score_apply',
        actor_id: 'user-teacher',
        actor_role: 'teacher',
        created_at: '2026-08-05T03:00:00Z',
        id: 'audit-one',
        result: 'success',
        target_id: 'student-one',
        target_type: 'student',
      },
    ],
    classes: [{ grade: '八年级', id: 'class-one', name: '一班' }],
    households: [{ id: 'household-one', name: '陈同学家庭' }],
    profiles: [
      {
        created_at: '2026-08-01T00:00:00Z',
        display_name: '陈老师',
        id: 'user-teacher',
        status: 'active',
      },
    ],
    role_assignments: [
      {
        id: 'assignment-teacher',
        role: 'teacher',
        scope_id: 'class-one',
        scope_type: 'class',
        user_id: 'user-teacher',
      },
    ],
    schools: [{ id: 'school-one', name: '海豚实验学校' }],
  };
  return {
    from: (table: string) => new FakeQuery(table, rows),
  } as unknown as SupabaseClient;
}

describe('adminWorkspaceService', () => {
  it('无 Supabase 时返回可验证离线状态且不生成账号或审计数据', async () => {
    const snapshot = await new OfflineAdminWorkspaceService().load(ADMIN_SCOPE);
    expect(snapshot.source).toBe('offline');
    expect(snapshot.loadState).toBe('offline');
    expect(snapshot.users).toEqual([]);
    expect(snapshot.auditEvents).toEqual([]);
    expect(snapshot.services.every((service) => service.state === 'offline')).toBe(
      true,
    );
  });

  it('拒绝用非学校管理端范围读取工作台', async () => {
    await expect(
      new OfflineAdminWorkspaceService().load({
        ...ADMIN_SCOPE,
        role: 'teacher',
      }),
    ).rejects.toThrow('ADMIN_SCOPE_REQUIRED');
  });

  it('Supabase 适配器仅映射真实查询结果并关联角色范围与审计操作人', async () => {
    const snapshot = await new SupabaseAdminWorkspaceService(
      createFakeClient(),
    ).load(ADMIN_SCOPE);
    expect(snapshot.source).toBe('supabase');
    expect(snapshot.loadState).toBe('ready');
    expect(snapshot.users).toEqual([
      expect.objectContaining({
        displayName: '陈老师',
        roleScopes: [
          expect.objectContaining({ label: '八年级 一班', role: 'teacher' }),
        ],
      }),
    ]);
    expect(snapshot.auditEvents).toEqual([
      expect.objectContaining({ actorName: '陈老师', result: 'success' }),
    ]);
  });
});
