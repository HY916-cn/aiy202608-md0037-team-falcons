import { describe, expect, it } from 'vitest';
import type { GovernanceSnapshot } from '@dolphincloud/api-client';

import {
  applyTeacherFineRuleSelection,
  resolveInitialTeacherFineState,
} from '../walletWorkflow';

describe('walletWorkflow', () => {
  const rules: GovernanceSnapshot['fineRules'] = [
    {
      defaultAmount: 50,
      description: '设备损坏',
      displayName: '设备损坏',
      id: 'rule-inactive',
      isActive: false,
      schoolId: 'school-1',
      slug: 'inactive',
    },
    {
      defaultAmount: 20,
      description: '未完成作业罚款',
      displayName: '未交作业',
      id: 'rule-1',
      isActive: true,
      schoolId: 'school-1',
      slug: 'homework_missing',
    },
    {
      defaultAmount: 30,
      description: '迟到早退罚款',
      displayName: '迟到',
      id: 'rule-2',
      isActive: true,
      schoolId: 'school-1',
      slug: 'late',
    },
  ];

  it('首次进入即可使用第一个启用规则的 UUID', () => {
    const state = resolveInitialTeacherFineState(rules);
    expect(state.ruleId).toBe('rule-1');
    expect(state.amount).toBe('20');
    expect(state.reason).toBe('未完成作业罚款');
  });

  it('无规则时不能提交（返回空 ruleId）', () => {
    const state = resolveInitialTeacherFineState([rules[0]!]); // 仅包含未启用规则
    expect(state.ruleId).toBe('');
    expect(state.amount).toBe('10'); // 回退默认值
    expect(state.reason).toBe('');
  });

  it('切换规则更新金额和说明', () => {
    const state = applyTeacherFineRuleSelection(rules, 'rule-2');
    expect(state).not.toBeNull();
    expect(state?.ruleId).toBe('rule-2');
    expect(state?.amount).toBe('30');
    expect(state?.reason).toBe('迟到早退罚款');
  });

  it('ruleSlug 不会作为 createFine.ruleId，且找不到规则时返回 null', () => {
    const state = applyTeacherFineRuleSelection(rules, 'homework_missing');
    expect(state).toBeNull();
  });
});
