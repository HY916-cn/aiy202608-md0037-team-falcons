import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseGovernanceService } from '../governanceService';

const scopes = {
  bank: { assignmentId: '81000000-0000-0000-0000-000000000001', id: '10000000-0000-0000-0000-000000000001', label: '演示学校', role: 'bank_operator', type: 'school' },
  classTerminal: { assignmentId: '81000000-0000-0000-0000-000000000002', id: '20000000-0000-0000-0000-000000000001', label: '海豚一班', role: 'class_terminal', type: 'class' },
  teacher: { assignmentId: '81000000-0000-0000-0000-000000000003', id: '10000000-0000-0000-0000-000000000001', label: '演示学校', role: 'teacher', type: 'school' },
} as const;

function createClient() {
  const assignmentFilters: [string, unknown][] = [];
  const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
  const from = vi.fn((table: string) => {
    if (table !== 'role_assignments') throw new Error(`UNEXPECTED_TABLE:${table}`);
    const chain = {
      eq: vi.fn((key: string, value: unknown) => {
        assignmentFilters.push([key, value]);
        return chain;
      }),
      single: vi.fn().mockResolvedValue({ data: { id: 'validated' }, error: null }),
    };
    return { select: vi.fn(() => chain) };
  });
  return {
    assignmentFilters,
    client: { from, rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe('SupabaseGovernanceService writes', () => {
  it('验证精确 active role scope 后按 PR #33 参数调用学生分 RPC', async () => {
    const { assignmentFilters, client, rpc } = createClient();
    const service = new SupabaseGovernanceService(client);
    await service.applyStudentScore(scopes.classTerminal, {
      categoryId: '31000000-0000-0000-0000-000000000001',
      delta: -3,
      reason: '本次覆盖默认分值',
      studentId: '50000000-0000-0000-0000-000000000001',
    });

    expect(assignmentFilters).toEqual([
      ['id', scopes.classTerminal.assignmentId],
      ['role', 'class_terminal'],
      ['scope_type', 'class'],
      ['scope_id', scopes.classTerminal.id],
    ]);
    expect(rpc).toHaveBeenCalledWith('apply_student_score', expect.objectContaining({
      delta: -3,
      reason: '本次覆盖默认分值',
      target_category_id: '31000000-0000-0000-0000-000000000001',
      target_student_id: '50000000-0000-0000-0000-000000000001',
    }));
    const params = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(params).not.toHaveProperty('actorId');
    expect(params).not.toHaveProperty('actor_id');
    expect(params).not.toHaveProperty('role');
  });

  it('罚款创建、结算、取消和指定撤销使用原 RPC 契约', async () => {
    const { client, rpc } = createClient();
    const service = new SupabaseGovernanceService(client);
    await service.createFine(scopes.teacher, { amount: 10, reason: '物品损坏', ruleId: '71000000-0000-0000-0000-000000000001', studentId: '50000000-0000-0000-0000-000000000001' });
    await service.settleFine(scopes.bank, '73000000-0000-0000-0000-000000000001');
    await service.cancelFine(scopes.bank, '73000000-0000-0000-0000-000000000002', '核对后取消');
    await service.reverseFine(scopes.bank, '73000000-0000-0000-0000-000000000001', '指定记录复核撤销');

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'create_fine_order',
      'settle_fine_order',
      'cancel_fine_order',
      'reverse_fine_order',
    ]);
    expect(rpc.mock.calls[2]![1]).toEqual(expect.objectContaining({ p_cancellation_note: '核对后取消', target_order_id: '73000000-0000-0000-0000-000000000002' }));
    expect(rpc.mock.calls[3]![1]).toEqual(expect.objectContaining({ reversal_reason: '指定记录复核撤销', target_order_id: '73000000-0000-0000-0000-000000000001' }));
  });

  it('在发起数据库请求前拒绝错误角色', async () => {
    const { client, rpc } = createClient();
    const service = new SupabaseGovernanceService(client);

    await expect(service.grantDolphin(scopes.classTerminal, { amount: 10, reason: '越权', studentId: '50000000-0000-0000-0000-000000000001' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
