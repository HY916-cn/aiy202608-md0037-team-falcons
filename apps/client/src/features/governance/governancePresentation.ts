import type { RoleCode } from '@dolphincloud/auth';
import type { RoleNavigationKey } from '@dolphincloud/ui';

export type GovernanceExperienceMode =
  | 'class_score'
  | 'class_inspections'
  | 'class_appeals'
  | 'family_growth'
  | 'family_wallet'
  | 'student_score'
  | 'teacher_wallet'
  | 'wallet_accounts'
  | 'wallet_fines'
  | 'wallet_transactions';

export function resolveGovernanceExperienceMode(
  role: RoleCode,
  navigation: RoleNavigationKey,
): GovernanceExperienceMode | null {
  if ((role === 'teacher' || role === 'class_terminal') && navigation === 'class') {
    return 'student_score';
  }
  if (role === 'family' && navigation === 'growth') return 'family_growth';
  if (role === 'family' && navigation === 'coins') return 'family_wallet';
  if (role === 'teacher' && navigation === 'coins') return 'teacher_wallet';
  if (role === 'bank_operator' && navigation === 'accounts') return 'wallet_accounts';
  if (role === 'bank_operator' && navigation === 'fines') return 'wallet_fines';
  if (role === 'bank_operator' && navigation === 'transactions') return 'wallet_transactions';
  if (role === 'council' && navigation === 'class_score') return 'class_score';
  if (role === 'council' && navigation === 'inspections') return 'class_inspections';
  if (role === 'council' && navigation === 'appeals') return 'class_appeals';
  return null;
}

export function resolveGovernanceLayout(width: number): {
  readonly compact: boolean;
  readonly maxItemWidth: number;
} {
  return {
    compact: width < 720,
    maxItemWidth: Math.max(0, width - (width < 720 ? 32 : 64)),
  };
}
