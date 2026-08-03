import type { RoleCode } from '@dolphincloud/auth';
import { ROLE_LABELS } from '@dolphincloud/auth';
import {
  GraduationCap,
  HouseHeart,
  Landmark,
  Scale,
  Settings,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';

import { theme } from './theme';

const ROLE_ICONS = {
  teacher: GraduationCap,
  class_terminal: UsersRound,
  family: HouseHeart,
  bank_operator: Landmark,
  council: Scale,
  admin: Settings,
} as const satisfies Record<RoleCode, LucideIcon>;

type RoleIconProps = {
  role: RoleCode;
  size?: number;
};

export function RoleIcon({ role, size = 24 }: RoleIconProps) {
  const Icon = ROLE_ICONS[role];

  return (
    <Icon
      accessibilityLabel={ROLE_LABELS[role]}
      color={theme.color.brand.primary}
      size={size}
      strokeWidth={2}
    />
  );
}
