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
  FolderUp,
  ShieldCheck,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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

const ROLE_SERVICE_COPY = {
  admin: ['管理工作区', '账号、权限与审计继续沿用现有管理服务边界。'],
  bank_operator: ['校园银行工作区', '进入账户、罚款单或流水页面处理当前学校范围的真实数据。'],
  council: ['自治会工作区', '进入班级分或更正申请页面记录变动并处理申请。'],
} as const;

function ActionButton({
  action,
  onNavigate,
}: {
  readonly action: NavigateAction;
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
        hovered && styles.actionButtonHover,
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      <Icon color={theme.color.brand.primary} size={19} />
      <Text style={styles.actionLabel}>{action.label}</Text>
      <ArrowRight color={theme.color.text.disabled} size={16} />
    </InteractivePressable>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.metric}>
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
  const actions = useMemo<readonly NavigateAction[]>(() => {
    if (role === 'family') {
      return [
        { icon: ClipboardList, key: 'assignment', label: '查看作业' },
        { icon: ChartColumn, key: 'growth', label: '查看成长记录' },
        { icon: Bot, key: 'ai', label: '进入 AI 中心' },
      ];
    }
    return [
      { icon: FolderUp, key: 'courseware', label: role === 'teacher' ? '发送课件' : '查看课件' },
      { icon: ClipboardList, key: 'assignment', label: role === 'teacher' ? '发布作业' : '查看作业' },
      { icon: UserRoundCheck, key: 'class', label: role === 'teacher' ? '班级与成绩' : '班级表现' },
      { icon: Bot, key: 'ai', label: '进入 AI 中心' },
    ];
  }, [role]);

  const publishedAssignments = snapshot.assignments.filter(
    (item) => item.status === 'published',
  );
  const publishedGrades = snapshot.grades.filter((item) => item.status === 'published');

  return (
    <View style={styles.workspace}>
      <View style={styles.scopeBar}>
        <View style={styles.scopeIdentity}>
          <UserRoundCheck color={theme.color.brand.primary} size={19} />
          <View>
            <Text style={styles.scopeEyebrow}>当前权限范围</Text>
            <Text style={styles.scopeLabel}>{roleScope.label}</Text>
          </View>
        </View>
        <Text style={styles.scopeHint}>可在右上角账号菜单切换范围</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="可见班级" value={String(snapshot.classes.length)} />
        <Metric label="已发课件" value={String(snapshot.courseware.length)} />
        <Metric label="已发作业" value={String(publishedAssignments.length)} />
        <Metric
          label={role === 'family' ? '已发成绩' : '学生档案'}
          value={String(role === 'family' ? publishedGrades.length : snapshot.students.length)}
        />
      </View>

      <View style={styles.contentGrid}>
        <View style={styles.surface}>
          <Text style={styles.surfaceEyebrow}>快捷入口</Text>
          <Text style={styles.surfaceTitle}>选择今天要处理的工作</Text>
          <View style={styles.actionGrid}>
            {actions.map((action) => (
              <ActionButton action={action} key={action.key} onNavigate={onNavigate} />
            ))}
          </View>
        </View>

        <View style={styles.surface}>
          <Text style={styles.surfaceEyebrow}>实时教学数据</Text>
          <Text style={styles.surfaceTitle}>当前范围摘要</Text>
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
          <Text style={styles.boundaryNote}>
            治理数据在对应任务页面按当前权限范围读取；演示数据会明确标识。
          </Text>
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
  const [title, description] = ROLE_SERVICE_COPY[role];
  const actions: readonly NavigateAction[] =
    role === 'bank_operator'
      ? [
          { icon: Coins, key: 'accounts', label: '账户' },
          { icon: ClipboardList, key: 'fines', label: '罚款单' },
        ]
      : role === 'council'
        ? [
            { icon: ShieldCheck, key: 'class_score', label: '班级分' },
            { icon: ClipboardList, key: 'appeals', label: '更正申请' },
          ]
        : [
            { icon: UserRoundCheck, key: 'users', label: '账号与班级' },
            { icon: ShieldCheck, key: 'permissions', label: '权限与规则' },
          ];

  return (
    <View style={styles.workspace}>
      <View style={styles.scopeBar}>
        <View style={styles.scopeIdentity}>
          <UserRoundCheck color={theme.color.brand.primary} size={19} />
          <View>
            <Text style={styles.scopeEyebrow}>当前权限范围</Text>
            <Text style={styles.scopeLabel}>{roleScope.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.surface}>
        <Text style={styles.surfaceEyebrow}>服务边界</Text>
        <Text style={styles.surfaceTitle}>{title}</Text>
        <Text style={styles.emptyText}>{description}</Text>
        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <ActionButton action={action} key={action.key} onNavigate={onNavigate} />
          ))}
        </View>
        <Text style={styles.boundaryNote}>
          治理页面使用当前 AuthRoleScope；正式模式调用 Supabase RPC，演示模式会明确标识合成数据。
        </Text>
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
    return <Text style={styles.emptyText}>正在读取当前权限范围……</Text>;
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
  actionButton: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 52, paddingHorizontal: theme.space.base },
  actionButtonHover: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary, transform: [{ translateY: -1 }] },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.base },
  actionLabel: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700', minWidth: 110 },
  boundaryNote: { backgroundColor: theme.color.surface.secondaryTint, borderLeftColor: theme.color.brand.secondary, borderLeftWidth: 3, color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 19, marginTop: theme.space.base, padding: theme.space.base },
  contentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  dataMarker: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 8, width: 8 },
  dataPrimary: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  dataRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 52 },
  dataSecondary: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  emptyText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 22, marginTop: theme.space.sm },
  metric: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flex: 1, minWidth: 140, padding: theme.space.base },
  metricLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  metricValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '800' },
  focused: { borderColor: theme.color.brand.primary, shadowColor: theme.color.brand.primary, shadowOpacity: 0.2, shadowRadius: 4 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  retryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', marginTop: theme.space.base, minHeight: 42, paddingHorizontal: theme.space.lg },
  retryButtonHover: { opacity: 0.88 },
  retryLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  scopeBar: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, justifyContent: 'space-between', minHeight: 64, paddingHorizontal: theme.space.base, paddingVertical: 10 },
  scopeEyebrow: { color: theme.color.text.secondary, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  scopeHint: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  scopeIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  scopeLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '800', lineHeight: 20, marginTop: 2 },
  surface: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flex: 1, minWidth: 290, padding: theme.space.lg },
  surfaceEyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 0.8 },
  surfaceTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800', marginTop: theme.space.xs },
  workspace: { gap: theme.space.base },
});
