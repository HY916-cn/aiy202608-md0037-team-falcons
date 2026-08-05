import type { RoleCode } from '@dolphincloud/auth';
import type { RoleNavigationKey } from '@dolphincloud/ui';

export type GovernanceExperienceMode =
  | 'class_score'
  | 'family_growth'
  | 'family_wallet'
  | 'student_score'
  | 'teacher_wallet'
  | 'wallet';

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
  if (role === 'bank_operator' && ['accounts', 'fines', 'transactions'].includes(navigation)) {
    return 'wallet';
  }
  if (role === 'council' && ['class_score', 'inspections', 'appeals'].includes(navigation)) {
    return 'class_score';
  }
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
