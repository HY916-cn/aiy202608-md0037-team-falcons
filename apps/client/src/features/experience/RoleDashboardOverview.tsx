import type { RoleCode } from '@dolphincloud/auth';
import { ROLE_LABELS } from '@dolphincloud/auth';
import {
  ArrowRight,
  ChartColumn,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileClock,
  FolderUp,
  History,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { theme } from '@dolphincloud/ui';

type Metric = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly note: string;
  readonly value: string;
};

type QuickAction = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly note: string;
};

type Activity = {
  readonly detail: string;
  readonly label: string;
  readonly time: string;
};

type DashboardContent = {
  readonly activities: readonly Activity[];
  readonly actions: readonly QuickAction[];
  readonly metrics: readonly Metric[];
  readonly notice: string;
};

const DASHBOARD_CONTENT = {
  teacher: {
    notice: '七年级（2）班 · 今日 4 节课',
    metrics: [
      { icon: UsersRound, label: '班级学生', note: '出勤 41 / 42', value: '42 人' },
      { icon: Star, label: '今日学生分', note: '18 条评价记录', value: '+26 分' },
      { icon: ClipboardList, label: '待批作业', note: '数学练习册', value: '12 份' },
      { icon: ChartColumn, label: '成绩草稿', note: '发布前需复核', value: '2 项' },
    ],
    actions: [
      { icon: Star, label: '课堂点评', note: '快速加减学生分' },
      { icon: FolderUp, label: '发送课件', note: '传到班级设备' },
      { icon: ClipboardList, label: '发布作业', note: '通知绑定家庭' },
      { icon: ReceiptText, label: '发起罚款', note: '由银行端处理' },
    ],
    activities: [
      { label: '数学课件已发送', detail: '《一次函数复习》 · 七年级（2）班', time: '10:24' },
      { label: '学生分记录已确认', detail: '林小海 · 积极发言 · +2 分', time: '09:48' },
      { label: '作业已发布', detail: '练习册第 18 页 · 明天 18:00 截止', time: '08:35' },
    ],
  },
  class_terminal: {
    notice: '七年级（2）班 · 公共设备模式',
    metrics: [
      { icon: UsersRound, label: '今日出勤', note: '1 人请假', value: '41 人' },
      { icon: Star, label: '今日学生分', note: '全班累计变化', value: '+26 分' },
      { icon: ShieldCheck, label: '本周班级分', note: '年级第 2 名', value: '86 分' },
      { icon: ClipboardList, label: '待完成作业', note: '最近截止', value: '3 项' },
    ],
    actions: [
      { icon: Star, label: '班级表现', note: '授权后记录学生分' },
      { icon: FolderUp, label: '课堂课件', note: '查看教师发送内容' },
      { icon: ClipboardList, label: '今日作业', note: '按截止时间查看' },
      { icon: Trophy, label: '班内排行', note: '仅显示学生分' },
    ],
    activities: [
      { label: '新课件', detail: '数学 · 《一次函数复习》', time: '10:24' },
      { label: '班级分更新', detail: '早读秩序 · +3 分', time: '08:12' },
      { label: '作业提醒', detail: '英语听写 · 今天 20:00 截止', time: '07:50' },
    ],
  },
  family: {
    notice: '林小海 · 七年级（2）班',
    metrics: [
      { icon: Star, label: '本周学生分', note: '较上周 +4 分', value: '18 分' },
      { icon: Trophy, label: '本人名次', note: '超过班级 76% 同学', value: '第 8 名' },
      { icon: ClipboardList, label: '待完成作业', note: '1 项今天截止', value: '3 项' },
      { icon: Coins, label: '海豚币余额', note: '本周 +6 枚', value: '28 枚' },
    ],
    actions: [
      { icon: ClipboardList, label: '查看作业', note: '按截止时间排序' },
      { icon: ChartColumn, label: '成长记录', note: '学生分与成绩' },
      { icon: Coins, label: '海豚币账户', note: '余额与账户流水' },
      { icon: Sparkles, label: '今日表现', note: '查看教师评价' },
    ],
    activities: [
      { label: '获得学生分', detail: '积极发言 · 数学 · +2 分', time: '09:48' },
      { label: '新作业', detail: '数学练习册第 18 页', time: '08:35' },
      { label: '成绩已发布', detail: '英语周测 · 92 分', time: '昨天' },
    ],
  },
  bank_operator: {
    notice: '海豚云演示学校 · 营业工作台',
    metrics: [
      { icon: ReceiptText, label: '待处理罚款单', note: '最早等待 18 分钟', value: '6 笔' },
      { icon: Landmark, label: '有效账户', note: '今日新增 3 个', value: '486 个' },
      { icon: Coins, label: '今日海豚币变化', note: '收入与支出合计', value: '214 枚' },
      { icon: FileClock, label: '待复核操作', note: '含 1 笔撤销', value: '2 笔' },
    ],
    actions: [
      { icon: ReceiptText, label: '处理罚款单', note: '确认或拒绝请求' },
      { icon: Landmark, label: '查询账户', note: '按学生或班级筛选' },
      { icon: Coins, label: '调整海豚币', note: '生成确认预览' },
      { icon: History, label: '账户流水', note: '查看与指定撤销' },
    ],
    activities: [
      { label: '罚款单待处理', detail: '林小海 · 2 枚海豚币', time: '10:18' },
      { label: '账户流水已入账', detail: '校园志愿服务 · +5 枚', time: '09:42' },
      { label: '撤销已完成', detail: '原操作保留，已新增反向记录', time: '08:55' },
    ],
  },
  council: {
    notice: '七年级自治会 · 本周检查周期',
    metrics: [
      { icon: ShieldCheck, label: '本周检查', note: '覆盖 8 个班级', value: '24 次' },
      { icon: Trophy, label: '年级领先班级', note: '七年级（1）班', value: '92 分' },
      { icon: ClipboardList, label: '待处理更正申请', note: '最早提交于昨天', value: '3 项' },
      { icon: UserRoundCheck, label: '今日值班成员', note: '2 个检查小组', value: '8 人' },
    ],
    actions: [
      { icon: ShieldCheck, label: '记录班级分', note: '选择班级和检查项' },
      { icon: Trophy, label: '班级排行', note: '按周或月查看' },
      { icon: FileClock, label: '检查记录', note: '筛选操作与时间' },
      { icon: ClipboardList, label: '更正申请', note: '核对后处理' },
    ],
    activities: [
      { label: '班级分已记录', detail: '七年级（2）班 · 早读秩序 · +3 分', time: '08:12' },
      { label: '更正申请待处理', detail: '七年级（3）班 · 检查对象有误', time: '昨天' },
      { label: '检查记录已确认', detail: '卫生检查 · 8 个班级', time: '昨天' },
    ],
  },
  admin: {
    notice: '海豚云演示学校 · 系统状态正常',
    metrics: [
      { icon: UsersRound, label: '已启用账号', note: '6 种角色', value: '632 个' },
      { icon: Landmark, label: '班级', note: '覆盖 3 个年级', value: '18 个' },
      { icon: History, label: '今日关键操作', note: '全部留有审计记录', value: '128 次' },
      { icon: CheckCircle2, label: '服务状态', note: '最近检查 1 分钟前', value: '正常' },
    ],
    actions: [
      { icon: UsersRound, label: '账号与班级', note: '成员、绑定与范围' },
      { icon: ShieldCheck, label: '权限与规则', note: '角色和业务规则' },
      { icon: History, label: '操作审计', note: '查询关键写操作' },
      { icon: CheckCircle2, label: '系统设置', note: '服务与演示环境' },
    ],
    activities: [
      { label: '角色范围已更新', detail: '教师端 · 七年级（2）班', time: '10:05' },
      { label: '合成账号已启用', detail: '演示家庭三号 · 家庭端', time: '09:30' },
      { label: '数据库检查通过', detail: 'RLS 与关键服务正常', time: '08:00' },
    ],
  },
} as const satisfies Record<RoleCode, DashboardContent>;

const TEACHER_STUDENTS = [
  { initials: '林', name: '林小海', score: 18, trend: '+2' },
  { initials: '陈', name: '陈星宇', score: 22, trend: '+3' },
  { initials: '周', name: '周可欣', score: 17, trend: '+1' },
  { initials: '许', name: '许文博', score: 16, trend: '0' },
  { initials: '赵', name: '赵一然', score: 15, trend: '+2' },
  { initials: '李', name: '李沐阳', score: 14, trend: '-1' },
] as const;

function SectionHeading({ action, title }: { readonly action?: string; readonly title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action === undefined ? null : (
        <Pressable accessibilityRole="button" style={styles.textAction}>
          <Text style={styles.textActionLabel}>{action}</Text>
          <ArrowRight color={theme.color.brand.primary} size={16} />
        </Pressable>
      )}
    </View>
  );
}

function TeacherClassWorkspace() {
  const [selectedStudent, setSelectedStudent] = useState<string>(
    TEACHER_STUDENTS[0].name,
  );
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const selected = TEACHER_STUDENTS.find((student) => student.name === selectedStudent)!;

  return (
    <View style={styles.classWorkspace}>
      <View style={styles.classWorkspaceHeader}>
        <View>
          <Text style={styles.sectionTitle}>七年级（2）班</Text>
          <Text style={styles.sectionDescription}>选择学生后快速生成学生分确认预览</Text>
        </View>
        <View style={styles.segmentedControl}>
          <View style={styles.segmentActive}><Text style={styles.segmentActiveLabel}>学生</Text></View>
          <View style={styles.segment}><Text style={styles.segmentLabel}>小组</Text></View>
        </View>
      </View>
      <View style={styles.classWorkspaceBody}>
        <View style={styles.studentGrid}>
          {TEACHER_STUDENTS.map((student, index) => {
            const isSelected = student.name === selectedStudent;
            return (
              <Pressable
                accessibilityLabel={`选择${student.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={student.name}
                onPress={() => { setSelectedStudent(student.name); setPreviewMessage(null); }}
                style={[styles.studentCard, isSelected && styles.studentCardSelected]}
              >
                <View style={[styles.studentAvatar, isSelected && styles.studentAvatarSelected]}>
                  <Text style={[styles.studentInitials, isSelected && styles.studentInitialsSelected]}>{student.initials}</Text>
                </View>
                <View style={styles.studentCopy}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentScore}>第 {index + 1} 名 · {student.score} 分</Text>
                </View>
                <Text style={styles.studentTrend}>{student.trend}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.scoreComposer}>
          <Text style={styles.composerEyebrow}>已选择</Text>
          <View style={styles.selectedStudentRow}>
            <View style={styles.selectedAvatar}><Text style={styles.selectedAvatarLabel}>{selected.initials}</Text></View>
            <View><Text style={styles.selectedName}>{selected.name}</Text><Text style={styles.selectedMeta}>当前 {selected.score} 分</Text></View>
          </View>
          <Text style={styles.composerLabel}>选择点评</Text>
          <View style={styles.scoreReasons}>
            {[
              ['积极发言', '+2 分'],
              ['认真作业', '+2 分'],
              ['团队合作', '+1 分'],
              ['需要改进', '-1 分'],
            ].map(([reason, delta]) => (
              <Pressable
                accessibilityRole="button"
                key={reason}
                onPress={() => setPreviewMessage(`已生成：${selected.name} · ${reason} · ${delta}`)}
                style={styles.reasonButton}
              >
                <Text style={styles.reasonLabel}>{reason}</Text>
                <Text style={styles.reasonDelta}>{delta}</Text>
              </Pressable>
            ))}
          </View>
          {previewMessage === null ? (
            <Text style={styles.composerHelper}>选择点评后仍需确认，不会直接改变学生分。</Text>
          ) : (
            <View style={styles.previewNotice}>
              <CheckCircle2 color={theme.color.brand.primary} size={18} />
              <View style={styles.previewCopy}><Text style={styles.previewTitle}>{previewMessage}</Text><Text style={styles.previewDescription}>确认对象、数值和原因后执行。</Text></View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export function RoleDashboardOverview({ role }: { readonly role: RoleCode }) {
  const { width } = useWindowDimensions();
  const isCompact = width < 720;
  const content = DASHBOARD_CONTENT[role];
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const roleLabel = useMemo(() => ROLE_LABELS[role], [role]);

  return (
    <>
      <View style={styles.contextBar}>
        <View style={styles.contextIcon}><UserRoundCheck color={theme.color.brand.primary} size={18} /></View>
        <View style={styles.contextCopy}>
          <Text style={styles.contextLabel}>{content.notice}</Text>
          <Text style={styles.contextMeta}>{roleLabel}当前权限范围</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.contextAction}>
          <Text style={styles.contextActionLabel}>{role === 'teacher' ? '切换班级' : '查看详情'}</Text>
        </Pressable>
      </View>

      <View style={styles.metricGrid}>
        {content.metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <View key={metric.label} style={[styles.metricCard, isCompact && styles.metricCardCompact]}>
              <View style={styles.metricTop}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <View style={styles.metricIcon}><Icon color={theme.color.brand.primary} size={18} /></View>
              </View>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricNote}>{metric.note}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.dashboardColumns}>
        <View style={styles.quickPanel}>
          <SectionHeading title="快捷操作" />
          <View style={styles.quickGrid}>
            {content.actions.map((action) => {
              const Icon = action.icon;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={() => setSelectedAction(action.label)}
                  style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
                >
                  <View style={styles.quickIcon}><Icon color={theme.color.brand.primary} size={21} /></View>
                  <View style={styles.quickCopy}>
                    <Text style={styles.quickLabel}>{action.label}</Text>
                    <Text style={styles.quickNote}>{action.note}</Text>
                  </View>
                  <ArrowRight color={theme.color.text.disabled} size={17} />
                </Pressable>
              );
            })}
          </View>
          {selectedAction === null ? null : (
            <View style={styles.actionFeedback}>
              <CheckCircle2 color={theme.color.brand.primary} size={17} />
              <Text style={styles.actionFeedbackLabel}>已定位到“{selectedAction}”，完整功能将在对应业务区继续操作。</Text>
            </View>
          )}
        </View>

        <View style={styles.activityPanel}>
          <SectionHeading action="全部记录" title="最新动态" />
          <View style={styles.activityList}>
            {content.activities.map((activity, index) => (
              <View key={`${activity.label}:${activity.time}`} style={styles.activityRow}>
                <View style={styles.timelineColumn}>
                  <View style={styles.timelineDot} />
                  {index === content.activities.length - 1 ? null : <View style={styles.timelineLine} />}
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityLabel}>{activity.label}</Text>
                  <Text style={styles.activityDetail}>{activity.detail}</Text>
                </View>
                <Text style={styles.activityTime}>{activity.time}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {role === 'teacher' ? <TeacherClassWorkspace /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  contextBar: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexDirection: 'row', gap: theme.space.base, minHeight: 64, paddingHorizontal: theme.space.md, paddingVertical: theme.space.base },
  contextIcon: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.pill, height: 36, justifyContent: 'center', width: 36 },
  contextCopy: { flex: 1 },
  contextLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  contextMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  contextAction: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: theme.space.base },
  contextActionLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  metricCard: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexBasis: 210, flexGrow: 1, minHeight: 132, padding: theme.space.md },
  metricCardCompact: { flexBasis: 150, minHeight: 124 },
  metricTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '600' },
  metricIcon: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, height: 32, justifyContent: 'center', width: 32 },
  metricValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '800', marginTop: theme.space.base },
  metricNote: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: theme.space.xs },
  dashboardColumns: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  quickPanel: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexBasis: 300, flexGrow: 1, gap: theme.space.md, padding: theme.space.lg },
  activityPanel: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexBasis: 300, flexGrow: 1, gap: theme.space.md, padding: theme.space.lg },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  sectionDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: theme.space.xs },
  textAction: { alignItems: 'center', flexDirection: 'row', gap: theme.space.xs, minHeight: 32 },
  textActionLabel: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  quickAction: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: 210, flexDirection: 'row', flexGrow: 1, gap: theme.space.base, minHeight: 76, padding: theme.space.base },
  quickActionPressed: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  quickIcon: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, height: 40, justifyContent: 'center', width: 40 },
  quickCopy: { flex: 1 },
  quickLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  quickNote: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  actionFeedback: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  actionFeedbackLabel: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.xs, lineHeight: 18 },
  activityList: { gap: 0 },
  activityRow: { flexDirection: 'row', minHeight: 64 },
  timelineColumn: { alignItems: 'center', marginRight: theme.space.base, width: 10 },
  timelineDot: { backgroundColor: theme.color.brand.primary, borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  timelineLine: { backgroundColor: theme.color.border.default, flex: 1, marginVertical: 4, width: 1 },
  activityCopy: { flex: 1, paddingBottom: theme.space.base },
  activityLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  activityDetail: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, marginTop: 4 },
  activityTime: { color: theme.color.text.disabled, fontSize: theme.text.size.xs, marginLeft: theme.space.sm },
  classWorkspace: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, overflow: 'hidden' },
  classWorkspaceHeader: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: theme.space.lg },
  segmentedControl: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, flexDirection: 'row', padding: 3 },
  segment: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 34, paddingHorizontal: theme.space.base },
  segmentActive: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderRadius: 8, justifyContent: 'center', minHeight: 34, paddingHorizontal: theme.space.base },
  segmentLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '600' },
  segmentActiveLabel: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  classWorkspaceBody: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap' },
  studentGrid: { flexBasis: 300, flexDirection: 'row', flexGrow: 2, flexWrap: 'wrap', gap: theme.space.sm, padding: theme.space.lg },
  studentCard: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: 175, flexDirection: 'row', flexGrow: 1, gap: theme.space.sm, minHeight: 68, padding: theme.space.sm },
  studentCardSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  studentAvatar: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.pill, height: 38, justifyContent: 'center', width: 38 },
  studentAvatarSelected: { backgroundColor: theme.color.brand.primary },
  studentInitials: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '800' },
  studentInitialsSelected: { color: theme.color.surface.card },
  studentCopy: { flex: 1 },
  studentName: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  studentScore: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  studentTrend: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  scoreComposer: { backgroundColor: theme.color.surface.page, borderLeftColor: theme.color.border.default, borderLeftWidth: 1, flexBasis: 300, flexGrow: 1, gap: theme.space.base, padding: theme.space.lg },
  composerEyebrow: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  selectedStudentRow: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  selectedAvatar: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 44, justifyContent: 'center', width: 44 },
  selectedAvatarLabel: { color: theme.color.surface.card, fontSize: theme.text.size.md, fontWeight: '800' },
  selectedName: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  selectedMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  composerLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700', marginTop: theme.space.xs },
  scoreReasons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  reasonButton: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: 120, flexGrow: 1, gap: theme.space.xs, minHeight: 62, padding: theme.space.base },
  reasonLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  reasonDelta: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '800' },
  composerHelper: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  previewNotice: { alignItems: 'flex-start', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  previewCopy: { flex: 1 },
  previewTitle: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  previewDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
});
