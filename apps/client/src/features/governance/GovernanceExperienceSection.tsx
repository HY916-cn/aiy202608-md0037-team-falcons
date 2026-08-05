import type { AuthRoleScope } from '@dolphincloud/auth';
import type {
  GovernanceSnapshot,
} from '@dolphincloud/api-client';
import type {
  WriteActionExecutionAdapter,
  WriteActionPreview,
} from '@dolphincloud/experience';
import {
  InteractivePressable,
  type RoleNavigationKey,
  WriteActionPreviewCard,
  theme,
} from '@dolphincloud/ui';
import {
  BadgeDollarSign,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  ClipboardCheck,
  History,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react-native';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useSupabaseServices } from '@/features/supabase';

import {
  resolveGovernanceExperienceMode,
  resolveGovernanceLayout,
} from './governancePresentation';

const EMPTY: GovernanceSnapshot = {
  accounts: [], appeals: [], classCategories: [], classEntries: [], classScores: [],
  classes: [], fineOrders: [], fineRules: [], isDemo: false, studentCategories: [],
  studentEntries: [], studentRanking: [], students: [], transactions: [],
};

type RequestedWrite = {
  readonly execute: () => Promise<void>;
  readonly preview: WriteActionPreview;
  readonly successMessage: string;
};

function Button({
  dangerous = false,
  disabled = false,
  label,
  onPress,
  secondary = false,
}: {
  readonly dangerous?: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly secondary?: boolean;
}) {
  return (
    <InteractivePressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ focused, hovered, pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        dangerous && styles.dangerButton,
        disabled && styles.disabled,
        hovered && styles.hovered,
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {label}
      </Text>
    </InteractivePressable>
  );
}

function Selector({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <InteractivePressable
            accessibilityLabel={`${label}：${option.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: option.id === value }}
            key={option.id}
            onPress={() => onChange(option.id)}
            style={({ focused, hovered, pressed }) => [
              styles.choice,
              option.id === value && styles.choiceSelected,
              hovered && styles.hovered,
              focused && styles.focused,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.choiceText}>{option.label}</Text>
          </InteractivePressable>
        ))}
      </View>
    </View>
  );
}

function Field({
  label,
  multiline = false,
  onChange,
  placeholder,
  value,
}: {
  readonly label: string;
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.color.text.disabled}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

function Panel({
  children,
  description,
  icon: Icon,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly icon: typeof Trophy;
  readonly title: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeading}>
        <View style={styles.iconBox}><Icon color={theme.color.brand.primary} size={20} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.panelTitle}>{title}</Text>
          <Text style={styles.panelDescription}>{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function StudentScorePanel({
  requestWrite,
  roleScope,
  snapshot,
}: {
  readonly requestWrite: RequestWrite;
  readonly roleScope: AuthRoleScope;
  readonly snapshot: GovernanceSnapshot;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const initialCategory = snapshot.studentCategories.find((item) => item.isActive);
  const [activeView, setActiveView] = useState<'appeals' | 'categories' | 'ranking' | 'score'>('score');
  const [studentId, setStudentId] = useState(snapshot.students[0]?.id ?? '');
  const [studentQuery, setStudentQuery] = useState('');
  const [scoreDirection, setScoreDirection] = useState<'negative' | 'positive'>(initialCategory?.kind ?? 'positive');
  const [categoryId, setCategoryId] = useState(initialCategory?.id ?? '');
  const selectedCategory = snapshot.studentCategories.find((item) => item.id === categoryId);
  const [delta, setDelta] = useState(String(initialCategory?.defaultDelta ?? 1));
  const [reason, setReason] = useState(initialCategory?.description ?? '课堂表现记录');
  const [categoryName, setCategoryName] = useState('互助协作');
  const [categorySlug, setCategorySlug] = useState('teamwork');
  const [categoryDefault, setCategoryDefault] = useState('2');
  const [categoryKind, setCategoryKind] = useState<'negative' | 'positive'>('positive');
  const [entryId, setEntryId] = useState(snapshot.classEntries[0]?.id ?? '');
  const [appealReason, setAppealReason] = useState('该记录需要复核更正');

  const familyRow = snapshot.studentRanking[0];
  const selectedStudent = snapshot.students.find((item) => item.id === studentId);
  const service = useSupabaseServices().governanceService;
  const activeCategories = snapshot.studentCategories.filter(
    (item) => item.isActive && item.kind === scoreDirection,
  );
  const filteredStudents = snapshot.students.filter((student) =>
    student.name.toLocaleLowerCase().includes(studentQuery.trim().toLocaleLowerCase()),
  );
  const parsedDelta = Number(delta);
  const deltaMatchesDirection = Number.isInteger(parsedDelta) &&
    parsedDelta !== 0 &&
    Math.abs(parsedDelta) <= 1_000 &&
    (scoreDirection === 'positive' ? parsedDelta > 0 : parsedDelta < 0);

  const selectDirection = (nextDirection: 'negative' | 'positive') => {
    setScoreDirection(nextDirection);
    const nextCategory = snapshot.studentCategories.find(
      (item) => item.isActive && item.kind === nextDirection,
    );
    setCategoryId(nextCategory?.id ?? '');
    setDelta(String(nextCategory?.defaultDelta ?? (nextDirection === 'positive' ? 1 : -1)));
    setReason(nextCategory?.description ?? '');
  };

  const selectCategory = (nextCategoryId: string) => {
    const nextCategory = snapshot.studentCategories.find((item) => item.id === nextCategoryId);
    if (nextCategory === undefined) return;
    setCategoryId(nextCategory.id);
    setScoreDirection(nextCategory.kind);
    setDelta(String(nextCategory.defaultDelta));
    setReason(nextCategory.description);
  };

  const adjustDelta = (amount: number) => {
    const currentMagnitude = Math.max(1, Math.abs(Number(delta) || 1));
    const nextMagnitude = Math.max(1, Math.min(1_000, currentMagnitude + amount));
    setDelta(String(scoreDirection === 'positive' ? nextMagnitude : -nextMagnitude));
  };

  if (roleScope.role === 'family') {
    return (
      <Panel description="仅展示当前家庭绑定学生的真实班内名次与分数记录。" icon={UserRound} title="学生成长分">
        {familyRow === undefined ? <Text style={styles.empty}>当前学生暂无分数记录。</Text> : (
          <View style={styles.metricRow}>
            <View style={styles.metric}><Text style={styles.metricValue}>{familyRow.score}</Text><Text style={styles.metricLabel}>当前学生分</Text></View>
            <View style={styles.metric}><Text style={styles.metricValue}>第 {familyRow.rank} 名</Text><Text style={styles.metricLabel}>真实班内名次</Text></View>
          </View>
        )}
        {snapshot.studentEntries.map((entry) => (
          <View key={entry.id} style={styles.record}><Text style={styles.recordTitle}>{entry.delta > 0 ? '+' : ''}{entry.delta} · {entry.reason}</Text><Text style={styles.recordMeta}>{new Date(entry.appliedAt).toLocaleString()}</Text></View>
        ))}
      </Panel>
    );
  }

  const tabs: readonly {
    readonly id: 'appeals' | 'categories' | 'ranking' | 'score';
    readonly label: string;
  }[] = [
    { id: 'score', label: '快速记分' },
    { id: 'ranking', label: '排行与记录' },
    ...(roleScope.role === 'teacher' ? [{ id: 'categories' as const, label: '评价条目' }] : []),
    { id: 'appeals', label: '更正申请' },
  ];

  return (
    <Panel
      description="高频记分、排行记录、评价条目和更正申请分区处理，避免把不同任务塞进同一张表单。"
      icon={ChartNoAxesColumnIncreasing}
      title="学生表现"
    >
      <View accessibilityLabel="学生表现功能" style={styles.scoreTabs}>
        {tabs.map((tab) => (
          <InteractivePressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === tab.id }}
            key={tab.id}
            onPress={() => setActiveView(tab.id)}
            style={({ focused, hovered, pressed }) => [
              styles.scoreTab,
              activeView === tab.id && styles.scoreTabSelected,
              hovered && styles.hovered,
              focused && styles.focused,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.scoreTabText, activeView === tab.id && styles.scoreTabTextSelected]}>
              {tab.label}
            </Text>
          </InteractivePressable>
        ))}
      </View>

      {activeView === 'score' ? (
        <View style={[styles.scoreWorkbench, compact && styles.scoreWorkbenchCompact]}>
          <View style={styles.scoreFormColumn}>
            <View style={styles.scoreStep}>
              <View style={styles.stepHeading}>
                <Text style={styles.stepNumber}>1</Text>
                <View style={styles.headingCopy}>
                  <Text style={styles.subTitle}>选择学生</Text>
                  <Text style={styles.stepDescription}>搜索并选中本次记分对象。</Text>
                </View>
              </View>
              <TextInput
                accessibilityLabel="搜索学生"
                onChangeText={setStudentQuery}
                placeholder="输入学生姓名"
                placeholderTextColor={theme.color.text.disabled}
                style={styles.input}
                value={studentQuery}
              />
              <ScrollView
                contentContainerStyle={styles.studentGrid}
                nestedScrollEnabled
                style={styles.studentPickerScroll}
              >
                {filteredStudents.map((student) => (
                  <InteractivePressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: student.id === studentId }}
                    key={student.id}
                    onPress={() => setStudentId(student.id)}
                    style={({ focused, hovered, pressed }) => [
                      styles.studentChoice,
                      student.id === studentId && styles.studentChoiceSelected,
                      hovered && styles.hovered,
                      focused && styles.focused,
                      pressed && styles.pressed,
                    ]}
                  >
                    <UserRound color={student.id === studentId ? theme.color.brand.primary : theme.color.text.secondary} size={17} />
                    <Text style={[styles.studentChoiceText, student.id === studentId && styles.studentChoiceTextSelected]}>
                      {student.name}
                    </Text>
                  </InteractivePressable>
                ))}
                {filteredStudents.length === 0 ? <Text style={styles.empty}>没有匹配的学生。</Text> : null}
              </ScrollView>
            </View>

            <View style={styles.scoreStep}>
              <View style={styles.stepHeading}>
                <Text style={styles.stepNumber}>2</Text>
                <View style={styles.headingCopy}>
                  <Text style={styles.subTitle}>选择加分或减分条目</Text>
                  <Text style={styles.stepDescription}>条目给出默认分值，本次仍可单独调整。</Text>
                </View>
              </View>
              <View style={styles.directionRow}>
                {(['positive', 'negative'] as const).map((direction) => {
                  const selected = scoreDirection === direction;
                  return (
                    <InteractivePressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={direction}
                      onPress={() => selectDirection(direction)}
                      style={({ focused, hovered, pressed }) => [
                        styles.directionButton,
                        selected && styles.directionButtonSelected,
                        direction === 'negative' && selected && styles.directionButtonNegative,
                        hovered && styles.hovered,
                        focused && styles.focused,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.directionButtonText, selected && styles.directionButtonTextSelected]}>
                        {direction === 'positive' ? '加分' : '减分'}
                      </Text>
                    </InteractivePressable>
                  );
                })}
              </View>
              <View style={styles.categoryGrid}>
                {activeCategories.map((category) => (
                  <InteractivePressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: category.id === categoryId }}
                    key={category.id}
                    onPress={() => selectCategory(category.id)}
                    style={({ focused, hovered, pressed }) => [
                      styles.categoryCard,
                      category.id === categoryId && styles.categoryCardSelected,
                      hovered && styles.hovered,
                      focused && styles.focused,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.categoryName}>{category.displayName}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                    <Text style={styles.categoryDefault}>
                      默认 {category.defaultDelta > 0 ? '+' : ''}{category.defaultDelta}
                    </Text>
                  </InteractivePressable>
                ))}
                {activeCategories.length === 0 ? <Text style={styles.empty}>当前没有可用的{scoreDirection === 'positive' ? '加分' : '减分'}条目，请由教师在“评价条目”中添加。</Text> : null}
              </View>
            </View>

            <View style={styles.scoreStep}>
              <View style={styles.stepHeading}>
                <Text style={styles.stepNumber}>3</Text>
                <View style={styles.headingCopy}>
                  <Text style={styles.subTitle}>确认本次分值和原因</Text>
                  <Text style={styles.stepDescription}>调整只影响本次记录，不会修改条目默认值。</Text>
                </View>
              </View>
              <View style={styles.scoreAdjustRow}>
                <InteractivePressable
                  accessibilityLabel="减少本次分值绝对值"
                  accessibilityRole="button"
                  onPress={() => adjustDelta(-1)}
                  style={styles.scoreAdjustButton}
                >
                  <Text style={styles.scoreAdjustButtonText}>−</Text>
                </InteractivePressable>
                <TextInput
                  accessibilityLabel="本次分值"
                  inputMode="numeric"
                  onChangeText={setDelta}
                  style={[styles.input, styles.scoreInput]}
                  value={delta}
                />
                <InteractivePressable
                  accessibilityLabel="增加本次分值绝对值"
                  accessibilityRole="button"
                  onPress={() => adjustDelta(1)}
                  style={styles.scoreAdjustButton}
                >
                  <Text style={styles.scoreAdjustButtonText}>＋</Text>
                </InteractivePressable>
                <InteractivePressable
                  accessibilityRole="button"
                  onPress={() => setDelta(String(selectedCategory?.defaultDelta ?? (scoreDirection === 'positive' ? 1 : -1)))}
                  style={styles.resetButton}
                >
                  <Text style={styles.resetButtonText}>恢复默认</Text>
                </InteractivePressable>
              </View>
              <Field label="记录原因" multiline onChange={setReason} placeholder="说明这次加分或减分的具体原因" value={reason} />
              {!deltaMatchesDirection ? (
                <Text style={styles.validationText}>
                  {scoreDirection === 'positive' ? '加分必须填写 1–1000 的正整数。' : '减分必须填写 -1–-1000 的负整数。'}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={[styles.scoreSummary, compact && styles.scoreSummaryCompact]}>
            <Text style={styles.summaryEyebrow}>操作预览</Text>
            <Text style={styles.summaryTitle}>{selectedStudent?.name ?? '尚未选择学生'}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>行为条目</Text>
              <Text style={styles.summaryValue}>{selectedCategory?.displayName ?? '尚未选择'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>本次变化</Text>
              <Text style={[styles.summaryDelta, scoreDirection === 'negative' && styles.summaryDeltaNegative]}>
                {parsedDelta > 0 ? '+' : ''}{Number.isFinite(parsedDelta) ? parsedDelta : 0}
              </Text>
            </View>
            <View style={styles.summaryReason}>
              <Text style={styles.summaryLabel}>记录原因</Text>
              <Text style={styles.summaryReasonText}>{reason.trim() === '' ? '尚未填写' : reason}</Text>
            </View>
            <Text style={styles.summaryHint}>提交后先进入确认页；确认成功才会生成不可变记录并刷新排行。</Text>
            <Button
              dangerous={scoreDirection === 'negative'}
              disabled={studentId === '' || categoryId === '' || !deltaMatchesDirection || reason.trim().length < 2}
              label={scoreDirection === 'positive' ? '预览加分' : '预览减分'}
              onPress={() => requestWrite({
                execute: () => service.applyStudentScore(roleScope, { categoryId, delta: parsedDelta, reason: reason.trim(), studentId }),
                impact: ['新增不可变学生分记录并刷新班内排行'],
                isDangerous: parsedDelta < 0,
                operationType: parsedDelta < 0 ? '学生减分' : '学生加分',
                parameters: [`条目：${selectedCategory?.displayName ?? '-'}`, `本次分值：${delta}`, `原因：${reason.trim()}`],
                targets: [selectedStudent?.name ?? '所选学生'],
              }, '学生分记录已生效')}
            />
          </View>
        </View>
      ) : null}

      {activeView === 'ranking' ? (
        <View style={styles.scoreView}>
          <View style={styles.sectionHeadingCompact}>
            <View style={styles.headingCopy}>
              <Text style={styles.subTitle}>班内排行</Text>
              <Text style={styles.stepDescription}>教师端和班级端查看全班排行；家庭端不会取得其他学生行。</Text>
            </View>
          </View>
          {snapshot.studentRanking.length === 0 ? <Text style={styles.empty}>当前班级暂无学生分记录。</Text> : snapshot.studentRanking.map((row) => (
            <View key={row.studentId} style={styles.rankingRow}>
              <Text style={styles.rank}>#{row.rank}</Text>
              <Text style={styles.recordTitle}>{row.displayName ?? '当前学生'}</Text>
              <Text style={styles.score}>{row.score} 分</Text>
            </View>
          ))}
          <View style={styles.subsection}>
            <Text style={styles.subTitle}>最近记录</Text>
            {snapshot.studentEntries.length === 0 ? <Text style={styles.empty}>暂无学生分变动。</Text> : snapshot.studentEntries.slice(0, 12).map((entry) => (
              <View key={entry.id} style={styles.record}>
                <View style={styles.recordHeading}>
                  <Text style={styles.recordTitle}>{studentName(snapshot, entry.studentId)}</Text>
                  <Text style={[styles.score, entry.delta < 0 && styles.negativeScore]}>{entry.delta > 0 ? '+' : ''}{entry.delta}</Text>
                </View>
                <Text style={styles.recordMeta}>{entry.reason} · {new Date(entry.appliedAt).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {activeView === 'categories' && roleScope.role === 'teacher' ? (
        <View style={styles.scoreView}>
          <View>
            <Text style={styles.subTitle}>现有评价条目</Text>
            <Text style={styles.stepDescription}>默认分值用于快速录入，教师每次操作时仍可调整本次分值。</Text>
          </View>
          <View style={styles.categoryGrid}>
            {snapshot.studentCategories.map((category) => (
              <View key={category.id} style={styles.categoryCardStatic}>
                <View style={styles.recordHeading}>
                  <Text style={styles.categoryName}>{category.displayName}</Text>
                  <Text style={[styles.categoryBadge, category.kind === 'negative' && styles.categoryBadgeNegative]}>{category.kind === 'positive' ? '加分' : '减分'}</Text>
                </View>
                <Text style={styles.categoryDescription}>{category.description}</Text>
                <Text style={styles.categoryDefault}>默认 {category.defaultDelta > 0 ? '+' : ''}{category.defaultDelta} · {category.isActive ? '启用' : '停用'}</Text>
              </View>
            ))}
          </View>
          <View style={styles.subsection}>
            <Text style={styles.subTitle}>新增或更新条目</Text>
            <View style={styles.formRow}>
              <Field label="条目名称" onChange={setCategoryName} value={categoryName} />
              <Field label="英文标识" onChange={setCategorySlug} value={categorySlug} />
              <Field label="默认分值" onChange={setCategoryDefault} value={categoryDefault} />
            </View>
            <Selector label="条目类型" onChange={(value) => {
              const kind = value as 'negative' | 'positive';
              setCategoryKind(kind);
              const amount = Math.max(1, Math.abs(Number(categoryDefault) || 1));
              setCategoryDefault(String(kind === 'negative' ? -amount : amount));
            }} options={[{ id: 'positive', label: '加分条目' }, { id: 'negative', label: '减分条目' }]} value={categoryKind} />
            <Button
              disabled={!validInteger(categoryDefault) || categoryName.trim() === '' || categorySlug.trim() === '' || snapshot.classes[0] === undefined}
              label="预览并保存条目"
              secondary
              onPress={() => requestWrite({
                execute: () => service.manageStudentCategory(roleScope, {
                  defaultDelta: Number(categoryDefault),
                  description: categoryName.trim(),
                  displayName: categoryName.trim(),
                  isActive: true,
                  kind: categoryKind,
                  schoolId: snapshot.classes[0]!.schoolId,
                  slug: categorySlug.trim(),
                }),
                impact: ['更新当前学校可选学生分条目'],
                isDangerous: false,
                operationType: '维护学生分条目',
                parameters: [`默认值：${categoryDefault}`, `类型：${categoryKind === 'positive' ? '加分' : '减分'}`],
                targets: [categoryName.trim()],
              }, '学生分条目已保存')}
            />
          </View>
        </View>
      ) : null}

      {activeView === 'appeals' ? (
        <View style={styles.scoreView}>
          <View>
            <Text style={styles.subTitle}>班级分更正申请</Text>
            <Text style={styles.stepDescription}>这里仅提交复核申请，不会直接修改班级分。</Text>
          </View>
          <View style={styles.metricRow}>
            {snapshot.classScores.map((item) => (
              <View key={item.id} style={styles.metric}>
                <Text style={styles.metricValue}>{item.score}</Text>
                <Text style={styles.metricLabel}>{item.name} · 第 {item.rank} 名</Text>
              </View>
            ))}
          </View>
          <Selector label="指定班级分记录" onChange={setEntryId} options={snapshot.classEntries.map((item) => ({ id: item.id, label: `${item.delta > 0 ? '+' : ''}${item.delta} · ${item.reason}` }))} value={entryId} />
          <Field label="申请原因" multiline onChange={setAppealReason} value={appealReason} />
          <Button disabled={entryId === '' || appealReason.trim().length < 5} label="预览并提交更正申请" secondary onPress={() => requestWrite({ execute: () => service.createAppeal(roleScope, entryId, appealReason.trim()), impact: ['自治会端将收到待处理申请；不会直接修改班级分'], isDangerous: false, operationType: '提交班级分更正申请', parameters: [`原因：${appealReason.trim()}`], targets: [entryId] }, '更正申请已提交')} />
        </View>
      ) : null}
    </Panel>
  );
}

function ClassScorePanel({ requestWrite, roleScope, snapshot }: { readonly requestWrite: RequestWrite; readonly roleScope: AuthRoleScope; readonly snapshot: GovernanceSnapshot }) {
  const service = useSupabaseServices().governanceService;
  const [classId, setClassId] = useState(snapshot.classes[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(snapshot.classCategories[0]?.id ?? '');
  const [delta, setDelta] = useState('5');
  const [reason, setReason] = useState('自治会检查记录');
  const [appealId, setAppealId] = useState(snapshot.appeals.find((item) => item.status === 'pending')?.id ?? '');
  const [resolution, setResolution] = useState('已核对原始检查凭证');

  return (
    <>
      <Panel description="自治会按指定班级记录班级分，所有变动通过受控 RPC 留痕。" icon={ShieldCheck} title="班级分管理">
        <Selector label="班级" onChange={setClassId} options={snapshot.classes.map((item) => ({ id: item.id, label: item.name }))} value={classId} />
        <Selector label="检查项目" onChange={setCategoryId} options={snapshot.classCategories.filter((item) => item.isActive).map((item) => ({ id: item.id, label: item.displayName }))} value={categoryId} />
        <View style={styles.formRow}><Field label="本次分值" onChange={setDelta} value={delta} /><Field label="变动原因" onChange={setReason} value={reason} /></View>
        <Button disabled={classId === '' || categoryId === '' || !validInteger(delta)} label="预览并记录班级分" onPress={() => requestWrite({ execute: () => service.applyClassScore(roleScope, { categoryId, classId, delta: Number(delta), reason }), impact: ['新增班级分变动并重算排行'], isDangerous: Number(delta) < 0, operationType: '班级分调整', parameters: [`分值：${delta}`, `原因：${reason}`], targets: [snapshot.classes.find((item) => item.id === classId)?.name ?? '所选班级'] }, '班级分已记录')} />
        <View style={styles.metricRow}>{snapshot.classScores.map((item) => <View key={item.id} style={styles.metric}><Text style={styles.metricValue}>#{item.rank} · {item.score}</Text><Text style={styles.metricLabel}>{item.name}</Text></View>)}</View>
      </Panel>
      <Panel description="接受将通过服务端生成反向记录；拒绝仅关闭申请。两种处理都保留审计。" icon={ClipboardCheck} title="更正申请处理">
        <Selector label="待处理申请" onChange={setAppealId} options={snapshot.appeals.filter((item) => item.status === 'pending').map((item) => ({ id: item.id, label: item.reason }))} value={appealId} />
        <Field label="处理说明" multiline onChange={setResolution} value={resolution} />
        <View style={styles.choiceRow}>
          <Button disabled={appealId === '' || resolution.trim() === ''} label="预览接受申请" onPress={() => requestWrite({ execute: () => service.resolveAppeal(roleScope, appealId, true, resolution), impact: ['生成对应班级分反向记录并关闭申请'], isDangerous: true, operationType: '接受更正申请', parameters: [`处理说明：${resolution}`], targets: [appealId] }, '更正申请已接受')} />
          <Button disabled={appealId === '' || resolution.trim() === ''} label="预览拒绝申请" secondary onPress={() => requestWrite({ execute: () => service.resolveAppeal(roleScope, appealId, false, resolution), impact: ['关闭申请；班级分保持不变'], isDangerous: false, operationType: '拒绝更正申请', parameters: [`处理说明：${resolution}`], targets: [appealId] }, '更正申请已拒绝')} />
        </View>
        {snapshot.appeals.map((item) => <View key={item.id} style={styles.record}><Text style={styles.recordTitle}>{item.reason}</Text><Text style={styles.status}>{appealStatus(item.status)}</Text>{item.resolutionNote === null ? null : <Text style={styles.recordMeta}>{item.resolutionNote}</Text>}</View>)}
      </Panel>
    </>
  );
}

function WalletPanel({ requestWrite, roleScope, snapshot }: { readonly requestWrite: RequestWrite; readonly roleScope: AuthRoleScope; readonly snapshot: GovernanceSnapshot }) {
  const service = useSupabaseServices().governanceService;
  const [studentId, setStudentId] = useState(snapshot.students[0]?.id ?? '');
  const [amount, setAmount] = useState('10');
  const [reason, setReason] = useState('校园银行账户调整');
  const [ruleName, setRuleName] = useState('物品损坏');
  const [ruleSlug, setRuleSlug] = useState('item_damage');
  const [ruleAmount, setRuleAmount] = useState('10');
  const [orderId, setOrderId] = useState(snapshot.fineOrders[0]?.id ?? '');
  const [orderNote, setOrderNote] = useState('经核对后执行指定记录处理');
  const selectedStudent = snapshot.students.find((item) => item.id === studentId);
  const selectedOrder = snapshot.fineOrders.find((item) => item.id === orderId);

  if (roleScope.role === 'family' || roleScope.role === 'teacher') {
    const account = snapshot.accounts[0];
    const isFamily = roleScope.role === 'family';
    return (
      <>
        <Panel description={isFamily ? '仅显示当前家庭 scope 绑定学生的余额与流水。' : '教师可查看当前授权班级学生的余额与流水，但不能直接调整账户。'} icon={CircleDollarSign} title="海豚币账户">
          {isFamily ? <View style={styles.heroMetric}><Text style={styles.heroValue}>{account?.balance ?? 0}</Text><Text style={styles.metricLabel}>当前余额（海豚币）</Text></View> : snapshot.accounts.map((item) => <View key={item.id} style={styles.record}><Text style={styles.recordTitle}>{studentName(snapshot, item.studentId)}</Text><Text style={styles.recordMeta}>余额 {item.balance} 海豚币</Text></View>)}
          {snapshot.accounts.length === 0 ? <Text style={styles.empty}>当前范围暂无海豚币账户。</Text> : null}
          {snapshot.transactions.map((item) => <View key={item.id} style={styles.record}><Text style={styles.recordTitle}>{item.delta > 0 ? '+' : ''}{item.delta} · {transactionKind(item.kind)}</Text><Text style={styles.recordMeta}>{item.reason} · 余额 {item.balanceAfter}</Text></View>)}
        </Panel>
        <Panel description={isFamily ? '家庭端只读取绑定学生的罚款状态，不能结算、取消或撤销。' : '教师可查看已创建罚款单的处理状态；结算、取消和撤销由银行端执行。'} icon={ReceiptText} title="罚款状态">
          {snapshot.fineOrders.length === 0 ? <Text style={styles.empty}>{isFamily ? '当前学生' : '当前范围'}暂无罚款单。</Text> : snapshot.fineOrders.map((order) => <View key={order.id} style={styles.record}><Text style={styles.recordTitle}>{isFamily ? '' : `${studentName(snapshot, order.studentId)} · `}{order.amount} 币 · {order.reason}</Text><Text style={styles.status}>{fineStatus(order.status)}</Text></View>)}
        </Panel>
      </>
    );
  }

  return (
    <>
      <Panel description="账户建立与余额变化均由服务端事务完成，不在页面本地伪造。" icon={BadgeDollarSign} title="账户与海豚币操作">
        <Selector label="学生账户" onChange={setStudentId} options={snapshot.students.map((item) => ({ id: item.id, label: `${item.name}（余额 ${snapshot.accounts.find((account) => account.studentId === item.id)?.balance ?? 0}）` }))} value={studentId} />
        <View style={styles.formRow}><Field label="金额 / 调整数" onChange={setAmount} value={amount} /><Field label="操作原因" onChange={setReason} value={reason} /></View>
        <View style={styles.choiceRow}>
          <Button disabled={!validPositiveInteger(amount) || studentId === ''} label="预览发放" onPress={() => requestWrite({ execute: () => service.grantDolphin(roleScope, { amount: Number(amount), reason, studentId }), impact: ['增加所选学生海豚币余额并写入流水'], isDangerous: false, operationType: '发放海豚币', parameters: [`金额：${amount}`, `原因：${reason}`], targets: [selectedStudent?.name ?? '所选学生'] }, '海豚币已发放')} />
          <Button disabled={!validPositiveInteger(amount) || studentId === ''} label="预览扣除" secondary onPress={() => requestWrite({ execute: () => service.deductDolphin(roleScope, { amount: Number(amount), reason, studentId }), impact: ['扣除所选学生余额并写入流水'], isDangerous: true, operationType: '扣除海豚币', parameters: [`金额：${amount}`, `原因：${reason}`], targets: [selectedStudent?.name ?? '所选学生'] }, '海豚币已扣除')} />
          <Button disabled={!validInteger(amount) || studentId === ''} label="预览调整" secondary onPress={() => requestWrite({ execute: () => service.adjustDolphin(roleScope, { delta: Number(amount), reason, studentId }), impact: ['按正负调整余额并写入流水'], isDangerous: Number(amount) < 0, operationType: '调整海豚币', parameters: [`调整数：${amount}`, `原因：${reason}`], targets: [selectedStudent?.name ?? '所选学生'] }, '账户余额已调整')} />
        </View>
      </Panel>
      <Panel description="罚款规则由校园银行维护；教师创建罚款单时读取同一规则。" icon={Settings2} title="罚款规则">
        <View style={styles.formRow}><Field label="规则名称" onChange={setRuleName} value={ruleName} /><Field label="英文标识" onChange={setRuleSlug} value={ruleSlug} /><Field label="默认金额" onChange={setRuleAmount} value={ruleAmount} /></View>
        <Button disabled={ruleName.trim() === '' || !validPositiveInteger(ruleAmount)} label="预览并保存规则" onPress={() => requestWrite({ execute: () => service.manageFineRule(roleScope, { defaultAmount: Number(ruleAmount), description: `${ruleName}规则`, displayName: ruleName, isActive: true, slug: ruleSlug }), impact: ['更新教师端可选择的罚款规则'], isDangerous: false, operationType: '维护罚款规则', parameters: [`默认金额：${ruleAmount}`], targets: [ruleName] }, '罚款规则已保存')} />
      </Panel>
      <Panel description="选择指定罚款单完成结算、取消或撤销；撤销必须填写原因。" icon={ReceiptText} title="罚款单处理">
        <Selector label="指定罚款单" onChange={setOrderId} options={snapshot.fineOrders.map((item) => ({ id: item.id, label: `${studentName(snapshot, item.studentId)} · ${item.amount} 币 · ${fineStatus(item.status)}` }))} value={orderId} />
        <Field label="取消 / 撤销原因" multiline onChange={setOrderNote} value={orderNote} />
        <View style={styles.choiceRow}>
          <Button disabled={selectedOrder?.status !== 'pending'} label="预览结算" onPress={() => requestWrite({ execute: () => service.settleFine(roleScope, orderId), impact: ['从指定学生账户扣款并将罚款单置为已结算'], isDangerous: true, operationType: '结算罚款单', parameters: [`金额：${selectedOrder?.amount ?? 0}`], targets: [orderId] }, '罚款单已结算')} />
          <Button disabled={selectedOrder?.status !== 'pending' || orderNote.trim() === ''} label="预览取消" secondary onPress={() => requestWrite({ execute: () => service.cancelFine(roleScope, orderId, orderNote), impact: ['取消待处理罚款单；不产生余额变化'], isDangerous: false, operationType: '取消罚款单', parameters: [`原因：${orderNote}`], targets: [orderId] }, '罚款单已取消')} />
          <Button dangerous disabled={selectedOrder?.status !== 'settled' || orderNote.trim().length < 5} label="预览指定撤销" onPress={() => requestWrite({ execute: () => service.reverseFine(roleScope, orderId, orderNote), impact: ['向原账户返还该罚款金额并生成反向流水'], isDangerous: true, operationType: '指定撤销罚款', parameters: [`撤销原因：${orderNote}`], targets: [orderId] }, '罚款结算已撤销')} />
        </View>
        {snapshot.fineOrders.map((order) => <View key={order.id} style={styles.record}><Text style={styles.recordTitle}>{studentName(snapshot, order.studentId)} · {order.amount} 币</Text><Text style={styles.status}>{fineStatus(order.status)}</Text><Text style={styles.recordMeta}>{order.reason}</Text></View>)}
      </Panel>
      <Panel description="按当前 school scope 读取真实账户流水。" icon={History} title="账户流水">
        {snapshot.transactions.length === 0 ? <Text style={styles.empty}>暂无账户流水。</Text> : snapshot.transactions.map((item) => <View key={item.id} style={styles.record}><Text style={styles.recordTitle}>{item.delta > 0 ? '+' : ''}{item.delta} · {transactionKind(item.kind)}</Text><Text style={styles.recordMeta}>{item.reason} · 余额 {item.balanceAfter}</Text></View>)}
      </Panel>
    </>
  );
}

type RequestWrite = (
  input: {
    readonly execute: () => Promise<void>;
    readonly impact: readonly string[];
    readonly isDangerous: boolean;
    readonly operationType: string;
    readonly parameters: readonly string[];
    readonly targets: readonly string[];
  },
  successMessage: string,
) => void;

export function GovernanceExperienceSection({ activeNavigation, roleScope }: { readonly activeNavigation: RoleNavigationKey; readonly roleScope: AuthRoleScope }) {
  const { governanceService } = useSupabaseServices();
  const { width } = useWindowDimensions();
  const layout = resolveGovernanceLayout(width);
  const mode = resolveGovernanceExperienceMode(roleScope.role, activeNavigation);
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requestedWrite, setRequestedWrite] = useState<RequestedWrite | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSnapshot(EMPTY);
    try {
      setSnapshot(await governanceService.load(roleScope));
    } catch {
      setError('治理数据加载失败，请检查当前权限范围后重试。');
    } finally {
      setLoading(false);
    }
  }, [governanceService, roleScope]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const requestWrite = useCallback<RequestWrite>((input, successMessage) => {
    setError(null);
    setSuccess(null);
    setRequestedWrite({
      execute: input.execute,
      preview: {
        id: `governance:${Date.now()}:${input.operationType}`,
        impact: input.impact,
        isDangerous: input.isDangerous,
        operationType: input.operationType,
        parameterSummary: input.parameters,
        permissionScope: `${roleScope.label}（${roleScope.type}:${roleScope.id}）`,
        role: roleScope.role,
        targets: input.targets,
      },
      successMessage,
    });
  }, [roleScope]);

  const executionAdapter = useMemo<WriteActionExecutionAdapter>(() => ({
    execute: async (previewId) => {
      if (requestedWrite === null || requestedWrite.preview.id !== previewId) throw new Error('INVALID_PREVIEW');
      try {
        await requestedWrite.execute();
        setSuccess(requestedWrite.successMessage);
        setRequestedWrite(null);
        await load();
      } catch (cause) {
        setError('操作失败，服务端未确认写入。请检查输入和权限后重试。');
        throw cause;
      }
    },
  }), [load, requestedWrite]);

  if (mode === null) return null;
  if (loading) return <View style={styles.panel}><Text style={styles.empty}>正在读取当前权限范围的治理数据…</Text></View>;

  return (
    <View style={[styles.workspace, layout.compact && styles.workspaceCompact]}>
      <View style={styles.scopeBanner}>
        <View style={styles.headingCopy}><Text style={styles.scopeTitle}>治理工作区 · {roleScope.label}</Text><Text style={styles.scopeMeta}>权限：{roleScope.role} / {roleScope.type}</Text></View>
        <Text style={styles.liveBadge}>已按当前权限加载</Text>
      </View>
      {error === null ? null : <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button label="重试加载" secondary onPress={() => void load()} /></View>}
      {success === null ? null : <Text style={styles.success}>{success}</Text>}
      {requestedWrite === null ? null : <WriteActionPreviewCard adapter={executionAdapter} key={requestedWrite.preview.id} onCancel={() => setRequestedWrite(null)} onModify={() => setRequestedWrite(null)} preview={requestedWrite.preview} />}
      {(mode === 'student_score' || mode === 'family_growth') ? <StudentScorePanel requestWrite={requestWrite} roleScope={roleScope} snapshot={snapshot} /> : null}
      {mode === 'class_score' ? <ClassScorePanel requestWrite={requestWrite} roleScope={roleScope} snapshot={snapshot} /> : null}
      {(mode === 'wallet' || mode === 'family_wallet' || mode === 'teacher_wallet') ? <WalletPanel requestWrite={requestWrite} roleScope={roleScope} snapshot={snapshot} /> : null}
    </View>
  );
}

function validInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed !== 0 && Math.abs(parsed) <= 1_000;
}

function validPositiveInteger(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1_000_000;
}

function studentName(snapshot: GovernanceSnapshot, studentId: string): string {
  return snapshot.students.find((item) => item.id === studentId)?.name ?? '当前绑定学生';
}

function fineStatus(status: GovernanceSnapshot['fineOrders'][number]['status']): string {
  return { cancelled: '已取消', pending: '待处理', reversed: '已撤销', settled: '已结算' }[status];
}

function appealStatus(status: GovernanceSnapshot['appeals'][number]['status']): string {
  return { accepted: '已接受', pending: '待处理', rejected: '已拒绝' }[status];
}

function transactionKind(kind: GovernanceSnapshot['transactions'][number]['kind']): string {
  return { adjust: '账户调整', deduct: '扣除', fine_settle: '罚款结算', grant: '发放', reversal: '撤销返还' }[kind];
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderColor: theme.color.brand.primary, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  buttonText: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  categoryBadge: { backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.pill, color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', overflow: 'hidden', paddingHorizontal: theme.space.sm, paddingVertical: 4 },
  categoryBadgeNegative: { backgroundColor: theme.color.surface.secondaryTint, color: theme.color.brand.secondary },
  categoryCard: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: '46%', flexGrow: 1, gap: 5, minHeight: 100, minWidth: 180, padding: theme.space.base },
  categoryCardSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  categoryCardStatic: { backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: '46%', flexGrow: 1, gap: 5, minWidth: 180, padding: theme.space.base },
  categoryDefault: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '900', marginTop: 2 },
  categoryDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  categoryName: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '800' },
  choice: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, minHeight: 42, paddingHorizontal: theme.space.base, paddingVertical: 10 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  choiceSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  choiceText: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '600' },
  dangerButton: { backgroundColor: theme.color.text.primary, borderColor: theme.color.text.primary },
  disabled: { opacity: 0.45 },
  directionButton: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 120, paddingHorizontal: theme.space.md },
  directionButtonNegative: { backgroundColor: theme.color.surface.secondaryTint, borderColor: theme.color.brand.secondary },
  directionButtonSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  directionButtonText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '800' },
  directionButtonTextSelected: { color: theme.color.text.primary },
  directionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  empty: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 22 },
  error: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  feedback: { alignItems: 'center', backgroundColor: theme.color.surface.secondaryTint, borderRadius: theme.radius.control, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, padding: theme.space.base },
  fieldGroup: { flex: 1, gap: theme.space.xs, minWidth: 180 },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  focused: { borderColor: theme.color.brand.secondary, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  headingCopy: { flex: 1, minWidth: 0 },
  heroMetric: { alignItems: 'flex-start', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, padding: theme.space.lg },
  heroValue: { color: theme.color.brand.primary, fontSize: 36, fontWeight: '900' },
  hovered: { opacity: 0.88 },
  iconBox: { alignItems: 'center', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, height: 42, justifyContent: 'center', width: 42 },
  input: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, color: theme.color.text.primary, fontSize: theme.text.size.sm, minHeight: 44, minWidth: 0, paddingHorizontal: theme.space.base },
  liveBadge: { alignSelf: 'flex-start', backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.pill, color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', overflow: 'hidden', paddingHorizontal: theme.space.base, paddingVertical: theme.space.xs },
  metric: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, flex: 1, minWidth: 135, padding: theme.space.base },
  metricLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 4 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  metricValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '900' },
  multiline: { minHeight: 78, paddingVertical: theme.space.sm, textAlignVertical: 'top' },
  panel: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.base, minWidth: 0, padding: theme.space.lg },
  panelDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 19, marginTop: 3 },
  panelHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  panelTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  rank: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '900', width: 44 },
  rankingRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, minHeight: 48 },
  record: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, gap: 4, padding: theme.space.base },
  recordHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'space-between' },
  recordMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  recordTitle: { color: theme.color.text.primary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  resetButton: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.base },
  resetButtonText: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '800' },
  scoreAdjustButton: { alignItems: 'center', backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  scoreAdjustButtonText: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  scoreAdjustRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  scoreFormColumn: { flex: 1, gap: theme.space.base, minWidth: 0 },
  scoreInput: { maxWidth: 112, minWidth: 84, textAlign: 'center' },
  scoreStep: { borderBottomColor: theme.color.border.default, borderBottomWidth: 1, gap: theme.space.sm, paddingBottom: theme.space.base },
  scoreSummary: { alignSelf: 'flex-start', backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.base, padding: theme.space.lg, width: 310 },
  scoreSummaryCompact: { alignSelf: 'stretch', padding: theme.space.md, width: '100%' },
  scoreTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 3, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.base },
  scoreTabSelected: { borderBottomColor: theme.color.brand.primary },
  scoreTabText: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, fontWeight: '700' },
  scoreTabTextSelected: { color: theme.color.brand.primary, fontWeight: '900' },
  scoreTabs: { borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs },
  scoreView: { gap: theme.space.base, minWidth: 0 },
  scoreWorkbench: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.space.lg, minWidth: 0 },
  scoreWorkbenchCompact: { flexDirection: 'column' },
  sectionHeadingCompact: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.space.sm },
  scopeBanner: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base, padding: theme.space.base },
  scopeMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 3 },
  scopeTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '900' },
  score: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '900' },
  negativeScore: { color: theme.color.brand.secondary },
  secondaryButton: { backgroundColor: theme.color.surface.card, borderColor: theme.color.brand.primary },
  secondaryButtonText: { color: theme.color.brand.primary },
  status: { color: theme.color.brand.secondary, fontSize: theme.text.size.xs, fontWeight: '800' },
  stepDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 19, marginTop: 2 },
  stepHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  stepNumber: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.pill, color: theme.color.surface.card, fontSize: theme.text.size.xs, fontWeight: '900', height: 28, lineHeight: 28, overflow: 'hidden', textAlign: 'center', width: 28 },
  studentChoice: { alignItems: 'center', backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flexBasis: '30%', flexDirection: 'row', flexGrow: 1, gap: theme.space.sm, minHeight: 42, minWidth: 140, paddingHorizontal: theme.space.base },
  studentChoiceSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  studentChoiceText: { color: theme.color.text.secondary, flex: 1, fontSize: theme.text.size.sm, fontWeight: '700' },
  studentChoiceTextSelected: { color: theme.color.brand.primary },
  studentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, paddingRight: theme.space.xs },
  studentPickerScroll: { maxHeight: 190 },
  subsection: { borderTopColor: theme.color.border.default, borderTopWidth: 1, gap: theme.space.sm, paddingTop: theme.space.base },
  subTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  success: { backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.control, color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '800', padding: theme.space.base },
  summaryDelta: { color: theme.color.brand.primary, fontSize: 34, fontWeight: '900' },
  summaryDeltaNegative: { color: theme.color.brand.secondary },
  summaryEyebrow: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '900', letterSpacing: 0.8 },
  summaryHint: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 19 },
  summaryLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  summaryReason: { backgroundColor: theme.color.surface.card, borderRadius: theme.radius.control, gap: 5, padding: theme.space.base },
  summaryReasonText: { color: theme.color.text.primary, fontSize: theme.text.size.sm, lineHeight: 20 },
  summaryRow: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', gap: theme.space.sm, justifyContent: 'space-between', paddingBottom: theme.space.sm },
  summaryTitle: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '900' },
  summaryValue: { color: theme.color.text.primary, flexShrink: 1, fontSize: theme.text.size.sm, fontWeight: '800', textAlign: 'right' },
  validationText: { color: theme.color.brand.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  workspace: { gap: theme.space.base, minWidth: 0 },
  workspaceCompact: { width: '100%' },
});
