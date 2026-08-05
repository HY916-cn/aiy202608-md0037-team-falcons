import { describe, expect, it } from 'vitest';

import {
  GOVERNANCE_DEMO_IDS,
  MockGovernanceService,
} from '../mockGovernanceService';

const scopes = {
  bank: { assignmentId: 'bank-assignment', id: GOVERNANCE_DEMO_IDS.SCHOOL_ID, label: '演示学校', role: 'bank_operator', type: 'school' },
  classTerminal: { assignmentId: 'terminal-assignment', id: GOVERNANCE_DEMO_IDS.CLASS_ONE, label: '海豚一班', role: 'class_terminal', type: 'class' },
  council: { assignmentId: 'council-assignment', id: GOVERNANCE_DEMO_IDS.SCHOOL_ID, label: '演示学校', role: 'council', type: 'school' },
  family: { assignmentId: 'family-assignment', id: 'household-one', label: '演示家庭', role: 'family', type: 'household' },
  teacher: { assignmentId: 'teacher-assignment', id: GOVERNANCE_DEMO_IDS.SCHOOL_ID, label: '演示学校', role: 'teacher', type: 'school' },
} as const;

describe('MockGovernanceService', () => {
  it('允许用本次分值覆盖条目默认值并刷新排行', async () => {
    const service = new MockGovernanceService();
    const before = await service.load(scopes.teacher);
    const category = before.studentCategories.find((item) => item.defaultDelta === 2)!;

    await service.applyStudentScore(scopes.teacher, {
      categoryId: category.id,
      delta: 7,
      reason: '本次表现特别突出',
      studentId: GOVERNANCE_DEMO_IDS.STUDENT_ONE,
    });

    const after = await service.load(scopes.teacher);
    expect(after.studentEntries.at(-1)?.delta).toBe(7);
    expect(after.studentRanking.find((item) => item.studentId === GOVERNANCE_DEMO_IDS.STUDENT_ONE)).toMatchObject({ rank: 1, score: 9 });
  });

  it('家庭端只显示绑定学生且保留真实非第一名名次', async () => {
    const service = new MockGovernanceService();
    const snapshot = await service.load(scopes.family);

    expect(snapshot.students.map((item) => item.id)).toEqual([GOVERNANCE_DEMO_IDS.STUDENT_ONE]);
    expect(snapshot.studentRanking).toHaveLength(1);
    expect(snapshot.studentRanking[0]).toMatchObject({ displayName: null, rank: 2, studentId: GOVERNANCE_DEMO_IDS.STUDENT_ONE });
    expect(snapshot.studentEntries.every((item) => item.studentId === GOVERNANCE_DEMO_IDS.STUDENT_ONE)).toBe(true);
  });

  it('班级端不返回任何海豚币、流水或罚款数据', async () => {
    const service = new MockGovernanceService();
    const snapshot = await service.load(scopes.classTerminal);

    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.transactions).toEqual([]);
    expect(snapshot.fineOrders).toEqual([]);
    await expect(service.grantDolphin(scopes.classTerminal, { amount: 10, reason: '越权', studentId: GOVERNANCE_DEMO_IDS.STUDENT_ONE })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('教师创建罚款、银行结算和指定撤销后家庭余额与状态一致', async () => {
    const service = new MockGovernanceService();
    const rule = (await service.load(scopes.teacher)).fineRules[0]!;
    await service.createFine(scopes.teacher, { amount: 10, reason: '合成演示罚款', ruleId: rule.id, studentId: GOVERNANCE_DEMO_IDS.STUDENT_ONE });
    const created = (await service.load(scopes.bank)).fineOrders[0]!;
    expect(created.status).toBe('pending');

    await service.settleFine(scopes.bank, created.id);
    let family = await service.load(scopes.family);
    expect(family.accounts[0]?.balance).toBe(110);
    expect(family.fineOrders[0]?.status).toBe('settled');

    await service.reverseFine(scopes.bank, created.id, '银行复核确认撤销');
    family = await service.load(scopes.family);
    expect(family.accounts[0]?.balance).toBe(120);
    expect(family.fineOrders[0]?.status).toBe('reversed');
    expect(family.transactions.map((item) => item.kind)).toEqual(['reversal', 'fine_settle']);
  });

  it('拒绝错误角色调用班级分和罚款处理', async () => {
    const service = new MockGovernanceService();
    await expect(service.applyClassScore(scopes.teacher, { categoryId: 'category', classId: GOVERNANCE_DEMO_IDS.CLASS_ONE, delta: 2, reason: '越权' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.settleFine(scopes.teacher, 'order')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.resolveAppeal(scopes.bank, 'appeal', true, '越权处理')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
