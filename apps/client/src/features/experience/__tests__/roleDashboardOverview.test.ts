import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveDashboardActions,
  resolveDashboardLayout,
} from '../RoleDashboardOverview';

const { EmptyComponent } = vi.hoisted(() => ({ EmptyComponent: () => null }));

vi.mock('react-native', () => ({
  StyleSheet: { create: <Styles,>(styles: Styles) => styles },
  Text: EmptyComponent,
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: EmptyComponent,
}));

vi.mock('lucide-react-native', () => ({
  ArrowRight: EmptyComponent,
  Bot: EmptyComponent,
  ChartColumn: EmptyComponent,
  ClipboardList: EmptyComponent,
  Coins: EmptyComponent,
  FileClock: EmptyComponent,
  FolderUp: EmptyComponent,
  History: EmptyComponent,
  Landmark: EmptyComponent,
  ReceiptText: EmptyComponent,
  Settings: EmptyComponent,
  ShieldCheck: EmptyComponent,
  UserRoundCheck: EmptyComponent,
}));

vi.mock('@dolphincloud/ui', () => ({
  InteractivePressable: EmptyComponent,
  theme: {
    color: {
      border: { default: '#ddd' },
      brand: { primary: '#1677fe' },
      surface: { card: '#fff', muted: '#eee', primaryTint: '#eef6ff' },
      text: { disabled: '#999', primary: '#111', secondary: '#666' },
    },
    radius: { card: 12, control: 8, pill: 999 },
    space: { base: 12, lg: 24, md: 16, sm: 8 },
    text: { size: { lg: 20, sm: 14, xl: 24, xs: 12 } },
  },
}));

vi.mock('../ExperienceProvider', () => ({ useExperience: vi.fn() }));

describe('role dashboard overview', () => {
  it('六角色首页只提供当前角色真实导航入口', () => {
    const supportedKeys = {
      admin: ['users', 'permissions', 'audit', 'settings'],
      bank_operator: ['accounts', 'fines', 'transactions', 'ai'],
      class_terminal: ['courseware', 'assignment', 'class', 'ai'],
      council: ['class_score', 'inspections', 'appeals', 'ai'],
      family: ['assignment', 'growth', 'coins', 'ai'],
      teacher: ['courseware', 'assignment', 'class', 'coins', 'ai'],
    } as const;

    for (const role of ROLE_CODES) {
      const actions = resolveDashboardActions(role);
      const keys = actions.map((action) => action.key);

      expect(actions.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
      expect(actions.every((action) => action.label.trim().length > 0)).toBe(true);
      expect(keys).toEqual(supportedKeys[role]);
    }
  });

  it.each([
    [390, true],
    [768, false],
    [1440, false],
  ])('在 %ipx 选择可读的操作区布局', (width, isNarrow) => {
    expect(resolveDashboardLayout(width)).toEqual({ isNarrow });
  });
});
