import { describe, expect, it, vi } from 'vitest';

import {
  isRoleHomeMenuInteractionTarget,
  reduceRoleHomeMenu,
  resolveRoleHomeLayout,
} from '../RoleHomeScreen';
import { resolveWorkspaceLayout } from '../ProfessionalWorkspace';
import { theme } from '../theme';

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

  it('只把弹层和触发器内部识别为菜单交互区域', () => {
    const internalTarget = {
      closest: vi.fn().mockReturnValue({ id: 'role-home-popup-account' }),
    } as unknown as EventTarget;
    const externalTarget = {
      closest: vi.fn().mockReturnValue(null),
    } as unknown as EventTarget;

    expect(isRoleHomeMenuInteractionTarget(internalTarget)).toBe(true);
    expect(isRoleHomeMenuInteractionTarget(externalTarget)).toBe(false);
    expect(isRoleHomeMenuInteractionTarget(null)).toBe(false);
  });

  it('使用 WinUI 的 4px 控件圆角和 8px 覆盖层圆角', () => {
    expect(theme.radius.control).toBe(4);
    expect(theme.radius.card).toBe(8);
    expect(theme.text.size.display).toBe(28);
  });

  it('使用 WinUI 浅色语义资源，而不是暗色资源值', () => {
    expect(theme.color.surface.page).toBe('#F3F3F3');
    expect(theme.color.surface.card).toBe('rgba(255,255,255,0.702)');
    expect(theme.color.surface.input).toBe('#FFFFFF');
    expect(theme.color.text.primary).toBe('rgba(0,0,0,0.894)');
    expect(theme.color.text.secondary).toBe('rgba(0,0,0,0.620)');
    expect(theme.color.border.default).toBe('rgba(0,0,0,0.060)');
    expect(theme.color.system.critical).toBe('#C42B1C');
  });

  it.each([
    [390, true, false],
    [768, false, true],
    [1440, false, false],
  ])('工作区在 %ipx 不挤压桌面布局', (width, isCompact, isTablet) => {
    expect(resolveWorkspaceLayout(width)).toEqual({ isCompact, isTablet });
  });
});
