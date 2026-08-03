import type { RoleCode } from '@dolphincloud/auth';
import type { Href } from 'expo-router';

export const ROLE_HOME_PATHS = {
  teacher: '/(teacher)',
  class_terminal: '/(class-terminal)',
  family: '/(family)',
  bank_operator: '/(bank-operator)',
  council: '/(council)',
  admin: '/(admin)',
} as const satisfies Record<RoleCode, Href>;
