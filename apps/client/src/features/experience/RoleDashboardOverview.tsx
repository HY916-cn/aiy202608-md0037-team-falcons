import type { RoleCode } from '@dolphincloud/auth';
import {
  ArrowRight,
  ChartColumn,
  CheckCircle2,
  ClipboardList,
  Coins,
  FolderUp,
  History,
  ReceiptText,
  Search,
  ShieldCheck,
  Star,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { theme } from '@dolphincloud/ui';

type Action = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly primary?: boolean;
};

const STUDENTS = [
  { initials: '陈', name: '陈星宇', rank: 1, score: 22, today: '+3' },
  { initials: '林', name: '林小海', rank: 2, score: 18, today: '+2' },
  { initials: '周', name: '周可欣', rank: 3, score: 17, today: '+1' },
  { initials: '许', name: '许文博', rank: 4, score: 16, today: '0' },
  { initials: '赵', name: '赵一然', rank: 5, score: 15, today: '+2' },
  { initials: '李', name: '李沐阳', rank: 6, score: 14, today: '-1' },
] as const;

function ToolButton({ action, onPress }: { readonly action: Action; readonly onPress: () => void }) {
  const Icon = action.icon;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolButton,
        action.primary && styles.toolButtonPrimary,
        pressed && styles.pressed,
      ]}
    >
      <Icon
        color={action.primary ? theme.color.surface.card : theme.color.text.primary}
        size={17}
      />
      <Text style={[styles.toolButtonLabel, action.primary && styles.toolButtonLabelPrimary]}>
        {action.label}
      </Text>
    </Pressable>
  );
}

function Toolbar({ actions, onAction }: { readonly actions: readonly Action[]; readonly onAction: (label: string) => void }) {
  return (
    <View style={styles.toolbar}>
      {actions.map((action) => (
        <ToolButton action={action} key={action.label} onPress={() => onAction(action.label)} />
      ))}
    </View>
  );
}

function ScopeLine({ action = '切换班级', label }: { readonly action?: string; readonly label: string }) {
  return (
    <View style={styles.scopeLine}>
      <View style={styles.scopeIdentity}>
        <UserRoundCheck color={theme.color.brand.primary} size={17} />
        <Text style={styles.scopeLabel}>{label}</Text>
      </View>
      <Pressable accessibilityRole="button" style={styles.inlineButton}>
        <Text style={styles.inlineButtonLabel}>{action}</Text>
        <ArrowRight color={theme.color.brand.primary} size={15} />
      </Pressable>
    </View>
  );
}

function SectionTitle({ action, title }: { readonly action?: string; readonly title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action === undefined ? null : (
        <Pressable accessibilityRole="button" style={styles.inlineButton}>
          <Text style={styles.inlineButtonLabel}>{action}</Text>
          <ArrowRight color={theme.color.brand.primary} size={15} />
        </Pressable>
      )}
    </View>
  );
}

function Feedback({ label }: { readonly label: string | null }) {
  if (label === null) return null;
  return (
    <View style={styles.feedback}>
      <CheckCircle2 color={theme.color.brand.primary} size={17} />
      <Text style={styles.feedbackLabel}>已进入“{label}”操作，继续选择对象和范围。</Text>
    </View>
  );
}

function InsightStrip({ items }: { readonly items: readonly { label: string; note?: string; value: string }[] }) {
  return (
    <View style={styles.insightStrip}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.insightItem, index > 0 && styles.insightItemBorder]}>
          <Text style={styles.insightLabel}>{item.label}</Text>
          <Text style={styles.insightValue}>{item.value}</Text>
          {item.note === undefined ? null : <Text style={styles.insightNote}>{item.note}</Text>}
        </View>
      ))}
    </View>
  );
}

function TeacherWorkspace({ compact, onAction }: { readonly compact: boolean; readonly onAction: (label: string) => void }) {
  const [selectedName, setSelectedName] = useState<string>(STUDENTS[1].name);
  const [preview, setPreview] = useState<string | null>(null);
  const selected = STUDENTS.find((student) => student.name === selectedName) ?? STUDENTS[0];
  const actions = [
    { icon: Star, label: '课堂点评', primary: true },
    { icon: FolderUp, label: '发送课件' },
    { icon: ClipboardList, label: '发布作业' },
    { icon: ChartColumn, label: '发布成绩' },
    { icon: ReceiptText, label: '发起罚款' },
  ] as const;

  return (
    <>
      <ScopeLine label="七年级（2）班 · 第 3 节数学课" />
      <Toolbar actions={actions} onAction={onAction} />
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <View style={styles.surfaceHeader}>
            <View>
              <Text style={styles.surfaceEyebrow}>课堂名册</Text>
              <Text style={styles.surfaceTitle}>42 人·已到 41 人</Text>
            </View>
            <Pressable accessibilityRole="button" style={styles.textOnlyButton}>
              <Text style={styles.inlineButtonLabel}>批量选择</Text>
            </Pressable>
          </View>
          <View style={styles.rosterHeader}>
            <Text style={[styles.columnLabel, styles.personColumn]}>学生</Text>
            <Text style={styles.columnLabel}>班内名次</Text>
            <Text style={styles.columnLabel}>学生分</Text>
            <Text style={styles.columnLabel}>今日</Text>
          </View>
          {STUDENTS.map((student) => {
            const selectedRow = student.name === selectedName;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedRow }}
                key={student.name}
                onPress={() => {
                  setSelectedName(student.name);
                  setPreview(null);
                }}
                style={[styles.rosterRow, selectedRow && styles.rosterRowSelected]}
              >
                <View style={[styles.personCell, styles.personColumn]}>
                  <View style={[styles.avatar, selectedRow && styles.avatarSelected]}>
                    <Text style={[styles.avatarLabel, selectedRow && styles.avatarLabelSelected]}>{student.initials}</Text>
                  </View>
                  <Text style={styles.rowPrimary}>{student.name}</Text>
                </View>
                <Text style={styles.rowValue}>第 {student.rank} 名</Text>
                <Text style={styles.rowValue}>{student.score} 分</Text>
                <Text style={styles.rowDelta}>{student.today}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.contextRail, compact && styles.contextRailCompact]}>
          <Text style={styles.surfaceEyebrow}>当前对象</Text>
          <View style={styles.selectedIdentity}>
            <View style={styles.selectedAvatar}><Text style={styles.selectedAvatarLabel}>{selected.initials}</Text></View>
            <View>
              <Text style={styles.selectedName}>{selected.name}</Text>
              <Text style={styles.selectedMeta}>{selected.score} 分 · 班内第 {selected.rank} 名</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>选择点评</Text>
          {[
            ['积极发言', '+2 分'],
            ['认真作业', '+2 分'],
            ['团队合作', '+1 分'],
            ['需要改进', '-1 分'],
          ].map(([reason, delta]) => (
            <Pressable
              accessibilityRole="button"
              key={reason}
              onPress={() => setPreview(`${selected.name} · ${reason} · ${delta}`)}
              style={styles.reasonRow}
            >
              <Text style={styles.reasonLabel}>{reason}</Text>
              <Text style={styles.rowDelta}>{delta}</Text>
            </Pressable>
          ))}
          <Text style={styles.safetyNote}>点评会先生成确认预览，不会直接改分。</Text>
          {preview === null ? null : (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>待确认</Text>
              <Text style={styles.previewBody}>{preview}</Text>
              <Pressable accessibilityRole="button" style={styles.confirmButton}>
                <Text style={styles.confirmButtonLabel}>确认记录</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function ClassWorkspace({ compact }: { readonly compact: boolean }) {
  return (
    <>
      <View style={styles.classHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>七年级（2）班 · 公共设备模式</Text>
          <Text style={styles.heroTitle}>下一节：数学</Text>
          <Text style={styles.heroMeta}>10:40–11:20 · 教室 702 · 陈老师</Text>
        </View>
        <View style={styles.heroStatus}>
          <Text style={styles.heroStatusValue}>41 / 42</Text>
          <Text style={styles.heroStatusLabel}>今日出勤</Text>
        </View>
      </View>
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <SectionTitle action="全部课件" title="今日课堂" />
          {[
            ['10:40', '数学', '一次函数复习', '新课件 1 份'],
            ['13:30', '英语', '听力与口语训练', '作业今日截止'],
            ['14:25', '生物', '细胞的结构', '无待办'],
          ].map(([time, subject, topic, note]) => (
            <View key={time} style={styles.scheduleRow}>
              <Text style={styles.scheduleTime}>{time}</Text>
              <View style={styles.scheduleCopy}>
                <Text style={styles.rowPrimary}>{subject} · {topic}</Text>
                <Text style={styles.rowSecondary}>{note}</Text>
              </View>
              <ArrowRight color={theme.color.text.disabled} size={17} />
            </View>
          ))}
        </View>
        <View style={[styles.secondarySurface, compact && styles.secondarySurfaceCompact]}>
          <SectionTitle action="班内排行" title="班级表现" />
          <InsightStrip items={[
            { label: '今日学生分', value: '+26 分' },
            { label: '本周班级分', value: '86 分' },
          ]} />
          <Text style={styles.privacyNote}>公共设备不显示个人成绩、海豚币或罚款信息。</Text>
        </View>
      </View>
    </>
  );
}

function FamilyWorkspace({ compact }: { readonly compact: boolean }) {
  return (
    <>
      <View style={styles.familyHeader}>
        <View style={styles.familyIdentity}>
          <View style={styles.familyAvatar}><Text style={styles.familyAvatarLabel}>林</Text></View>
          <View>
            <Text style={styles.familyName}>林小海</Text>
            <Text style={styles.familyMeta}>七年级（2）班 · 今日已到校</Text>
          </View>
        </View>
        <View style={styles.familyInsightRow}>
          {[
            ['本周学生分', '18 分'],
            ['本人名次', '第 8 名'],
            ['海豚币', '28 枚'],
          ].map(([label, value]) => (
            <View key={label} style={styles.familyInsight}>
              <Text style={styles.familyInsightValue}>{value}</Text>
              <Text style={styles.familyInsightLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <SectionTitle title="林小海的今天" />
          {[
            ['10:24', '数学课件已发送', '《一次函数复习》'],
            ['09:48', '获得学生分 +2 分', '数学 · 积极发言'],
            ['08:35', '新作业已发布', '练习册第 18 页 · 明天 18:00 截止'],
            ['07:48', '到校记录', '今日出勤正常'],
          ].map(([time, title, detail], index) => (
            <View key={time} style={styles.timelineRow}>
              <Text style={styles.timelineTime}>{time}</Text>
              <View style={styles.timelineTrack}>
                <View style={styles.timelineDot} />
                {index === 3 ? null : <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineCopy}>
                <Text style={styles.rowPrimary}>{title}</Text>
                <Text style={styles.rowSecondary}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={[styles.contextRail, compact && styles.contextRailCompact]}>
          <SectionTitle action="查看全部" title="待完成作业" />
          {[
            ['英语听写', '今天 20:00', '今日截止'],
            ['数学练习册', '明天 18:00', '18 页'],
            ['生物观察记录', '8月6日 20:00', '待回传'],
          ].map(([title, time, note]) => (
            <View key={title} style={styles.taskRow}>
              <View style={styles.taskMarker} />
              <View style={styles.taskCopy}>
                <Text style={styles.rowPrimary}>{title}</Text>
                <Text style={styles.rowSecondary}>{note}</Text>
              </View>
              <Text style={styles.taskTime}>{time}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function BankWorkspace({ compact, onAction }: { readonly compact: boolean; readonly onAction: (label: string) => void }) {
  return (
    <>
      <ScopeLine action="营业设置" label="海豚云演示学校 · 校园银行" />
      <View style={styles.operationHeader}>
        <InsightStrip items={[
          { label: '待处理罚款单', value: '6 笔', note: '最早等待 18 分钟' },
          { label: '待复核操作', value: '2 笔', note: '包含 1 笔撤销' },
          { label: '今日账户流水', value: '48 笔', note: '变动 214 枚' },
        ]} />
        <View style={styles.searchControl}>
          <Search color={theme.color.text.secondary} size={18} />
          <Text style={styles.searchPlaceholder}>搜索学生、班级或账户编号</Text>
        </View>
      </View>
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <View style={styles.surfaceHeader}>
            <SectionTitle title="罚款待办队列" />
            <Toolbar actions={[{ icon: Coins, label: '调整海豚币' }, { icon: History, label: '账户流水' }]} onAction={onAction} />
          </View>
          <View style={styles.tableHeader}>
            <Text style={[styles.columnLabel, styles.personColumn]}>对象</Text>
            <Text style={styles.columnLabel}>原因</Text>
            <Text style={styles.columnLabel}>金额</Text>
            <Text style={styles.columnLabel}>等待</Text>
          </View>
          {[
            ['林小海', '七年级（2）班', '课堂物品损坏', '2 枚', '18 分钟'],
            ['陈星宇', '七年级（2）班', '图书逾期', '1 枚', '12 分钟'],
            ['李沐阳', '七年级（2）班', '课间秩序', '2 枚', '6 分钟'],
          ].map(([name, className, reason, amount, wait]) => (
            <Pressable accessibilityRole="button" key={name} style={styles.dataRow}>
              <View style={styles.personColumn}>
                <Text style={styles.rowPrimary}>{name}</Text>
                <Text style={styles.rowSecondary}>{className}</Text>
              </View>
              <Text style={styles.rowValue}>{reason}</Text>
              <Text style={styles.rowStrong}>{amount}</Text>
              <Text style={styles.rowValue}>{wait}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.contextRail, compact && styles.contextRailCompact]}>
          <SectionTitle action="全部记录" title="最新账务" />
          {[
            ['校园志愿服务', '陈星宇', '+5 枚', '09:42'],
            ['罚款单已处理', '周可欣', '-2 枚', '09:18'],
            ['指定操作已撤销', '赵一然', '+1 枚', '08:55'],
          ].map(([title, name, amount, time]) => (
            <View key={`${title}:${name}`} style={styles.financeRow}>
              <View style={styles.financeCopy}>
                <Text style={styles.rowPrimary}>{title}</Text>
                <Text style={styles.rowSecondary}>{name} · {time}</Text>
              </View>
              <Text style={styles.rowStrong}>{amount}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function CouncilWorkspace({ compact }: { readonly compact: boolean }) {
  return (
    <>
      <ScopeLine action="选择周期" label="七年级自治会 · 第 12 周检查" />
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <View style={styles.surfaceHeader}>
            <View><Text style={styles.surfaceEyebrow}>周排行</Text><Text style={styles.surfaceTitle}>班级表现</Text></View>
            <ToolButton action={{ icon: ShieldCheck, label: '记录班级分', primary: true }} onPress={() => undefined} />
          </View>
          {[
            [1, '七年级（1）班', '92 分', '+8'],
            [2, '七年级（2）班', '86 分', '+3'],
            [3, '七年级（5）班', '82 分', '+5'],
            [4, '七年级（3）班', '78 分', '-1'],
          ].map(([rank, name, score, today]) => (
            <View key={String(name)} style={styles.rankingRow}>
              <Text style={styles.rankNumber}>{rank}</Text>
              <View style={styles.rankingCopy}><Text style={styles.rowPrimary}>{name}</Text><Text style={styles.rowSecondary}>今日 {today} 分</Text></View>
              <Text style={styles.rankingScore}>{score}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.contextRail, compact && styles.contextRailCompact]}>
          <SectionTitle action="检查记录" title="今日检查" />
          <InsightStrip items={[
            { label: '已检查', value: '8 班' },
            { label: '更正申请', value: '3 项' },
          ]} />
          {[
            ['早读秩序', '七年级（2）班', '+3 分', '08:12'],
            ['卫生检查', '七年级（1）班', '+2 分', '08:06'],
            ['更正申请', '七年级（3）班', '待处理', '昨天'],
          ].map(([title, className, value, time]) => (
            <View key={`${title}:${className}`} style={styles.financeRow}>
              <View style={styles.financeCopy}><Text style={styles.rowPrimary}>{title}</Text><Text style={styles.rowSecondary}>{className} · {time}</Text></View>
              <Text style={styles.rowStrong}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function AdminWorkspace({ compact }: { readonly compact: boolean }) {
  return (
    <>
      <View style={styles.adminStatusBar}>
        <View style={styles.statusIdentity}><CheckCircle2 color={theme.color.brand.primary} size={18} /><Text style={styles.statusTitle}>服务运行正常</Text></View>
        <Text style={styles.statusMeta}>最后检查 1 分钟前 · 数据库与 RLS 已连接</Text>
      </View>
      <View style={[styles.splitWorkspace, compact && styles.stackWorkspace]}>
        <View style={styles.primarySurface}>
          <View style={styles.surfaceHeader}>
            <View><Text style={styles.surfaceEyebrow}>管理对象</Text><Text style={styles.surfaceTitle}>账号与班级</Text></View>
            <View style={styles.searchControlSmall}><Search color={theme.color.text.secondary} size={17} /><Text style={styles.searchPlaceholder}>搜索账号</Text></View>
          </View>
          <View style={styles.tableHeader}>
            <Text style={[styles.columnLabel, styles.personColumn]}>账号</Text>
            <Text style={styles.columnLabel}>角色</Text>
            <Text style={styles.columnLabel}>权限范围</Text>
            <Text style={styles.columnLabel}>状态</Text>
          </View>
          {[
            ['陈老师', 'teacher.demo', '教师端', '七年级（2）班', '已启用'],
            ['演示家庭一号', 'family.demo', '家庭端', '林小海家庭', '已启用'],
            ['校园银行一号', 'bank.demo', '银行端', '演示学校', '已启用'],
            ['七年级（2）班终端', 'class.demo', '班级端', '七年级（2）班', '已启用'],
          ].map(([name, account, role, scope, status]) => (
            <Pressable accessibilityRole="button" key={account} style={styles.dataRow}>
              <View style={styles.personColumn}><Text style={styles.rowPrimary}>{name}</Text><Text style={styles.rowSecondary}>{account}</Text></View>
              <Text style={styles.rowValue}>{role}</Text>
              <Text style={styles.rowValue}>{scope}</Text>
              <Text style={styles.statusText}>{status}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.contextRail, compact && styles.contextRailCompact]}>
          <SectionTitle action="操作审计" title="审计摘要" />
          {[
            ['角色范围已更新', '教师端 · 七年级（2）班', '10:05'],
            ['演示账号已启用', '家庭端', '09:30'],
            ['RLS 检查通过', '数据库自动检查', '08:00'],
          ].map(([title, detail, time]) => (
            <View key={title} style={styles.auditRow}>
              <View style={styles.auditMarker} />
              <View style={styles.financeCopy}><Text style={styles.rowPrimary}>{title}</Text><Text style={styles.rowSecondary}>{detail}</Text></View>
              <Text style={styles.taskTime}>{time}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

export function RoleDashboardOverview({ role }: { readonly role: RoleCode }) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  return (
    <>
      {role === 'teacher' ? <TeacherWorkspace compact={compact} onAction={setSelectedAction} /> : null}
      {role === 'class_terminal' ? <ClassWorkspace compact={compact} /> : null}
      {role === 'family' ? <FamilyWorkspace compact={compact} /> : null}
      {role === 'bank_operator' ? <BankWorkspace compact={compact} onAction={setSelectedAction} /> : null}
      {role === 'council' ? <CouncilWorkspace compact={compact} /> : null}
      {role === 'admin' ? <AdminWorkspace compact={compact} /> : null}
      <Feedback label={selectedAction} />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  scopeLine: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: theme.space.xs },
  scopeIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  scopeLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  inlineButton: { alignItems: 'center', flexDirection: 'row', gap: theme.space.xs, minHeight: 36 },
  inlineButtonLabel: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  toolButton: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 42, paddingHorizontal: theme.space.base },
  toolButtonPrimary: { backgroundColor: theme.color.brand.primary, borderColor: theme.color.brand.primary },
  toolButtonLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
  toolButtonLabelPrimary: { color: theme.color.surface.card },
  feedback: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderLeftColor: theme.color.brand.primary, borderLeftWidth: 3, flexDirection: 'row', gap: theme.space.sm, padding: theme.space.base },
  feedbackLabel: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.xs },
  splitWorkspace: { alignItems: 'stretch', flexDirection: 'row', gap: theme.space.base },
  stackWorkspace: { flexDirection: 'column' },
  primarySurface: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flex: 2, minWidth: 0, overflow: 'hidden', padding: theme.space.lg },
  secondarySurface: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flex: 1, gap: theme.space.lg, padding: theme.space.lg },
  secondarySurfaceCompact: { flex: 0 },
  contextRail: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.card, flex: 1, gap: theme.space.base, minWidth: 286, padding: theme.space.lg },
  contextRailCompact: { flex: 0, minWidth: 0 },
  surfaceHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, justifyContent: 'space-between', marginBottom: theme.space.lg },
  surfaceEyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', letterSpacing: 0.8 },
  surfaceTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800', marginTop: theme.space.xs },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.space.base },
  sectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  textOnlyButton: { minHeight: 36, paddingHorizontal: theme.space.sm },
  rosterHeader: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 34, paddingHorizontal: theme.space.sm },
  tableHeader: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 38, paddingHorizontal: theme.space.sm },
  columnLabel: { color: theme.color.text.secondary, flex: 1, fontSize: theme.text.size.xs, fontWeight: '700' },
  personColumn: { flex: 1.5 },
  rosterRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 62, paddingHorizontal: theme.space.sm },
  rosterRowSelected: { backgroundColor: theme.color.surface.primaryTint, borderLeftColor: theme.color.brand.primary, borderLeftWidth: 3 },
  personCell: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  avatar: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.pill, height: 34, justifyContent: 'center', width: 34 },
  avatarSelected: { backgroundColor: theme.color.brand.primary },
  avatarLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '800' },
  avatarLabelSelected: { color: theme.color.surface.card },
  rowPrimary: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  rowSecondary: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, marginTop: 3 },
  rowValue: { color: theme.color.text.secondary, flex: 1, fontSize: theme.text.size.xs },
  rowStrong: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '800' },
  rowDelta: { color: theme.color.brand.primary, flex: 1, fontSize: theme.text.size.xs, fontWeight: '800' },
  selectedIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  selectedAvatar: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 46, justifyContent: 'center', width: 46 },
  selectedAvatarLabel: { color: theme.color.surface.card, fontSize: theme.text.size.md, fontWeight: '800' },
  selectedName: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  selectedMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  divider: { backgroundColor: theme.color.border.default, height: 1 },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  reasonRow: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: theme.space.base },
  reasonLabel: { color: theme.color.text.primary, flex: 3, fontSize: theme.text.size.xs, fontWeight: '700' },
  safetyNote: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  previewBox: { backgroundColor: theme.color.surface.card, borderLeftColor: theme.color.brand.primary, borderLeftWidth: 3, gap: theme.space.sm, padding: theme.space.base },
  previewTitle: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  previewBody: { color: theme.color.text.primary, fontSize: theme.text.size.xs, lineHeight: 18 },
  confirmButton: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 40 },
  confirmButtonLabel: { color: theme.color.surface.card, fontSize: theme.text.size.xs, fontWeight: '800' },
  insightStrip: { alignItems: 'stretch', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  insightItem: { flex: 1, gap: 3, minWidth: 0, padding: theme.space.base },
  insightItemBorder: { borderLeftColor: theme.color.border.default, borderLeftWidth: 1 },
  insightLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  insightValue: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  insightNote: { color: theme.color.text.secondary, fontSize: 10 },
  classHero: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.card, flexDirection: 'row', gap: theme.space.lg, justifyContent: 'space-between', minHeight: 146, padding: theme.space.lg },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: theme.color.brand.secondary, fontSize: theme.text.size.xs, fontWeight: '800' },
  heroTitle: { color: theme.color.surface.card, fontSize: theme.text.size.display, fontWeight: '800', marginTop: theme.space.sm },
  heroMeta: { color: theme.color.surface.card, fontSize: theme.text.size.sm, marginTop: theme.space.sm, opacity: 0.82 },
  heroStatus: { alignItems: 'flex-end', borderLeftColor: theme.color.brand.onPrimaryBorder, borderLeftWidth: 1, minWidth: 110, paddingLeft: theme.space.lg },
  heroStatusValue: { color: theme.color.surface.card, fontSize: theme.text.size.xl, fontWeight: '800' },
  heroStatusLabel: { color: theme.color.surface.card, fontSize: theme.text.size.xs, marginTop: theme.space.xs, opacity: 0.8 },
  scheduleRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.base, minHeight: 72 },
  scheduleTime: { color: theme.color.brand.primary, fontSize: theme.text.size.md, fontWeight: '800', width: 52 },
  scheduleCopy: { flex: 1 },
  privacyNote: { backgroundColor: theme.color.surface.secondaryTint, borderLeftColor: theme.color.brand.secondary, borderLeftWidth: 3, color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, padding: theme.space.base },
  familyHeader: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.card, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xl, justifyContent: 'space-between', padding: theme.space.lg },
  familyIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  familyAvatar: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderRadius: theme.radius.pill, height: 54, justifyContent: 'center', width: 54 },
  familyAvatarLabel: { color: theme.color.brand.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  familyName: { color: theme.color.surface.card, fontSize: theme.text.size.xl, fontWeight: '800' },
  familyMeta: { color: theme.color.surface.card, fontSize: theme.text.size.xs, marginTop: theme.space.xs, opacity: 0.82 },
  familyInsightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.lg },
  familyInsight: { minWidth: 94 },
  familyInsightValue: { color: theme.color.surface.card, fontSize: theme.text.size.lg, fontWeight: '800' },
  familyInsightLabel: { color: theme.color.surface.card, fontSize: theme.text.size.xs, marginTop: theme.space.xs, opacity: 0.75 },
  timelineRow: { flexDirection: 'row', minHeight: 70 },
  timelineTime: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, paddingTop: 2, width: 46 },
  timelineTrack: { alignItems: 'center', marginRight: theme.space.base, width: 12 },
  timelineDot: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 8, marginTop: 5, width: 8 },
  timelineLine: { backgroundColor: theme.color.border.default, flex: 1, marginVertical: theme.space.xs, width: 1 },
  timelineCopy: { flex: 1, paddingBottom: theme.space.base },
  taskRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 66 },
  taskMarker: { backgroundColor: theme.color.brand.primary, height: 24, width: 3 },
  taskCopy: { flex: 1 },
  taskTime: { color: theme.color.text.secondary, fontSize: 10, marginLeft: theme.space.sm },
  operationHeader: { alignItems: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  searchControl: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 48, minWidth: 270, paddingHorizontal: theme.space.base },
  searchControlSmall: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 40, minWidth: 190, paddingHorizontal: theme.space.base },
  searchPlaceholder: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  dataRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 66, paddingHorizontal: theme.space.sm },
  financeRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 62 },
  financeCopy: { flex: 2 },
  rankingRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.base, minHeight: 68 },
  rankNumber: { color: theme.color.brand.primary, fontSize: theme.text.size.lg, fontWeight: '800', textAlign: 'center', width: 36 },
  rankingCopy: { flex: 1 },
  rankingScore: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  adminStatusBar: { alignItems: 'center', backgroundColor: theme.color.surface.secondaryTint, borderLeftColor: theme.color.brand.secondary, borderLeftWidth: 4, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, justifyContent: 'space-between', minHeight: 52, paddingHorizontal: theme.space.md },
  statusIdentity: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  statusTitle: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '800' },
  statusMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  statusText: { color: theme.color.brand.primary, flex: 1, fontSize: theme.text.size.xs, fontWeight: '800' },
  auditRow: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.space.sm, minHeight: 62 },
  auditMarker: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, height: 8, marginTop: 5, width: 8 },
});
