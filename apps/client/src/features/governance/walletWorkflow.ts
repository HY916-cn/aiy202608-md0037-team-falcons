import type { GovernanceSnapshot } from '@dolphincloud/api-client';

export function resolveInitialTeacherFineState(
  rules: GovernanceSnapshot['fineRules'],
): { amount: string; reason: string; ruleId: string } {
  const activeRules = rules.filter((item) => item.isActive);
  const firstRule = activeRules[0];
  if (firstRule === undefined) {
    return { amount: '10', reason: '', ruleId: '' };
  }
  return {
    amount: String(firstRule.defaultAmount),
    reason: firstRule.description,
    ruleId: firstRule.id,
  };
}

export function applyTeacherFineRuleSelection(
  rules: GovernanceSnapshot['fineRules'],
  ruleId: string,
): { amount: string; reason: string; ruleId: string } | null {
  const rule = rules.find((item) => item.id === ruleId);
  if (rule === undefined) {
    return null;
  }
  return {
    amount: String(rule.defaultAmount),
    reason: rule.description,
    ruleId,
  };
}
