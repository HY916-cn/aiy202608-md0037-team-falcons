import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';
import { resolveLoadableState } from '@dolphincloud/experience';
import type {
  AiExperienceSnapshot,
  TeachingDemoSnapshot,
  TeachingFilePayload,
  TodaySummary,
  WriteActionExecutionAdapter,
  WriteActionPreview,
} from '@dolphincloud/experience';
import type { CoursewareFileMetadata } from '@dolphincloud/domain';
import {
  AiResultCard,
  DolphinMascotCard,
  InteractivePressable,
  type RoleNavigationKey,
  TodaySummaryCard,
  WriteActionPreviewCard,
  theme,
} from '@dolphincloud/ui';
import * as DocumentPicker from 'expo-document-picker';
import {
  Bot,
  ChartColumn,
  ClipboardList,
  FolderUp,
  History,
  Star,
  Trophy,
  UsersRound,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useExperience } from './ExperienceProvider';
import { RoleDashboardOverview } from './RoleDashboardOverview';
import {
  countStudentsForClass,
  resolveTeachingSectionPresentation,
} from './roleTeachingPresentation';

const EMPTY_SNAPSHOT: TeachingDemoSnapshot = {
  assignments: [],
  classes: [],
  courseware: [],
  grades: [],
  students: [],
};

type PendingWriteAction = {
  readonly execute: () => Promise<void>;
  readonly preview: WriteActionPreview;
  readonly successMessage: string;
};

function ActionButton({
  disabled = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <InteractivePressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ focused, hovered, pressed }) => [
        styles.actionButton,
        hovered && styles.interactiveHover,
        focused && styles.interactiveFocus,
        pressed && styles.interactivePressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </InteractivePressable>
  );
}

function TodaySummarySection({ roleScope }: { readonly roleScope: AuthRoleScope }) {
  const { summaryDataSource } = useExperience();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSummary(null);
    const result = await resolveLoadableState(
      () => summaryDataSource.load(roleScope),
      (data) => data.items.length === 0,
    );
    if (result.status === 'error') {
      setError('今日摘要加载失败，请重试。');
    } else {
      setSummary(result.data);
    }
    setIsLoading(false);
  }, [roleScope, summaryDataSource]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <TodaySummaryCard
      errorMessage={error}
      isLoading={isLoading}
      onRetry={() => void load()}
      summary={summary}
    />
  );
}

function AiExperienceSection({ roleScope }: { readonly roleScope: AuthRoleScope }) {
  const { aiAdapter } = useExperience();
  const [snapshot, setSnapshot] = useState<AiExperienceSnapshot>(() => aiAdapter.getSnapshot());
  const [prompt, setPrompt] = useState('整理今天的教学信息');

  useEffect(() => aiAdapter.subscribe(setSnapshot), [aiAdapter]);
  useEffect(() => {
    void aiAdapter.selectActiveRole(roleScope);
  }, [aiAdapter, roleScope]);

  const writeExecutionAdapter = useMemo<WriteActionExecutionAdapter>(
    () => ({ execute: async () => aiAdapter.confirmAction(true) }),
    [aiAdapter],
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <Bot color={theme.color.brand.secondary} size={20} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>AI 中心</Text>
          <Text style={styles.sectionDescription}>
            海豚助手可以整理信息；涉及写操作时仍需你确认。
          </Text>
        </View>
      </View>
      <DolphinMascotCard snapshot={snapshot} />
      <View style={styles.aiComposer}>
        <TextInput
          accessibilityLabel="发送给海豚助手的内容"
          onChangeText={setPrompt}
          placeholder="输入你想查询或整理的内容"
          placeholderTextColor={theme.color.text.disabled}
          style={[styles.input, styles.aiInput]}
          value={prompt}
        />
        <ActionButton label="生成预览" onPress={() => void aiAdapter.submit(prompt)} />
      </View>
      <View style={styles.actions}>
        <ActionButton label="开始聆听" onPress={() => aiAdapter.startListening()} />
        <ActionButton label="重置" onPress={() => aiAdapter.reset()} />
      </View>
      <AiResultCard snapshot={snapshot} />
      {snapshot.actionPreview === null ? null : (
        <WriteActionPreviewCard
          adapter={writeExecutionAdapter}
          onCancel={() => void aiAdapter.cancelAction()}
          onModify={() => void aiAdapter.returnToModify()}
          preview={snapshot.actionPreview}
        />
      )}
    </View>
  );
}

function TeachingDemoSection({
  activeNavigation,
  role,
  roleScope,
}: {
  readonly activeNavigation: RoleNavigationKey;
  readonly role: RoleCode;
  readonly roleScope: AuthRoleScope;
}) {
  const { teachingAdapter } = useExperience();
  const [snapshot, setSnapshot] = useState<TeachingDemoSnapshot>(EMPTY_SNAPSHOT);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<TeachingFilePayload | null>(null);
  const [title, setTitle] = useState('合成演示教学内容');
  const [content, setContent] = useState('完成合成练习内容。');
  const [score, setScore] = useState('92');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [pendingWrite, setPendingWrite] = useState<PendingWriteAction | null>(
    null,
  );
  const presentation = resolveTeachingSectionPresentation(role, activeNavigation);
  const SectionIcon =
    presentation.mode === 'class_performance' ? Star : FolderUp;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setSelectedClassId(null);
    const result = await resolveLoadableState(
      () => teachingAdapter.load(roleScope),
      (data) => data.classes.length === 0,
    );
    if (result.status === 'error') {
      setError('教学数据加载失败，请重试。');
    } else {
      const next = result.data;
      setSnapshot(next);
      setSelectedClassId(next.classes[0]?.id ?? null);
    }
    setIsLoading(false);
  }, [roleScope, teachingAdapter]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const selectedStudents = useMemo(
    () => snapshot.students.filter((student) => student.classId === selectedClassId),
    [selectedClassId, snapshot.students],
  );

  const runAction = useCallback(
    async (successMessage: string, action: () => Promise<void>) => {
      if (isPending) {
        throw new Error('PENDING');
      }
      setIsPending(true);
      setError(null);
      setFeedback(null);
      try {
        await action();
        setFeedback(successMessage);
        await load();
      } catch (cause) {
        setError('操作失败，请检查输入后重试。');
        throw cause;
      } finally {
        setIsPending(false);
      }
    },
    [isPending, load],
  );

  const writeExecutionAdapter = useMemo<WriteActionExecutionAdapter>(
    () => ({
      execute: async (previewId) => {
        if (pendingWrite === null || pendingWrite.preview.id !== previewId) {
          throw new Error('INVALID_PREVIEW');
        }
        await runAction(pendingWrite.successMessage, pendingWrite.execute);
        setPendingWrite(null);
      },
    }),
    [pendingWrite, runAction],
  );

  const requestWrite = (
    operationType: string,
    targets: readonly string[],
    impact: readonly string[],
    parameterSummary: readonly string[],
    execute: () => Promise<void>,
    successMessage: string,
    isDangerous = false,
  ) => {
    const selectedClass = snapshot.classes.find(
      (item) => item.id === selectedClassId,
    );
    setPendingWrite({
      execute,
      preview: {
        id: `${operationType}:${targets.join(':')}`,
        impact,
        isDangerous,
        operationType,
        parameterSummary,
        permissionScope: selectedClass?.name ?? '当前教学权限范围',
        role: 'teacher',
        targets,
      },
      successMessage,
    });
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.assets?.[0];
      if (asset === undefined) return;
      const body =
        asset.file ?? (await (await fetch(asset.uri)).arrayBuffer());
      setSelectedFile({
        body,
        metadata: {
          mimeType: (asset.mimeType ??
            'application/pdf') as CoursewareFileMetadata['mimeType'],
          originalFilename: asset.name,
          sizeBytes:
            asset.size ?? (body instanceof Blob ? body.size : body.byteLength),
        },
      });
      setFeedback(`已选择文件：${asset.name}`);
    } catch {
      setError('文件读取失败，请重新选择。');
    }
  };

  if (isLoading) {
    return <Text style={styles.helper}>正在加载教学演示数据……</Text>;
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}>
          <SectionIcon color={theme.color.brand.primary} size={20} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>{presentation.title}</Text>
          <Text style={styles.sectionDescription}>{presentation.description}</Text>
        </View>
      </View>
      {error === null ? null : (
        <View style={styles.feedbackBox}>
          <Text style={styles.error}>{error}</Text>
          <ActionButton label="重试" onPress={() => void load()} />
        </View>
      )}
      {feedback === null ? null : <Text style={styles.success}>{feedback}</Text>}
      {snapshot.classes.length === 0 ? <Text style={styles.helper}>当前角色暂无教学数据。</Text> : null}

      {pendingWrite === null ? null : (
        <WriteActionPreviewCard
          adapter={writeExecutionAdapter}
          key={pendingWrite.preview.id}
          onCancel={() => setPendingWrite(null)}
          onModify={() => setPendingWrite(null)}
          preview={pendingWrite.preview}
        />
      )}

      {role === 'teacher' ? (
        <>
          <View style={styles.classSelectorRow}>
            <Text style={styles.fieldLabel}>当前班级</Text>
            <View style={styles.actions}>
            {snapshot.classes.map((item) => (
              <InteractivePressable
                key={item.id}
                onPress={() => setSelectedClassId(item.id)}
                style={({ focused, hovered, pressed }) => [
                  styles.classButton,
                  selectedClassId === item.id && styles.classButtonSelected,
                  hovered && styles.interactiveHover,
                  focused && styles.interactiveFocus,
                  pressed && styles.interactivePressed,
                ]}
              >
                <Text style={styles.classLabel}>{item.name}</Text>
              </InteractivePressable>
            ))}
            </View>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureHeading}>
            <FolderUp color={theme.color.brand.primary} size={18} />
            <View><Text style={styles.featureTitle}>课件</Text><Text style={styles.featureDescription}>教师与班级之间的教学文件传输</Text></View>
          </View>
          <Text style={styles.fieldLabel}>课件标题</Text>
          <TextInput onChangeText={setTitle} style={styles.input} value={title} />
          <View style={styles.actions}>
            <ActionButton label="选择课件文件" onPress={() => void pickFile()} />
            <ActionButton
              disabled={selectedClassId === null || selectedFile === null || isPending}
              label="发送到班级"
              onPress={() =>
              requestWrite(
                'courseware.send',
                [snapshot.classes.find((item) => item.id === selectedClassId)?.name ?? '当前班级'],
                ['上传私有课件并发送到所选班级'],
                [`文件：${selectedFile?.metadata.originalFilename ?? ''}`, `标题：${title}`],
                () => teachingAdapter.sendCourseware({ classId: selectedClassId!, file: selectedFile!, subject: '数学', title }),
                '课件已发送。',
              )
            }
            />
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureHeading}>
            <ClipboardList color={theme.color.brand.primary} size={18} />
            <View><Text style={styles.featureTitle}>作业</Text><Text style={styles.featureDescription}>先保存草稿，确认后再发布到家庭端</Text></View>
          </View>
          <Text style={styles.fieldLabel}>作业内容</Text>
          <TextInput multiline onChangeText={setContent} style={[styles.input, styles.multiline]} value={content} />
          <ActionButton
            disabled={selectedClassId === null || isPending}
            label="创建作业草稿"
            onPress={() => {
              const dueAt = new Date(Date.now() + 86400000).toISOString();
              requestWrite(
                'assignment.create_draft',
                [snapshot.classes.find((item) => item.id === selectedClassId)?.name ?? '当前班级'],
                ['创建仅教师可见的作业草稿'],
                [`标题：${title}`, `截止：${dueAt}`],
                () => teachingAdapter.createAssignmentDraft({ classId: selectedClassId!, content, dueAt, subject: '数学', title }),
                '作业草稿已创建。',
              );
            }}
          />
          {snapshot.assignments.map((item) => (
            <View key={item.id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{item.title} · {item.status}</Text>
              {item.status === 'draft' ? (
                <View style={styles.actions}>
                  <ActionButton label="编辑草稿" onPress={() => requestWrite('assignment.update_draft', [item.title], ['修改作业草稿内容'], [`截止：${item.dueAt}`], () => teachingAdapter.updateAssignmentDraft(item.id, { content: `${item.content}（已编辑）`, dueAt: item.dueAt, title: `${item.title}（已编辑）` }), '作业草稿已编辑。')} />
                  <ActionButton label="发布作业" onPress={() => requestWrite('assignment.publish', [item.title], ['班级端和绑定家庭端将可见'], [`截止：${item.dueAt}`], () => teachingAdapter.publishAssignment(item.id), '作业已发布。', true)} />
                </View>
              ) : null}
            </View>
          ))}
          <View style={styles.featureDivider} />
          <View style={styles.featureHeading}>
            <ChartColumn color={theme.color.brand.primary} size={18} />
            <View><Text style={styles.featureTitle}>成绩</Text><Text style={styles.featureDescription}>成绩发布后仅绑定家庭可见</Text></View>
          </View>
          <Text style={styles.fieldLabel}>成绩分数</Text>
          <TextInput inputMode="decimal" onChangeText={setScore} style={styles.input} value={score} />
          <ActionButton
            disabled={selectedClassId === null || selectedStudents[0] === undefined || isPending}
            label="创建成绩草稿"
            onPress={() => requestWrite('grade.create_draft', [selectedStudents[0]?.name ?? '绑定学生'], ['创建仅教师可见的成绩草稿'], [`分数：${score}`, `测验：${title}`], () => teachingAdapter.createGradeDraft({ classId: selectedClassId!, comment: '合成演示评语', score: Number(score), studentId: selectedStudents[0]!.id, subject: '数学', title }), '成绩草稿已创建。')}
          />
          {snapshot.grades.map((grade) => (
            <View key={grade.id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{grade.studentName} · {grade.score} · {grade.status}</Text>
              <View style={styles.actions}>
                {grade.status === 'draft' ? <ActionButton label="发布成绩" onPress={() => requestWrite('grade.publish', [grade.studentName], ['绑定家庭端将可见该成绩'], [`分数：${grade.score}`, `测验：${grade.assessmentTitle}`], () => teachingAdapter.publishGrade(grade.id), '成绩已发布。', true)} /> : null}
                {grade.status === 'published' ? <ActionButton label="修订成绩" onPress={() => requestWrite('grade.revise', [grade.studentName], ['修改已发布成绩并产生修订历史'], [`原分数：${grade.score}`, `新分数：${grade.score + 1}`, '原因：现场演示复核'], () => teachingAdapter.reviseGrade({ comment: '复核后的合成评语', gradeId: grade.id, reason: '现场演示复核', score: grade.score + 1 }), '成绩已修订并记录原因。', true)} /> : null}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {role === 'class_terminal' && presentation.mode === 'class_performance' ? (
        <>
          <View style={styles.performanceGrid}>
            <View style={styles.performanceCard}>
              <UsersRound color={theme.color.brand.primary} size={19} />
              <Text style={styles.performanceValue}>
                {snapshot.classes.reduce(
                  (count, item) => count + countStudentsForClass(snapshot, item.id),
                  0,
                )}
              </Text>
              <Text style={styles.performanceLabel}>学生档案</Text>
            </View>
            <View style={styles.performanceCard}>
              <Star color={theme.color.brand.primary} size={19} />
              <Text style={styles.performancePending}>待治理服务接入</Text>
              <Text style={styles.performanceLabel}>班级分</Text>
            </View>
            <View style={styles.performanceCard}>
              <Trophy color={theme.color.brand.primary} size={19} />
              <Text style={styles.performancePending}>待治理服务接入</Text>
              <Text style={styles.performanceLabel}>班内排行</Text>
            </View>
            <View style={styles.performanceCard}>
              <History color={theme.color.brand.primary} size={19} />
              <Text style={styles.performancePending}>暂无真实记录</Text>
              <Text style={styles.performanceLabel}>表现记录</Text>
            </View>
          </View>
          <Text style={styles.fieldLabel}>当前班级学生</Text>
          {snapshot.students.map((student) => (
            <View key={student.id} style={styles.listItem}>
              <Text style={styles.itemTitle}>{student.name}</Text>
            </View>
          ))}
        </>
      ) : null}

      {role === 'class_terminal' && presentation.mode === 'courseware' ? (
        <>
          <Text style={styles.fieldLabel}>课件</Text>
          {snapshot.courseware.length === 0 ? (
            <Text style={styles.helper}>暂无已发送课件。</Text>
          ) : (
            snapshot.courseware.map((item) => (
              <Text key={item.id} style={styles.listItem}>{item.title}</Text>
            ))
          )}
        </>
      ) : null}

      {(role === 'class_terminal' || role === 'family') &&
      presentation.mode === 'assignment' ? (
        <>
          <Text style={styles.fieldLabel}>已发布作业</Text>
          {snapshot.assignments.length === 0 ? (
            <Text style={styles.helper}>暂无已发布作业。</Text>
          ) : (
            snapshot.assignments.map((item) => (
              <Text key={item.id} style={styles.listItem}>
                {item.title} · 截止 {new Date(item.dueAt).toLocaleString()}
              </Text>
            ))
          )}
        </>
      ) : null}

      {role === 'family' && presentation.mode === 'growth' ? (
        <>
          <Text style={styles.fieldLabel}>绑定学生已发布成绩</Text>
          {snapshot.grades.length === 0 ? (
            <Text style={styles.helper}>暂无已发布成绩。</Text>
          ) : (
            snapshot.grades.map((grade) => (
              <Text key={grade.id} style={styles.listItem}>
                {grade.studentName} · {grade.score}
              </Text>
            ))
          )}
        </>
      ) : null}
    </View>
  );
}

export function RoleExperienceSections({
  activeNavigation,
  onNavigate,
  role,
  roleScope,
}: {
  readonly activeNavigation: RoleNavigationKey;
  readonly onNavigate: (key: RoleNavigationKey) => void;
  readonly role: RoleCode;
  readonly roleScope: AuthRoleScope;
}) {
  if (activeNavigation === 'home') {
    return (
      <>
        <RoleDashboardOverview
          onNavigate={onNavigate}
          role={role}
          roleScope={roleScope}
        />
        <TodaySummarySection roleScope={roleScope} />
      </>
    );
  }

  if (activeNavigation === 'ai') {
    return <AiExperienceSection roleScope={roleScope} />;
  }

  if (
    (role === 'teacher' || role === 'class_terminal' || role === 'family') &&
    ['courseware', 'assignment', 'class', 'growth'].includes(activeNavigation)
  ) {
    return (
      <TeachingDemoSection
        activeNavigation={activeNavigation}
        role={role}
        roleScope={roleScope}
      />
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>当前功能尚未接入业务服务</Text>
      <Text style={styles.sectionDescription}>
        权限范围：{roleScope.label}。为避免展示伪造数据或无效按钮，服务完成接入前仅保留明确边界说明。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  actionLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  aiComposer: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  aiInput: { flex: 1 },
  classButton: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: theme.space.base },
  classButtonSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  classLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  classSelectorRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  disabled: { opacity: 0.5 },
  error: { color: theme.color.text.primary, fontWeight: '600' },
  feedbackBox: { gap: theme.space.sm },
  featureDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  featureDivider: { backgroundColor: theme.color.border.default, height: 1, marginVertical: theme.space.sm },
  featureHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  featureTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700', marginTop: theme.space.xs },
  helper: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  input: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, color: theme.color.text.primary, fontSize: theme.text.size.sm, minHeight: 46, paddingHorizontal: theme.space.md },
  itemTitle: { color: theme.color.text.primary, fontWeight: '600' },
  interactiveFocus: { borderColor: theme.color.brand.primary, shadowColor: theme.color.brand.primary, shadowOpacity: 0.2, shadowRadius: 4 },
  interactiveHover: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  interactivePressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  listItem: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, color: theme.color.text.primary, gap: theme.space.sm, padding: theme.space.base },
  multiline: { minHeight: 88, paddingVertical: theme.space.md, textAlignVertical: 'top' },
  performanceCard: { backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flex: 1, gap: theme.space.xs, minWidth: 180, padding: theme.space.md },
  performanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  performanceLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  performancePending: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  performanceValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '800' },
  section: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.md, padding: theme.space.lg },
  sectionDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, marginTop: 3 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  sectionHeadingCopy: { flex: 1 },
  sectionIcon: { alignItems: 'center', backgroundColor: theme.color.surface.secondaryTint, borderRadius: theme.radius.control, height: 40, justifyContent: 'center', width: 40 },
  sectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  success: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
});
