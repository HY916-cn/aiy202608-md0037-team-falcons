import type { RoleCode } from '@dolphincloud/auth';
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
  TodaySummaryCard,
  WriteActionPreviewCard,
  theme,
} from '@dolphincloud/ui';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useExperience } from './ExperienceProvider';

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
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, disabled && styles.disabled]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function TodaySummarySection({ role }: { readonly role: RoleCode }) {
  const { summaryDataSource } = useExperience();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await resolveLoadableState(
      () => summaryDataSource.load(role),
      (data) => data.items.length === 0,
    );
    if (result.status === 'error') {
      setError('今日摘要加载失败，请重试。');
    } else {
      setSummary(result.data);
    }
    setIsLoading(false);
  }, [role, summaryDataSource]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return <TodaySummaryCard errorMessage={error} isLoading={isLoading} onRetry={() => void load()} summary={summary} />;
}

function AiExperienceSection({ role }: { readonly role: RoleCode }) {
  const { aiAdapter } = useExperience();
  const [snapshot, setSnapshot] = useState<AiExperienceSnapshot>(() => aiAdapter.getSnapshot());
  const [prompt, setPrompt] = useState('整理今天的教学信息');

  useEffect(() => aiAdapter.subscribe(setSnapshot), [aiAdapter]);
  useEffect(() => {
    void aiAdapter.selectActiveRole(role);
  }, [aiAdapter, role]);

  const writeExecutionAdapter = useMemo<WriteActionExecutionAdapter>(
    () => ({ execute: async () => aiAdapter.confirmAction(true) }),
    [aiAdapter],
  );

  return (
    <View style={styles.section}>
      <DolphinMascotCard snapshot={snapshot} />
      <TextInput onChangeText={setPrompt} style={styles.input} value={prompt} />
      <View style={styles.actions}>
        <ActionButton label="开始聆听" onPress={() => aiAdapter.startListening()} />
        <ActionButton label="生成预览" onPress={() => void aiAdapter.submit(prompt)} />
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

function TeachingDemoSection({ role }: { readonly role: RoleCode }) {
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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await resolveLoadableState(
      () => teachingAdapter.load(role),
      (data) => data.classes.length === 0,
    );
    if (result.status === 'error') {
      setError('教学数据加载失败，请重试。');
    } else {
      const next = result.data;
      setSnapshot(next);
      setSelectedClassId((current) => current ?? next.classes[0]?.id ?? null);
    }
    setIsLoading(false);
  }, [role, teachingAdapter]);

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
      <Text style={styles.sectionTitle}>教学演示</Text>
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
          <Text style={styles.fieldLabel}>选择班级</Text>
          <View style={styles.actions}>
            {snapshot.classes.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedClassId(item.id)} style={[styles.classButton, selectedClassId === item.id && styles.classButtonSelected]}>
                <Text style={styles.classLabel}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput onChangeText={setTitle} style={styles.input} value={title} />
          <ActionButton label="选择课件文件" onPress={() => void pickFile()} />
          <ActionButton
            disabled={selectedClassId === null || selectedFile === null || isPending}
            label="上传并发送到班级"
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

      {role === 'class_terminal' || role === 'family' ? (
        <>
          <Text style={styles.fieldLabel}>课件</Text>
          {snapshot.courseware.length === 0 ? <Text style={styles.helper}>暂无已发送课件。</Text> : snapshot.courseware.map((item) => <Text key={item.id} style={styles.listItem}>{item.title}</Text>)}
          <Text style={styles.fieldLabel}>已发布作业</Text>
          {snapshot.assignments.length === 0 ? <Text style={styles.helper}>暂无已发布作业。</Text> : snapshot.assignments.map((item) => <Text key={item.id} style={styles.listItem}>{item.title} · 截止 {new Date(item.dueAt).toLocaleString()}</Text>)}
          {role === 'family' ? (
            <>
              <Text style={styles.fieldLabel}>绑定学生已发布成绩</Text>
              {snapshot.grades.length === 0 ? <Text style={styles.helper}>暂无已发布成绩。</Text> : snapshot.grades.map((grade) => <Text key={grade.id} style={styles.listItem}>{grade.studentName} · {grade.score}</Text>)}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function RoleExperienceSections({ role }: { readonly role: RoleCode }) {
  return (
    <>
      <TodaySummarySection role={role} />
      {role === 'teacher' || role === 'class_terminal' || role === 'family' ? <TeachingDemoSection role={role} /> : null}
      <AiExperienceSection role={role} />
    </>
  );
}

const styles = StyleSheet.create({
  actionButton: { backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  actionLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  classButton: { borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, minHeight: 44, padding: theme.space.md },
  classButtonSelected: { borderColor: theme.color.brand.primary, borderWidth: 2 },
  classLabel: { color: theme.color.text.primary, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: theme.color.text.primary, fontWeight: '600' },
  feedbackBox: { gap: theme.space.sm },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '700', marginTop: theme.space.sm },
  helper: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  input: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, color: theme.color.text.primary, minHeight: 46, paddingHorizontal: theme.space.md },
  itemTitle: { color: theme.color.text.primary, fontWeight: '600' },
  listItem: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, color: theme.color.text.primary, gap: theme.space.sm, padding: theme.space.md },
  multiline: { minHeight: 88, paddingVertical: theme.space.md, textAlignVertical: 'top' },
  section: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.md, padding: theme.space.lg },
  sectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '700' },
  success: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
});
