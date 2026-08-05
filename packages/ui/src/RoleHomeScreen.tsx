import type { AuthRoleScope, AuthUser, RoleCode } from '@dolphincloud/auth';
import { ROLE_LABELS } from '@dolphincloud/auth';
import {
  Bell,
  Bot,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  Coins,
  Ellipsis,
  FileClock,
  FolderUp,
  History,
  House,
  Landmark,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { RoleIcon } from './RoleIcon';
import { DolphinCloudLogo } from './DolphinCloudLogo';
import { InteractivePressable } from './InteractivePressable';
import {
  resolveRolePageHeader,
  type RoleNavigationKey,
} from './roleNavigation';
import { theme } from './theme';

type NavigationItem = {
  readonly icon: LucideIcon;
  readonly key: RoleNavigationKey;
  readonly label: string;
};

const ROLE_NAVIGATION = {
  teacher: [
    { icon: House, key: 'home', label: '首页' },
    { icon: FolderUp, key: 'courseware', label: '课件' },
    { icon: ClipboardList, key: 'assignment', label: '作业' },
    { icon: UsersRound, key: 'class', label: '班级' },
    { icon: Coins, key: 'coins', label: '海豚币' },
    { icon: Bot, key: 'ai', label: 'AI 中心' },
  ],
  class_terminal: [
    { icon: House, key: 'home', label: '首页' },
    { icon: FolderUp, key: 'courseware', label: '课件' },
    { icon: ClipboardList, key: 'assignment', label: '作业' },
    { icon: Star, key: 'class', label: '班级表现' },
    { icon: Bot, key: 'ai', label: 'AI 中心' },
  ],
  family: [
    { icon: House, key: 'home', label: '首页' },
    { icon: ClipboardList, key: 'assignment', label: '作业' },
    { icon: ChartColumn, key: 'growth', label: '成长' },
    { icon: Coins, key: 'coins', label: '海豚币' },
    { icon: Bot, key: 'ai', label: 'AI 中心' },
  ],
  bank_operator: [
    { icon: House, key: 'home', label: '首页' },
    { icon: Landmark, key: 'accounts', label: '账户' },
    { icon: ReceiptText, key: 'fines', label: '罚款单' },
    { icon: History, key: 'transactions', label: '账户流水' },
    { icon: Bot, key: 'ai', label: 'AI 中心' },
  ],
  council: [
    { icon: House, key: 'home', label: '首页' },
    { icon: ShieldCheck, key: 'class_score', label: '班级分' },
    { icon: FileClock, key: 'inspections', label: '检查记录' },
    { icon: ClipboardList, key: 'appeals', label: '更正申请' },
    { icon: Bot, key: 'ai', label: 'AI 中心' },
  ],
  admin: [
    { icon: House, key: 'home', label: '首页' },
    { icon: UsersRound, key: 'users', label: '账号与班级' },
    { icon: SlidersHorizontal, key: 'permissions', label: '权限与规则' },
    { icon: History, key: 'audit', label: '操作审计' },
    { icon: Settings, key: 'settings', label: '系统设置' },
  ],
} as const satisfies Record<RoleCode, readonly NavigationItem[]>;

type RoleHomeScreenProps = {
  readonly activeNavigation?: RoleNavigationKey;
  readonly availableRoles?: readonly RoleCode[];
  readonly availableRoleScopes?: readonly AuthRoleScope[];
  readonly children?: ReactNode;
  readonly currentRole?: RoleCode;
  readonly onLogout?: () => Promise<void>;
  readonly onNavigate?: (key: RoleNavigationKey) => void;
  readonly onSwitchRole?: (role: RoleCode) => Promise<void>;
  readonly onSwitchRoleScope?: (roleAssignmentId: string) => Promise<void>;
  readonly role: RoleCode;
  readonly roleScope?: AuthRoleScope;
  readonly user?: AuthUser;
};

function BrandLockup({ compact = false }: { readonly compact?: boolean }) {
  return (
    <View style={styles.brandLockup}>
      <View style={styles.brandMark}>
        <DolphinCloudLogo size={compact ? 34 : 38} />
      </View>
      {compact ? null : (
        <View>
          <Text style={styles.brandName}>海豚云</Text>
          <Text style={styles.brandEnglish}>DolphinCloud</Text>
        </View>
      )}
    </View>
  );
}

function Navigation({
  activeNavigation,
  compact,
  onNavigate,
  role,
}: {
  readonly activeNavigation: RoleNavigationKey;
  readonly compact: boolean;
  readonly onNavigate: ((key: RoleNavigationKey) => void) | undefined;
  readonly role: RoleCode;
}) {
  const items = ROLE_NAVIGATION[role];
  const hasOverflow = compact && items.length > 5;
  const visibleItems = hasOverflow ? items.slice(0, 4) : items;
  const overflowItems = hasOverflow ? items.slice(4) : [];
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const isOverflowActive = overflowItems.some(
    (item) => item.key === activeNavigation,
  );

  const renderItem = (item: NavigationItem, isOverflowItem = false) => {
    const Icon = item.icon;
    const isActive = item.key === activeNavigation;
    return (
      <InteractivePressable
        accessibilityLabel={item.label}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        key={item.label}
        onPress={() => {
          setIsOverflowOpen(false);
          onNavigate?.(item.key);
        }}
        style={({ focused, hovered, pressed }) => [
          isOverflowItem
            ? styles.mobileOverflowItem
            : compact
              ? styles.mobileNavItem
              : styles.navItem,
          isActive && (compact ? styles.mobileNavItemActive : styles.navItemActive),
          hovered && styles.interactiveHover,
          focused && styles.interactiveFocus,
          pressed && styles.pressed,
        ]}
      >
        <Icon
          color={isActive ? theme.color.brand.primary : theme.color.text.secondary}
          size={isOverflowItem ? 19 : compact ? 22 : 20}
          strokeWidth={2}
        />
        <Text
          numberOfLines={1}
          style={[
            isOverflowItem
              ? styles.mobileOverflowItemLabel
              : compact
                ? styles.mobileNavLabel
                : styles.navLabel,
            isActive && styles.navLabelActive,
          ]}
        >
          {item.label}
        </Text>
      </InteractivePressable>
    );
  };

  return (
    <View style={compact ? styles.mobileNavigation : styles.navigation}>
      {isOverflowOpen ? (
        <View style={styles.mobileOverflowMenu}>
          <Text style={styles.mobileOverflowLabel}>更多功能</Text>
          {overflowItems.map((item) => (
            <View key={item.key} style={styles.mobileOverflowRow}>
              {renderItem(item, true)}
            </View>
          ))}
        </View>
      ) : null}
      {visibleItems.map((item) => renderItem(item))}
      {hasOverflow ? (
        <InteractivePressable
          accessibilityLabel="更多"
          accessibilityRole="button"
          accessibilityState={{ expanded: isOverflowOpen, selected: isOverflowActive }}
          onPress={() => setIsOverflowOpen((value) => !value)}
          style={({ focused, hovered, pressed }) => [
            styles.mobileNavItem,
            isOverflowActive && styles.mobileNavItemActive,
            hovered && styles.interactiveHover,
            focused && styles.interactiveFocus,
            pressed && styles.pressed,
          ]}
        >
          <Ellipsis
            color={
              isOverflowActive
                ? theme.color.brand.primary
                : theme.color.text.secondary
            }
            size={22}
          />
          <Text
            style={[
              styles.mobileNavLabel,
              isOverflowActive && styles.navLabelActive,
            ]}
          >
            更多
          </Text>
        </InteractivePressable>
      ) : null}
    </View>
  );
}

export function RoleHomeScreen({
  activeNavigation = 'home',
  availableRoles = [],
  availableRoleScopes = [],
  children,
  currentRole,
  onLogout,
  onNavigate,
  onSwitchRole,
  onSwitchRoleScope,
  role,
  roleScope,
  user,
}: RoleHomeScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const isCompactMobile = width < 480;
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<RoleCode | 'logout' | null>(null);
  const [pendingScopeId, setPendingScopeId] = useState<string | null>(null);
  const pageHeader = resolveRolePageHeader(role, activeNavigation);
  const currentRoleScopes = useMemo(
    () => availableRoleScopes.filter((scope) => scope.role === currentRole),
    [availableRoleScopes, currentRole],
  );
  const userInitial = useMemo(() => user?.displayName.slice(0, 1) ?? '海', [user]);
  const today = useMemo(() => {
    const date = new Date();
    return {
      date: `${date.getMonth() + 1}月${date.getDate()}日`,
      weekday: `星期${'日一二三四五六'[date.getDay()]}`,
    };
  }, []);

  const handleSwitchRole = async (nextRole: RoleCode) => {
    if (onSwitchRole === undefined || nextRole === currentRole) return;
    setPendingAction(nextRole);
    try {
      await onSwitchRole(nextRole);
      setIsAccountOpen(false);
    } finally {
      setPendingAction(null);
    }
  };

  const handleLogout = async () => {
    if (onLogout === undefined) return;
    setPendingAction('logout');
    try {
      await onLogout();
    } finally {
      setPendingAction(null);
    }
  };

  const handleSwitchRoleScope = async (roleAssignmentId: string) => {
    if (
      onSwitchRoleScope === undefined ||
      roleAssignmentId === roleScope?.assignmentId
    ) {
      return;
    }
    setPendingScopeId(roleAssignmentId);
    try {
      await onSwitchRoleScope(roleAssignmentId);
      setIsAccountOpen(false);
    } finally {
      setPendingScopeId(null);
    }
  };

  const accountMenu = isAccountOpen ? (
    <View style={[styles.accountMenu, !isWide && styles.accountMenuMobile]}>
      <Text style={styles.accountName}>{user?.displayName ?? '当前用户'}</Text>
      <Text style={styles.accountScope}>{roleScope?.label ?? ROLE_LABELS[role]}</Text>
      <View style={styles.menuDivider} />
      <Text style={styles.menuLabel}>切换角色</Text>
      <View style={styles.roleOptions}>
        {availableRoles.map((availableRole) => (
          <InteractivePressable
            accessibilityRole="button"
            accessibilityState={{ selected: availableRole === currentRole }}
            disabled={pendingAction !== null}
            key={availableRole}
            onPress={() => void handleSwitchRole(availableRole)}
            style={({ focused, hovered, pressed }) => [
              styles.roleOption,
              availableRole === currentRole && styles.roleOptionActive,
              hovered && styles.interactiveHover,
              focused && styles.interactiveFocus,
              pressed && styles.pressed,
            ]}
          >
            <RoleIcon role={availableRole} size={17} />
            <Text style={styles.roleOptionLabel}>
              {pendingAction === availableRole ? '切换中…' : ROLE_LABELS[availableRole]}
            </Text>
          </InteractivePressable>
        ))}
      </View>
      {currentRoleScopes.length <= 1 ? null : (
        <>
          <View style={styles.menuDivider} />
          <Text style={styles.menuLabel}>切换当前范围</Text>
          <View style={styles.roleOptions}>
            {currentRoleScopes.map((scope) => {
              const isCurrent = scope.assignmentId === roleScope?.assignmentId;
              return (
                <InteractivePressable
                  accessibilityLabel={`切换到${scope.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                  disabled={pendingAction !== null || pendingScopeId !== null}
                  key={scope.assignmentId}
                  onPress={() => void handleSwitchRoleScope(scope.assignmentId)}
                  style={({ focused, hovered, pressed }) => [
                    styles.roleOption,
                    isCurrent && styles.roleOptionActive,
                    hovered && styles.interactiveHover,
                    focused && styles.interactiveFocus,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.scopeOptionMarker} />
                  <Text numberOfLines={1} style={styles.roleOptionLabel}>
                    {pendingScopeId === scope.assignmentId ? '切换中…' : scope.label}
                  </Text>
                </InteractivePressable>
              );
            })}
          </View>
        </>
      )}
      <InteractivePressable
        accessibilityRole="button"
        disabled={pendingAction !== null || pendingScopeId !== null}
        onPress={() => void handleLogout()}
        style={({ focused, hovered, pressed }) => [
          styles.logoutButton,
          hovered && styles.interactiveHover,
          focused && styles.interactiveFocus,
          pressed && styles.pressed,
        ]}
      >
        <LogOut color={theme.color.text.secondary} size={17} />
        <Text style={styles.logoutLabel}>
          {pendingAction === 'logout' ? '退出中…' : '退出登录'}
        </Text>
      </InteractivePressable>
    </View>
  ) : null;

  const notificationMenu = isNotificationsOpen ? (
    <View style={[styles.notificationMenu, !isWide && styles.notificationMenuMobile]}>
      <View style={styles.notificationHeading}>
        <Text style={styles.accountName}>通知中心</Text>
        <Text style={styles.notificationCount}>0 条未读</Text>
      </View>
      <View style={styles.menuDivider} />
      <View style={styles.notificationEmpty}>
        <Bell color={theme.color.text.disabled} size={22} />
        <Text style={styles.notificationEmptyTitle}>当前没有新通知</Text>
        <Text style={styles.notificationEmptyText}>
          后续业务提醒只会显示在当前角色与权限范围内。
        </Text>
      </View>
    </View>
  ) : null;

  const topBar = (
    <View style={[styles.topBar, isCompactMobile && styles.topBarCompact]}>
      {!isWide ? <BrandLockup compact={isCompactMobile} /> : <View />}
      <View style={styles.topBarActions}>
        <InteractivePressable
          accessibilityLabel="通知"
          accessibilityRole="button"
          accessibilityState={{ expanded: isNotificationsOpen }}
          onPress={() => {
            setIsAccountOpen(false);
            setIsNotificationsOpen((value) => !value);
          }}
          style={({ focused, hovered, pressed }) => [
            styles.iconButton,
            hovered && styles.interactiveHover,
            focused && styles.interactiveFocus,
            pressed && styles.pressed,
          ]}
        >
          <Bell color={theme.color.text.primary} size={20} />
        </InteractivePressable>
        <InteractivePressable
          accessibilityLabel="账号与角色"
          accessibilityRole="button"
          accessibilityState={{ expanded: isAccountOpen }}
          onPress={() => {
            setIsNotificationsOpen(false);
            setIsAccountOpen((value) => !value);
          }}
          style={({ focused, hovered, pressed }) => [
            styles.accountButton,
            hovered && styles.interactiveHover,
            focused && styles.interactiveFocus,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.avatar}><Text style={styles.avatarText}>{userInitial}</Text></View>
          {isWide ? (
            <View style={styles.accountCopy}>
              <Text numberOfLines={1} style={styles.accountButtonName}>{user?.displayName ?? '当前用户'}</Text>
              <Text style={styles.accountButtonRole}>{ROLE_LABELS[role]}</Text>
            </View>
          ) : null}
          <ChevronDown color={theme.color.text.secondary} size={17} />
        </InteractivePressable>
      </View>
      {notificationMenu}
      {accountMenu}
    </View>
  );

  return (
    <View style={styles.shell}>
      {isWide ? (
        <View style={styles.sidebar}>
          <BrandLockup />
          <Navigation activeNavigation={activeNavigation} compact={false} onNavigate={onNavigate} role={role} />
          <View style={styles.sidebarFooter}>
            <View style={styles.scopeBadge}>
              <RoleIcon role={role} size={18} />
              <View style={styles.scopeCopy}>
                <Text style={styles.scopeRole}>{ROLE_LABELS[role]}</Text>
                <Text numberOfLines={1} style={styles.scopeLabel}>{roleScope?.label ?? '当前权限范围'}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.main}>
        {topBar}
        <ScrollView
          contentContainerStyle={[
            styles.page,
            isCompactMobile && styles.pageCompact,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content, isCompactMobile && styles.contentCompact]}>
            <View
              style={[
                styles.pageHeading,
                isCompactMobile && styles.pageHeadingCompact,
              ]}
            >
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>{pageHeader.eyebrow}</Text>
                <Text style={styles.pageTitle}>{pageHeader.title}</Text>
                <Text style={styles.pageDescription}>{pageHeader.description}</Text>
              </View>
              <View style={[styles.dateBadge, isCompactMobile && styles.dateBadgeCompact]}>
                <Text style={styles.datePrimary}>{today.date}</Text>
                <Text style={styles.dateSecondary}>{today.weekday}</Text>
              </View>
            </View>
            {children}
          </View>
        </ScrollView>
        {!isWide ? <Navigation activeNavigation={activeNavigation} compact onNavigate={onNavigate} role={role} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: theme.color.surface.page, flex: 1, flexDirection: 'row' },
  sidebar: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRightWidth: 1, padding: theme.space.lg, width: 244 },
  brandLockup: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  brandMark: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  brandName: { color: theme.color.text.primary, fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  brandEnglish: { color: theme.color.text.secondary, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, marginTop: 1 },
  navigation: { gap: theme.space.xs, marginTop: 42 },
  navItem: { alignItems: 'center', borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.base, minHeight: 46, paddingHorizontal: theme.space.base },
  navItemActive: { backgroundColor: theme.color.surface.primaryTint },
  navLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '600' },
  navLabelActive: { color: theme.color.brand.primary, fontWeight: '700' },
  interactiveFocus: { borderColor: theme.color.brand.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  interactiveHover: { backgroundColor: theme.color.surface.primaryTint },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
  sidebarFooter: { flex: 1, justifyContent: 'flex-end' },
  scopeBadge: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  scopeCopy: { flex: 1 },
  scopeRole: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  scopeLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  main: { flex: 1, minWidth: 0 },
  topBar: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 72, paddingHorizontal: theme.space.lg, position: 'relative', zIndex: 20 },
  topBarCompact: { minHeight: 64, paddingHorizontal: theme.space.md },
  topBarActions: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  iconButton: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, height: 42, justifyContent: 'center', position: 'relative', width: 42 },
  notificationMenu: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, elevation: 8, gap: theme.space.sm, padding: theme.space.md, position: 'absolute', right: 190, top: 62, width: 300, zIndex: 40 },
  notificationMenuMobile: { right: 72, top: 60, width: 260 },
  notificationHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  notificationCount: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  notificationEmpty: { alignItems: 'center', gap: theme.space.xs, paddingHorizontal: theme.space.sm, paddingVertical: theme.space.lg },
  notificationEmptyTitle: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '800' },
  notificationEmptyText: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, textAlign: 'center' },
  accountButton: { alignItems: 'center', borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, minHeight: 46, paddingHorizontal: theme.space.sm },
  avatar: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.pill, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '800' },
  accountCopy: { width: 100 },
  accountButtonName: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  accountButtonRole: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  accountMenu: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, elevation: 8, gap: theme.space.sm, padding: theme.space.md, position: 'absolute', right: theme.space.lg, top: 62, width: 280, zIndex: 40 },
  accountMenuMobile: { right: theme.space.md, top: 60, width: 260 },
  accountName: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '700' },
  accountScope: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  menuDivider: { backgroundColor: theme.color.border.default, height: 1, marginVertical: theme.space.xs },
  menuLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  roleOptions: { gap: theme.space.xs },
  roleOption: { alignItems: 'center', borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, minHeight: 38, paddingHorizontal: theme.space.sm },
  roleOptionActive: { backgroundColor: theme.color.surface.primaryTint },
  roleOptionLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '600' },
  scopeOptionMarker: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 7, width: 7 },
  logoutButton: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm, minHeight: 40, paddingHorizontal: theme.space.sm },
  logoutLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '600' },
  page: { alignItems: 'center', paddingBottom: 56, paddingHorizontal: theme.space.lg, paddingTop: theme.space.xl },
  pageCompact: { paddingBottom: 40, paddingHorizontal: theme.space.md, paddingTop: theme.space.lg },
  content: { gap: theme.space.lg, maxWidth: 1200, width: '100%' },
  contentCompact: { gap: theme.space.md },
  pageHeading: { alignItems: 'flex-end', flexDirection: 'row', gap: theme.space.md, justifyContent: 'space-between' },
  pageHeadingCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: theme.space.sm },
  headingCopy: { flex: 1 },
  eyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 1, marginBottom: theme.space.xs },
  pageTitle: { color: theme.color.text.primary, fontSize: theme.text.size.display, fontWeight: '800', letterSpacing: -0.5 },
  pageDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21, marginTop: theme.space.sm },
  dateBadge: { alignItems: 'flex-end' },
  dateBadgeCompact: { alignItems: 'flex-start' },
  datePrimary: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  dateSecondary: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  mobileNavigation: { backgroundColor: theme.color.surface.card, borderTopColor: theme.color.border.default, borderTopWidth: 1, flexDirection: 'row', paddingBottom: theme.space.sm, paddingHorizontal: theme.space.xs, paddingTop: theme.space.sm, position: 'relative', zIndex: 30 },
  mobileNavItem: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', minHeight: 50 },
  mobileNavItemActive: { backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control },
  mobileNavLabel: { color: theme.color.text.secondary, fontSize: 10, fontWeight: '600' },
  mobileNavLabelActive: { color: theme.color.brand.primary },
  mobileOverflowLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '800', paddingHorizontal: theme.space.base, paddingTop: theme.space.sm },
  mobileOverflowItem: { alignItems: 'center', borderRadius: theme.radius.control, flex: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 48, paddingHorizontal: theme.space.base },
  mobileOverflowItemLabel: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  mobileOverflowMenu: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, bottom: 70, elevation: 10, gap: theme.space.xs, padding: theme.space.xs, position: 'absolute', right: theme.space.sm, width: 190 },
  mobileOverflowRow: { minHeight: 52 },
});
