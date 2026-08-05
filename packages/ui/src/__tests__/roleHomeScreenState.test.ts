import { describe, expect, it, vi } from 'vitest';

import {
  reduceRoleHomeMenu,
  resolveRoleHomeLayout,
} from '../RoleHomeScreen';
import { resolveWorkspaceLayout } from '../ProfessionalWorkspace';

const { EmptyComponent } = vi.hoisted(() => ({ EmptyComponent: () => null }));

vi.mock('react-native', () => ({
  Platform: { select: (options: { web?: unknown }) => options.web },
  Pressable: EmptyComponent,
  ScrollView: EmptyComponent,
  StyleSheet: { create: <Styles,>(styles: Styles) => styles },
  Text: EmptyComponent,
  TextInput: EmptyComponent,
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: EmptyComponent,
}));

vi.mock('react-native-svg', () => ({
  Circle: EmptyComponent,
  G: EmptyComponent,
  Path: EmptyComponent,
  Rect: EmptyComponent,
  Svg: EmptyComponent,
}));

vi.mock('lucide-react-native', () => ({
  Bell: EmptyComponent,
  Bot: EmptyComponent,
  ChartColumn: EmptyComponent,
  ChevronDown: EmptyComponent,
  ClipboardList: EmptyComponent,
  Coins: EmptyComponent,
  Ellipsis: EmptyComponent,
  FileClock: EmptyComponent,
  FolderUp: EmptyComponent,
  GraduationCap: EmptyComponent,
  History: EmptyComponent,
  House: EmptyComponent,
  HouseHeart: EmptyComponent,
  Landmark: EmptyComponent,
  LogOut: EmptyComponent,
  ReceiptText: EmptyComponent,
  Scale: EmptyComponent,
  Settings: EmptyComponent,
  ShieldCheck: EmptyComponent,
  SlidersHorizontal: EmptyComponent,
  Star: EmptyComponent,
  UsersRound: EmptyComponent,
}));

describe('RoleHomeScreen shell state', () => {
  it.each([
    [390, true, false],
    [768, false, false],
    [1440, false, true],
  ])('为 %ipx 选择稳定布局', (width, isCompactMobile, isWide) => {
    expect(resolveRoleHomeLayout(width)).toEqual({ isCompactMobile, isWide });
  });

  it('账号、通知与更多菜单互斥，并支持再次点击关闭', () => {
    let menu = reduceRoleHomeMenu(null, { menu: 'account', type: 'toggle' });
    expect(menu).toBe('account');

    menu = reduceRoleHomeMenu(menu, { menu: 'notifications', type: 'toggle' });
    expect(menu).toBe('notifications');

    menu = reduceRoleHomeMenu(menu, { menu: 'more', type: 'toggle' });
    expect(menu).toBe('more');
    expect(reduceRoleHomeMenu(menu, { menu: 'more', type: 'toggle' })).toBeNull();
  });

  it.each(['dismiss', 'escape', 'context-changed'] as const)(
    '%s 会关闭任一菜单',
    (type) => {
      expect(reduceRoleHomeMenu('account', { type })).toBeNull();
      expect(reduceRoleHomeMenu('notifications', { type })).toBeNull();
      expect(reduceRoleHomeMenu('more', { type })).toBeNull();
    },
  );

  it.each([
    [390, true, false],
    [768, false, true],
    [1440, false, false],
  ])('工作区在 %ipx 不挤压桌面布局', (width, isCompact, isTablet) => {
    expect(resolveWorkspaceLayout(width)).toEqual({ isCompact, isTablet });
  });
});
