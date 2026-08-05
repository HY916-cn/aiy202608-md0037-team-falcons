import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';
import type { TeachingDemoSnapshot } from '@dolphincloud/experience';
import type { RoleNavigationKey } from '@dolphincloud/ui';
import { InteractivePressable, theme } from '@dolphincloud/ui';
import {
  ArrowRight,
  Bot,
  ChartColumn,
  ClipboardList,
  Coins,
  FileClock,
  FolderUp,
  History,
  Landmark,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useExperience } from './ExperienceProvider';

const EMPTY_SNAPSHOT: TeachingDemoSnapshot = {
  assignments: [],
  classes: [],
  courseware: [],
  grades: [],
  students: [],
};

type NavigateAction = {
  readonly icon: LucideIcon;
  readonly key: RoleNavigationKey;
  readonly label: string;
};

export function resolveDashboardLayout(width: number) {
  return { isNarrow: width < 640 } as const;
}

export function resolveDashboardActions(role: RoleCode): readonly NavigateAction[] {
  switch (role) {
    case 'teacher':
      return [
        { icon: FolderUp, key: 'courseware', label: '发送课件' },
        { icon: ClipboardList, key: 'assignment', label: '发布作业' },
        { icon: UserRoundCheck, key: 'class', label: '班级与成绩' },
        { icon: Coins, key: 'coins', label: '学生分与罚款' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    case 'class_terminal':
      return [
        { icon: FolderUp, key: 'courseware', label: '查看课件' },
        { icon: ClipboardList, key: 'assignment', label: '查看作业' },
        { icon: UserRoundCheck, key: 'class', label: '班级表现' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    case 'family':
      return [
        { icon: ClipboardList, key: 'assignment', label: '查看作业' },
        { icon: ChartColumn, key: 'growth', label: '查看成长记录' },
        { icon: Coins, key: 'coins', label: '查看海豚币' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    case 'bank_operator':
      return [
        { icon: Landmark, key: 'accounts', label: '账户' },
        { icon: ReceiptText, key: 'fines', label: '罚款单' },
        { icon: History, key: 'transactions', label: '账户流水' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    case 'council':
      return [
        { icon: ShieldCheck, key: 'class_score', label: '班级分' },
        { icon: FileClock, key: 'inspections', label: '检查记录' },
        { icon: ClipboardList, key: 'appeals', label: '更正申请' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    case 'admin':
      return [
        { icon: UserRoundCheck, key: 'users', label: '账号与班级' },
        { icon: ShieldCheck, key: 'permissions', label: '权限与规则' },
        { icon: History, key: 'audit', label: '操作审计' },
        { icon: Settings, key: 'settings', label: '系统设置' },
      ];
  }
}

const ROLE_SERVICE_COPY = {
  admin: ['管理工作区', '查看当前学校的账号、权限、审计与服务状态。'],
  bank_operator: ['校园银行工作区', '进入账户、罚款单或流水页面处理当前学校范围的真实数据。'],
  council: ['自治会工作区', '进入班级分或更正申请页面记录变动并处理申请。'],
} as const;

function ActionButton({
  action,
  isNarrow,
  onNavigate,
}: {
  readonly action: NavigateAction;
  readonly isNarrow: boolean;
  readonly onNavigate: (key: RoleNavigationKey) => void;
}) {
  const Icon = action.icon;
  return (
    <InteractivePressable
      accessibilityLabel={action.label}
      accessibilityRole="button"
      onPress={() => onNavigate(action.key)}
      style={({ focused, hovered, pressed }) => [
        styles.actionButton,
        isNarrow && styles.actionButtonNarrow,
        hovered && styles.actionButtonHover,
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      <Icon color={theme.color.brand.primary} size={19} />
      <Text style={styles.actionLabel}>{action.label}</Text>
      <ArrowRight color={theme.color.icon.disabled} size={16} />
    </InteractivePressable>
  );
}

function Metric({
  label,
  separated = false,
  stacked = false,
  value,
}: {
  readonly label: string;
  readonly separated?: boolean;
  readonly stacked?: boolean;
  readonly value: string;
}) {
  return (
    <View
      style={[
        styles.metric,
        separated && styles.metricSeparated,
        stacked && styles.metricStacked,
      ]}
    >
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TeachingWorkspace({
  onNavigate,
  role,
  roleScope,
  snapshot,
}: {
  readonly onNavigate: (key: RoleNavigationKey) => void;
  readonly role: 'teacher' | 'class_terminal' | 'family';
  readonly roleScope: AuthRoleScope;
  readonly snapshot: TeachingDemoSnapshot;
}) {
  const { width } = useWindowDimensions();
  const { isNarrow } = resolveDashboardLayout(width);
  const actions = resolveDashboardActions(role);

  const publishedAssignments = snapshot.assignments.filter(
    (item) => item.status === 'published',
  );
  const publishedGrades = snapshot.grades.filter((item) => item.status === 'published');

  return (
    <View style={styles.workspace}>
      <View style={[styles.scopeBar, isNarrow && styles.scopeBarNarrow]}>
        <View style={styles.scopeIdentity}>
          <UserRoundCheck color={theme.color.brand.primary} size={19} />
          <View style={styles.scopeCopy}>
            <Text style={styles.scopeEyebrow}>当前权限范围</Text>
            <Text style={styles.scopeLabel}>{roleScope.label}</Text>
          </View>
        </View>
        <Text style={styles.scopeHint}>账号菜单中可切换</Text>
      </View>

      <View style={[styles.metrics, isNarrow && styles.metricsNarrow]}>
        <Metric label="可见班级" value={String(snapshot.classes.length)} />
        <Metric label="已发课件" separated={!isNarrow} stacked={isNarrow} value={String(snapshot.courseware.length)} />
        <Metric
          label="已发作业"
          separated={!isNarrow}
          stacked={isNarrow}
          value={String(publishedAssignments.length)}
        />
        <Metric
          label={role === 'family' ? '已发成绩' : '学生档案'}
          separated
          stacked={isNarrow}
          value={String(role === 'family' ? publishedGrades.length : snapshot.students.length)}
        />
      </View>

      <View style={styles.contentGrid}>
        <View style={[styles.surface, isNarrow && styles.surfaceNarrow]}>
          <Text style={styles.surfaceTitle}>常用操作</Text>
          <Text style={styles.surfaceDescription}>继续处理当前班级的教学事务</Text>
          <View style={[styles.actionGrid, isNarrow && styles.actionGridNarrow]}>
            {actions.map((action) => (
              <ActionButton action={action} isNarrow={isNarrow} key={action.key} onNavigate={onNavigate} />
            ))}
          </View>
        </View>

        <View style={[styles.surface, isNarrow && styles.surfaceNarrow]}>
          <Text style={styles.surfaceTitle}>班级概况</Text>
          <Text style={styles.surfaceDescription}>当前权限范围内的最新数据</Text>
          {snapshot.classes.length === 0 ? (
            <Text style={styles.emptyText}>当前角色范围暂无教学数据。</Text>
          ) : (
            snapshot.classes.map((item) => (
              <View key={item.id} style={styles.dataRow}>
                <View style={styles.dataMarker} />
                <Text style={styles.dataPrimary}>{item.name}</Text>
                <Text style={styles.dataSecondary}>
                  {snapshot.students.filter((student) => student.classId === item.id).length}
                  {' 名学生'}
                </Text>
              </View>
            ))
          )}
          <Text style={styles.boundaryNote}>数据按当前权限范围实时读取</Text>
        </View>
      </View>
    </View>
  );
}

function ServiceWorkspace({
  onNavigate,
  role,
  roleScope,
}: {
  readonly onNavigate: (key: RoleNavigationKey) => void;
  readonly role: 'admin' | 'bank_operator' | 'council';
  readonly roleScope: AuthRoleScope;
}) {
  const { width } = useWindowDimensions();
  const { isNarrow } = resolveDashboardLayout(width);
  const [title, description] = ROLE_SERVICE_COPY[role];
  const actions = resolveDashboardActions(role);

  return (
    <View style={styles.workspace}>
      <View style={[styles.scopeBar, isNarrow && styles.scopeBarNarrow]}>
        <View style={styles.scopeIdentity}>
          <UserRoundCheck color={theme.color.brand.primary} size={19} />
          <View style={styles.scopeCopy}>
            <Text style={styles.scopeEyebrow}>当前权限范围</Text>
            <Text style={styles.scopeLabel}>{roleScope.label}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.surface, isNarrow && styles.surfaceNarrow]}>
        <Text style={styles.surfaceTitle}>{title}</Text>
        <Text style={styles.emptyText}>{description}</Text>
        <View style={[styles.actionGrid, isNarrow && styles.actionGridNarrow]}>
          {actions.map((action) => (
            <ActionButton action={action} isNarrow={isNarrow} key={action.key} onNavigate={onNavigate} />
          ))}
        </View>
        <Text style={styles.boundaryNote}>所有操作均按当前权限范围校验并记录</Text>
      </View>
    </View>
  );
}

export function RoleDashboardOverview({
  onNavigate,
  role,
  roleScope,
}: {
  readonly onNavigate: (key: RoleNavigationKey) => void;
  readonly role: RoleCode;
  readonly roleScope: AuthRoleScope;
}) {
  const { teachingAdapter } = useExperience();
  const [snapshot, setSnapshot] = useState<TeachingDemoSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    setSnapshot(EMPTY_SNAPSHOT);
    try {
      setSnapshot(await teachingAdapter.load(roleScope));
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [roleScope, teachingAdapter]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (isLoading) {
    return (
      <View style={styles.surface}>
        <Text style={styles.surfaceTitle}>正在加载工作台</Text>
        <Text style={styles.emptyText}>正在读取当前权限范围……</Text>
      </View>
    );
  }
  if (loadFailed) {
    return (
      <View style={styles.surface}>
        <Text style={styles.surfaceTitle}>数据加载失败</Text>
        <InteractivePressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={({ focused, hovered, pressed }) => [
            styles.retryButton,
            hovered && styles.retryButtonHover,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.retryLabel}>重试</Text>
        </InteractivePressable>
      </View>
    );
  }

  if (role === 'teacher' || role === 'class_terminal' || role === 'family') {
    return (
      <TeachingWorkspace
        onNavigate={onNavigate}
        role={role}
        roleScope={roleScope}
        snapshot={snapshot}
      />
    );
  }

  return (
    <ServiceWorkspace
      onNavigate={onNavigate}
      role={role}
      roleScope={roleScope}
    />
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, minHeight: 48, paddingHorizontal: theme.space.base },
  actionButtonNarrow: { minWidth: 0, width: '100%' },
  actionButtonHover: { backgroundColor: theme.color.surface.subtleHover },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.base },
  actionGridNarrow: { flexDirection: 'column' },
  actionLabel: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700', minWidth: 110 },
  boundaryNote: { color: theme.color.text.disabled, fontSize: 11, lineHeight: 18, marginTop: theme.space.base },
  contentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  dataMarker: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 8, width: 8 },
  dataPrimary: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  dataRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 52 },
  dataSecondary: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  emptyText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 22, marginTop: theme.space.sm },
  metric: { flex: 1, minWidth: 140, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md },
  metricSeparated: { borderLeftColor: theme.color.border.default, borderLeftWidth: 1 },
  metricStacked: { borderTopColor: theme.color.border.default, borderTopWidth: 1 },
  metricLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 4 },
  metrics: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  metricsNarrow: { flexDirection: 'column' },
  metricValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '600' },
  focused: { boxShadow: theme.shadow.focus },
  pressed: { opacity: 0.82 },
  retryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', marginTop: theme.space.base, minHeight: 40, paddingHorizontal: theme.space.lg },
  retryButtonHover: { backgroundColor: theme.color.brand.hover },
  retryLabel: { color: theme.color.text.onAccent, fontSize: theme.text.size.sm, fontWeight: '700' },
  scopeBar: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, justifyContent: 'space-between', minHeight: 52, paddingBottom: theme.space.base },
  scopeBarNarrow: { alignItems: 'flex-start', flexDirection: 'column' },
  scopeCopy: { flex: 1, minWidth: 0 },
  scopeEyebrow: { color: theme.color.text.secondary, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  scopeHint: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  scopeIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  scopeLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '600', lineHeight: 20, marginTop: 2 },
  surface: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flex: 1, minWidth: 290, padding: theme.space.lg },
  surfaceNarrow: { minWidth: 0, padding: theme.space.md, width: '100%' },
  surfaceDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, marginTop: 4 },
  surfaceTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '700' },
  workspace: { gap: theme.space.md },
});
