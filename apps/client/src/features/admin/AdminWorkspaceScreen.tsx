import { ROLE_LABELS, type AuthRoleScope, type RoleCode } from '@dolphincloud/auth';
import type { RoleNavigationKey } from '@dolphincloud/ui';
import {
  InsightStrip,
  InteractivePressable,
  WorkspaceBoundaryNotice,
  WorkspaceStatusTag,
  WorkspaceSurface,
  WorkspaceToolbar,
  theme,
} from '@dolphincloud/ui';
import { RefreshCw, ShieldCheck, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSupabaseServices } from '@/features/supabase';

import {
  ADMIN_PERMISSION_MATRIX,
  buildCsv,
  resolveAdminWorkspaceLayout,
  selectAdminAuditEvents,
  selectAdminUsers,
  type AdminAuditResultFilter,
  type AdminAuditSort,
  type AdminUserSort,
  type AdminUserStatusFilter,
} from './adminWorkspacePresentation';
import {
  OfflineAdminWorkspaceService,
  SupabaseAdminWorkspaceService,
  type AdminAuditResult,
  type AdminAuditRow,
  type AdminServiceState,
  type AdminUserRow,
  type AdminWorkspaceService,
  type AdminWorkspaceSnapshot,
} from './adminWorkspaceService';

const USER_FILTERS = [
  { label: '全部', value: 'all' },
  { label: '生效中', value: 'active' },
  { label: '已停用', value: 'disabled' },
] as const;

const USER_SORTS = [
  { label: '按名称', value: 'name_asc' },
  { label: '最新创建', value: 'newest' },
] as const;

const AUDIT_FILTERS = [
  { label: '全部', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '已拒绝', value: 'denied' },
  { label: '失败', value: 'failed' },
] as const;

const AUDIT_SORTS = [
  { label: '最新发生', value: 'newest' },
  { label: '最早发生', value: 'oldest' },
  { label: '按操作', value: 'action_asc' },
] as const;

const AUDIT_RESULT_LABELS = {
  denied: '已拒绝',
  failed: '失败',
  success: '成功',
} as const satisfies Record<AdminAuditResult, string>;

const SERVICE_STATE_LABELS = {
  available: '可用',
  degraded: '部分可用',
  offline: '离线',
} as const satisfies Record<AdminServiceState, string>;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });
}

function roleScopeSummary(user: AdminUserRow): string {
  if (user.roleScopes.length === 0) return '未加载角色范围';
  return user.roleScopes
    .map((scope) => `${ROLE_LABELS[scope.role]} · ${scope.label}`)
    .join('；');
}

function serviceTone(
  state: AdminServiceState,
): 'muted' | 'primary' | 'secondary' {
  if (state === 'available') return 'primary';
  if (state === 'degraded') return 'secondary';
  return 'muted';
}

async function exportCsv(filename: string, content: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: content, title: filename });
}

function EmptyResult({ children }: { readonly children: string }) {
  return (
    <View style={styles.emptyResult}>
      <Text style={styles.emptyTitle}>暂无可显示记录</Text>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

function UserRows({
  isCompact,
  users,
}: {
  readonly isCompact: boolean;
  readonly users: readonly AdminUserRow[];
}) {
  if (users.length === 0) {
    return <EmptyResult>当前搜索或状态筛选下没有已加载账号。</EmptyResult>;
  }
  if (isCompact) {
    return (
      <View style={styles.compactList}>
        {users.map((user) => (
          <View key={user.id} style={styles.compactRow}>
            <View style={styles.rowHeading}>
              <Text style={styles.rowPrimary}>{user.displayName}</Text>
              <WorkspaceStatusTag
                label={user.status === 'active' ? '生效中' : '已停用'}
                tone={user.status === 'active' ? 'primary' : 'muted'}
              />
            </View>
            <Text selectable style={styles.rowTechnical}>{user.id}</Text>
            <Text style={styles.rowSecondary}>{roleScopeSummary(user)}</Text>
            <Text style={styles.rowMeta}>创建于 {formatDateTime(user.createdAt)}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.headerCell, styles.userCell]}>账号</Text>
        <Text style={[styles.headerCell, styles.scopeCell]}>角色与范围</Text>
        <Text style={[styles.headerCell, styles.statusCell]}>状态</Text>
        <Text style={[styles.headerCell, styles.timeCell]}>创建时间</Text>
      </View>
      {users.map((user) => (
        <View key={user.id} style={styles.tableRow}>
          <View style={styles.userCell}>
            <Text style={styles.rowPrimary}>{user.displayName}</Text>
            <Text selectable style={styles.rowTechnical}>{user.id}</Text>
          </View>
          <Text style={[styles.rowSecondary, styles.scopeCell]}>
            {roleScopeSummary(user)}
          </Text>
          <View style={styles.statusCell}>
            <WorkspaceStatusTag
              label={user.status === 'active' ? '生效中' : '已停用'}
              tone={user.status === 'active' ? 'primary' : 'muted'}
            />
          </View>
          <Text style={[styles.rowMeta, styles.timeCell]}>
            {formatDateTime(user.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AuditRows({
  events,
  isCompact,
}: {
  readonly events: readonly AdminAuditRow[];
  readonly isCompact: boolean;
}) {
  if (events.length === 0) {
    return <EmptyResult>当前搜索或结果筛选下没有已加载审计事件。</EmptyResult>;
  }
  if (isCompact) {
    return (
      <View style={styles.compactList}>
        {events.map((event) => (
          <View key={event.id} style={styles.compactRow}>
            <View style={styles.rowHeading}>
              <Text style={styles.rowPrimary}>{event.action}</Text>
              <WorkspaceStatusTag
                label={AUDIT_RESULT_LABELS[event.result]}
                tone={event.result === 'success' ? 'primary' : 'muted'}
              />
            </View>
            <Text style={styles.rowSecondary}>
              {event.actorName} · {ROLE_LABELS[event.actorRole]}
            </Text>
            <Text selectable style={styles.rowTechnical}>
              {event.targetType} · {event.targetId}
            </Text>
            <Text style={styles.rowMeta}>{formatDateTime(event.createdAt)}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.headerCell, styles.actionCell]}>操作</Text>
        <Text style={[styles.headerCell, styles.actorCell]}>操作人</Text>
        <Text style={[styles.headerCell, styles.targetCell]}>目标</Text>
        <Text style={[styles.headerCell, styles.statusCell]}>结果</Text>
        <Text style={[styles.headerCell, styles.timeCell]}>时间</Text>
      </View>
      {events.map((event) => (
        <View key={event.id} style={styles.tableRow}>
          <Text style={[styles.rowPrimary, styles.actionCell]}>{event.action}</Text>
          <View style={styles.actorCell}>
            <Text style={styles.rowSecondary}>{event.actorName}</Text>
            <Text style={styles.rowMeta}>{ROLE_LABELS[event.actorRole]}</Text>
          </View>
          <View style={styles.targetCell}>
            <Text style={styles.rowSecondary}>{event.targetType}</Text>
            <Text selectable style={styles.rowTechnical}>{event.targetId}</Text>
          </View>
          <View style={styles.statusCell}>
            <WorkspaceStatusTag
              label={AUDIT_RESULT_LABELS[event.result]}
              tone={event.result === 'success' ? 'primary' : 'muted'}
            />
          </View>
          <Text style={[styles.rowMeta, styles.timeCell]}>
            {formatDateTime(event.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ServiceRows({ snapshot }: { readonly snapshot: AdminWorkspaceSnapshot }) {
  return (
    <View style={styles.serviceList}>
      {snapshot.services.map((service) => (
        <View key={service.id} style={styles.serviceRow}>
          <View style={styles.serviceIdentity}>
            {service.state === 'offline' ? (
              <WifiOff color={theme.color.text.secondary} size={19} />
            ) : (
              <ShieldCheck color={theme.color.brand.primary} size={19} />
            )}
            <View style={styles.serviceCopy}>
              <Text style={styles.rowPrimary}>{service.label}</Text>
              <Text style={styles.rowSecondary}>{service.detail}</Text>
            </View>
          </View>
          <View style={styles.serviceMeta}>
            <WorkspaceStatusTag
              label={SERVICE_STATE_LABELS[service.state]}
              tone={serviceTone(service.state)}
            />
            <Text style={styles.rowMeta}>{formatDateTime(service.checkedAt)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PermissionMatrix({
  isCompact,
  users,
}: {
  readonly isCompact: boolean;
  readonly users: readonly AdminUserRow[];
}) {
  const assignedCounts = new Map<RoleCode, number>();
  for (const user of users) {
    for (const scope of user.roleScopes) {
      assignedCounts.set(scope.role, (assignedCounts.get(scope.role) ?? 0) + 1);
    }
  }
  if (isCompact) {
    return (
      <View style={styles.compactList}>
        {ADMIN_PERMISSION_MATRIX.map((row) => (
          <View key={row.role} style={styles.compactRow}>
            <View style={styles.rowHeading}>
              <Text style={styles.rowPrimary}>{ROLE_LABELS[row.role]}</Text>
              <Text style={styles.rowMeta}>
                已加载 {assignedCounts.get(row.role) ?? 0} 个范围
              </Text>
            </View>
            <Text style={styles.rowSecondary}>账号与班级：{row.identity}</Text>
            <Text style={styles.rowSecondary}>教学：{row.teaching} · 学生分：{row.studentScore}</Text>
            <Text style={styles.rowSecondary}>班级分：{row.classScore} · 海豚币：{row.dolphinCoin}</Text>
            <Text style={styles.rowSecondary}>操作审计：{row.audit}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        {['角色', '账号与班级', '教学', '学生分', '班级分', '海豚币', '操作审计'].map(
          (label) => (
            <Text key={label} style={[styles.headerCell, styles.permissionCell]}>
              {label}
            </Text>
          ),
        )}
      </View>
      {ADMIN_PERMISSION_MATRIX.map((row) => (
        <View key={row.role} style={styles.tableRow}>
          <View style={styles.permissionCell}>
            <Text style={styles.rowPrimary}>{ROLE_LABELS[row.role]}</Text>
            <Text style={styles.rowMeta}>
              {assignedCounts.get(row.role) ?? 0} 个范围
            </Text>
          </View>
          {[row.identity, row.teaching, row.studentScore, row.classScore, row.dolphinCoin, row.audit].map(
            (level, index) => (
              <Text key={`${row.role}-${index}`} style={[styles.rowSecondary, styles.permissionCell]}>
                {level}
              </Text>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

export function AdminWorkspaceScreen({
  activeNavigation,
  roleScope,
}: {
  readonly activeNavigation: RoleNavigationKey;
  readonly roleScope: AuthRoleScope;
}) {
  const { client } = useSupabaseServices();
  const { width } = useWindowDimensions();
  const isCompact = resolveAdminWorkspaceLayout(width) === 'compact';
  const service = useMemo<AdminWorkspaceService>(
    () =>
      client === null
        ? new OfflineAdminWorkspaceService()
        : new SupabaseAdminWorkspaceService(client),
    [client],
  );
  const [snapshot, setSnapshot] = useState<AdminWorkspaceSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userFilter, setUserFilter] = useState<AdminUserStatusFilter>('all');
  const [userSort, setUserSort] = useState<AdminUserSort>('name_asc');
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState<AdminAuditResultFilter>('all');
  const [auditSort, setAuditSort] = useState<AdminAuditSort>('newest');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setExportFeedback(null);
    try {
      setSnapshot(await service.load(roleScope));
    } catch {
      setSnapshot(null);
      setLoadError('管理工作台读取失败。请确认当前账号仍具有学校管理端范围。');
    } finally {
      setIsLoading(false);
    }
  }, [roleScope, service]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const selectedUsers = useMemo(
    () => selectAdminUsers(snapshot?.users ?? [], userQuery, userFilter, userSort),
    [snapshot, userFilter, userQuery, userSort],
  );
  const selectedAuditEvents = useMemo(
    () =>
      selectAdminAuditEvents(
        snapshot?.auditEvents ?? [],
        auditQuery,
        auditFilter,
        auditSort,
      ),
    [auditFilter, auditQuery, auditSort, snapshot],
  );

  if (isLoading) {
    return (
      <WorkspaceSurface title="正在读取管理数据">
        <Text style={styles.emptyText}>正在通过当前管理端权限范围验证真实服务……</Text>
      </WorkspaceSurface>
    );
  }

  if (loadError !== null || snapshot === null) {
    return (
      <WorkspaceSurface title="管理工作台不可用">
        <Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text>
        <InteractivePressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={({ focused, hovered, pressed }) => [
            styles.retryButton,
            hovered && styles.retryHovered,
            focused && styles.focused,
            pressed && styles.pressed,
          ]}
        >
          <RefreshCw color={theme.color.surface.card} size={17} />
          <Text style={styles.retryLabel}>重新验证并读取</Text>
        </InteractivePressable>
      </WorkspaceSurface>
    );
  }

  const roleScopeCount = snapshot.users.reduce(
    (count, user) => count + user.roleScopes.length,
    0,
  );
  const availableServiceCount = snapshot.services.filter(
    (serviceStatus) => serviceStatus.state === 'available',
  ).length;
  const sourceNotice =
    snapshot.source === 'supabase'
      ? `来源：Supabase + RLS；读取时间 ${formatDateTime(snapshot.loadedAt)}。列表工具只处理本次成功加载的数据。`
      : '当前未配置学校服务。账号、范围和审计信息暂不可用，请联系系统管理员。';

  if (activeNavigation === 'users') {
    const handleExport = async () => {
      const csv = buildCsv(selectedUsers, [
        { header: '账号名称', value: (user) => user.displayName },
        { header: '账号 ID', value: (user) => user.id },
        { header: '状态', value: (user) => (user.status === 'active' ? '生效中' : '已停用') },
        { header: '角色与范围', value: roleScopeSummary },
        { header: '创建时间 UTC', value: (user) => user.createdAt },
      ]);
      await exportCsv('dolphincloud-admin-users.csv', csv);
      setExportFeedback(`已导出当前 ${selectedUsers.length} 条账号记录。`);
    };
    return (
      <WorkspaceSurface
        description="只读查看当前学校范围内由 RLS 返回的账号、角色分配与范围关系。"
        eyebrow="真实已加载数据"
        title="账号与角色范围"
      >
        <WorkspaceBoundaryNotice label="真实适配器边界">{sourceNotice}</WorkspaceBoundaryNotice>
        <WorkspaceToolbar
          exportDisabled={selectedUsers.length === 0}
          filter={userFilter}
          filterOptions={USER_FILTERS}
          onExport={() => void handleExport()}
          onFilterChange={setUserFilter}
          onQueryChange={setUserQuery}
          onSortChange={setUserSort}
          query={userQuery}
          resultCount={selectedUsers.length}
          searchPlaceholder="搜索名称、账号 ID、角色或范围"
          sort={userSort}
          sortOptions={USER_SORTS}
        />
        {exportFeedback === null ? null : (
          <Text accessibilityRole="alert" style={styles.feedback}>{exportFeedback}</Text>
        )}
        <UserRows isCompact={isCompact} users={selectedUsers} />
      </WorkspaceSurface>
    );
  }

  if (activeNavigation === 'permissions') {
    return (
      <WorkspaceSurface
        description="矩阵用于核对产品级权限边界；服务端 JWT、RLS 与 RPC 仍是最终授权依据。"
        eyebrow="只读策略基线"
        title="权限矩阵"
      >
        <WorkspaceBoundaryNotice label="权限来源说明">
          权限等级为产品权限基线；“已加载范围”来自当前服务读取。本页面只读展示，不修改服务端权限。
        </WorkspaceBoundaryNotice>
        <PermissionMatrix isCompact={isCompact} users={snapshot.users} />
      </WorkspaceSurface>
    );
  }

  if (activeNavigation === 'audit') {
    const handleExport = async () => {
      const csv = buildCsv(selectedAuditEvents, [
        { header: '操作', value: (event) => event.action },
        { header: '操作人', value: (event) => event.actorName },
        { header: '操作人角色', value: (event) => ROLE_LABELS[event.actorRole] },
        { header: '目标类型', value: (event) => event.targetType },
        { header: '目标 ID', value: (event) => event.targetId },
        { header: '结果', value: (event) => AUDIT_RESULT_LABELS[event.result] },
        { header: '发生时间 UTC', value: (event) => event.createdAt },
      ]);
      await exportCsv('dolphincloud-admin-audit.csv', csv);
      setExportFeedback(`已导出当前 ${selectedAuditEvents.length} 条审计事件。`);
    };
    return (
      <WorkspaceSurface
        description="按操作、操作人、目标与结果检索最近成功加载的审计事件。"
        eyebrow="不可变审计读取"
        title="操作审计"
      >
        <WorkspaceBoundaryNotice label="读取与导出范围">{sourceNotice}</WorkspaceBoundaryNotice>
        <WorkspaceToolbar
          exportDisabled={selectedAuditEvents.length === 0}
          filter={auditFilter}
          filterOptions={AUDIT_FILTERS}
          onExport={() => void handleExport()}
          onFilterChange={setAuditFilter}
          onQueryChange={setAuditQuery}
          onSortChange={setAuditSort}
          query={auditQuery}
          resultCount={selectedAuditEvents.length}
          searchPlaceholder="搜索操作、操作人、角色或目标"
          sort={auditSort}
          sortOptions={AUDIT_SORTS}
        />
        {exportFeedback === null ? null : (
          <Text accessibilityRole="alert" style={styles.feedback}>{exportFeedback}</Text>
        )}
        <AuditRows events={selectedAuditEvents} isCompact={isCompact} />
      </WorkspaceSurface>
    );
  }

  if (activeNavigation === 'settings') {
    return (
      <WorkspaceSurface
        description="本页只显示最近一次真实探测结果；配置写服务接入前不提供无效保存按钮。"
        eyebrow="只读运行检查"
        title="系统状态"
      >
        <WorkspaceBoundaryNotice label="系统设置边界">{sourceNotice}</WorkspaceBoundaryNotice>
        <ServiceRows snapshot={snapshot} />
      </WorkspaceSurface>
    );
  }

  return (
    <View style={styles.workspace}>
      <InsightStrip
        items={[
          { label: '已加载账号', value: String(snapshot.users.length) },
          { label: '角色范围', value: String(roleScopeCount) },
          { label: '审计事件', value: String(snapshot.auditEvents.length) },
          { label: '可用服务', value: `${availableServiceCount}/${snapshot.services.length}` },
        ]}
      />
      <WorkspaceSurface
        description="聚合账号范围、权限基线、审计事件与服务状态，不在首页提供越权快捷写操作。"
        eyebrow="当前学校范围"
        title="管理概况"
      >
        <WorkspaceBoundaryNotice label="数据可信度">{sourceNotice}</WorkspaceBoundaryNotice>
        <ServiceRows snapshot={snapshot} />
        <View style={styles.sectionDivider} />
        <Text style={styles.subsectionTitle}>最近审计事件</Text>
        <AuditRows events={snapshot.auditEvents.slice(0, 5)} isCompact={isCompact} />
      </WorkspaceSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  actionCell: { flex: 1.15 },
  actorCell: { flex: 1 },
  compactList: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, overflow: 'hidden' },
  compactRow: { borderBottomColor: theme.color.border.default, borderBottomWidth: 1, gap: theme.space.xs, paddingHorizontal: theme.space.base, paddingVertical: theme.space.md },
  emptyResult: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderStyle: 'dashed', borderWidth: 1, paddingHorizontal: theme.space.md, paddingVertical: theme.space.xl },
  emptyText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21, textAlign: 'center' },
  emptyTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800', marginBottom: theme.space.xs },
  errorText: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700', lineHeight: 21 },
  feedback: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  focused: { borderColor: theme.color.brand.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  headerCell: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '800' },
  permissionCell: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  retryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, minHeight: 44, paddingHorizontal: theme.space.md },
  retryHovered: { opacity: 0.88 },
  retryLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  rowHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'space-between' },
  rowMeta: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, lineHeight: 18 },
  rowPrimary: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '800', lineHeight: 20 },
  rowSecondary: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  rowTechnical: { color: theme.color.text.disabled, fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }), fontSize: 10, lineHeight: 16 },
  scopeCell: { flex: 1.8 },
  sectionDivider: { backgroundColor: theme.color.border.default, height: 1 },
  serviceCopy: { flex: 1, gap: 2 },
  serviceIdentity: { alignItems: 'flex-start', flex: 1, flexDirection: 'row', gap: theme.space.sm },
  serviceList: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, overflow: 'hidden' },
  serviceMeta: { alignItems: 'flex-end', gap: theme.space.xs },
  serviceRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, justifyContent: 'space-between', minHeight: 72, paddingHorizontal: theme.space.base, paddingVertical: theme.space.sm },
  statusCell: { flex: 0.72 },
  subsectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  table: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, overflow: 'hidden' },
  tableHeader: { backgroundColor: theme.color.surface.muted, minHeight: 42 },
  tableRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.base, minHeight: 62, paddingHorizontal: theme.space.base, paddingVertical: theme.space.sm },
  targetCell: { flex: 1.25 },
  timeCell: { flex: 0.9 },
  userCell: { flex: 1.15 },
  workspace: { gap: theme.space.base },
});
