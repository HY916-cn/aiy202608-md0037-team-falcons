import { ROLE_LABELS, type AuthRoleScope, type RoleCode } from '@dolphincloud/auth';
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
  AiAuditResultCard,
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
import {
  AiConversationScopeGuard,
  createEmptyAiConversationViewState,
  getAiConversationScopeKey,
  type AiConversationMessage,
} from './aiConversationScope';
import { AI_ROLE_GUIDANCE } from './aiRoleGuidance';
import { GradeReportSection } from '../grades';
import {
  GovernanceExperienceSection,
  resolveGovernanceExperienceMode,
} from '../governance';
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
  const [prompt, setPrompt] = useState(
    () => createEmptyAiConversationViewState().prompt,
  );
  const [messages, setMessages] = useState<readonly AiConversationMessage[]>(
    () => createEmptyAiConversationViewState().messages,
  );
  const [isScopeReady, setIsScopeReady] = useState(false);
  const scopeGuard = useMemo(() => new AiConversationScopeGuard(), []);
  const guidance = AI_ROLE_GUIDANCE[roleScope.role];
  const assignmentId = roleScope.assignmentId;
  const scopeId = roleScope.id;
  const scopeLabel = roleScope.label;
  const scopeRole = roleScope.role;
  const scopeType = roleScope.type;

  useEffect(() => aiAdapter.subscribe(setSnapshot), [aiAdapter]);
  useEffect(() => {
    const generation = scopeGuard.beginScopeChange();
    aiAdapter.newConversation();
    void aiAdapter
      .selectActiveRole({
        assignmentId,
        id: scopeId,
        label: scopeLabel,
        role: scopeRole,
        type: scopeType,
      })
      .then((isReady) => {
        if (scopeGuard.isCurrent(generation)) setIsScopeReady(isReady);
      })
      .catch(() => {
        if (scopeGuard.isCurrent(generation)) setIsScopeReady(false);
      });
    return () => {
      scopeGuard.invalidate();
    };
  }, [
    aiAdapter,
    assignmentId,
    scopeGuard,
    scopeId,
    scopeLabel,
    scopeRole,
    scopeType,
  ]);

  const submit = async (nextPrompt: string) => {
    const normalized = nextPrompt.trim();
    if (
      normalized.length === 0 ||
      !isScopeReady ||
      snapshot.state === 'thinking'
    ) {
      return;
    }
    const generation = scopeGuard.beginScopeChange();
    setMessages((current) => [
      ...current,
      { content: normalized, id: `user-${Date.now()}`, role: 'user' },
    ]);
    setPrompt('');
    await aiAdapter.submit(normalized);
    if (!scopeGuard.isCurrent(generation)) return;
    const next = aiAdapter.getSnapshot();
    if (next.result !== null && next.state !== 'offline' && next.state !== 'error') {
      setMessages((current) => [
        ...current,
        { content: next.result!, id: `assistant-${Date.now()}`, role: 'assistant' },
      ]);
    }
  };

  const retry = async () => {
    if (!isScopeReady) return;
    const generation = scopeGuard.beginScopeChange();
    await aiAdapter.retry();
    if (!scopeGuard.isCurrent(generation)) return;
    const next = aiAdapter.getSnapshot();
    if (next.result !== null && next.state !== 'offline' && next.state !== 'error') {
      setMessages((current) => [
        ...current,
        { content: next.result!, id: `assistant-${Date.now()}`, role: 'assistant' },
      ]);
    }
  };

  const newConversation = () => {
    scopeGuard.beginScopeChange();
    aiAdapter.newConversation();
    setMessages([]);
    setPrompt('');
  };

  const writeExecutionAdapter = useMemo<WriteActionExecutionAdapter>(
    () => ({
      execute: async (previewId) => aiAdapter.confirmAction(previewId, true),
    }),
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
            在当前角色和数据范围内查询信息；涉及写操作时必须再次确认。
          </Text>
        </View>
      </View>
      <View style={styles.aiScopeBar}>
        <Text style={styles.aiScopeLabel}>当前身份：{ROLE_LABELS[roleScope.role]}</Text>
        <Text style={styles.aiScopeLabel}>权限范围：{roleScope.label}</Text>
      </View>
      <DolphinMascotCard snapshot={snapshot} />
      <View style={styles.aiGuidance}>
        <Text style={styles.fieldLabel}>建议问题</Text>
        <View style={styles.actions}>
          {guidance.suggestions.map((suggestion) => (
            <InteractivePressable
              accessibilityRole="button"
              disabled={!isScopeReady || snapshot.state === 'thinking' || snapshot.state === 'offline'}
              key={suggestion}
              onPress={() => void submit(suggestion)}
              style={({ focused, hovered, pressed }) => [
                styles.suggestionButton,
                hovered && styles.interactiveHover,
                focused && styles.interactiveFocus,
                pressed && styles.interactivePressed,
              ]}
            >
              <Text style={styles.suggestionLabel}>{suggestion}</Text>
            </InteractivePressable>
          ))}
        </View>
        <Text style={styles.aiWriteHint}>{guidance.writeHint}</Text>
      </View>
      <View style={styles.aiComposer}>
        <TextInput
          accessibilityLabel="发送给海豚助手的内容"
          editable={isScopeReady && snapshot.state !== 'thinking' && snapshot.state !== 'offline'}
          onChangeText={setPrompt}
          placeholder="输入你想查询或整理的内容"
          placeholderTextColor={theme.color.text.disabled}
          style={[styles.input, styles.aiInput]}
          value={prompt}
        />
        <ActionButton
          disabled={!isScopeReady || prompt.trim().length === 0 || snapshot.state === 'thinking' || snapshot.state === 'offline'}
          label={snapshot.state === 'thinking' ? '正在发送…' : '发送'}
          onPress={() => void submit(prompt)}
        />
      </View>
      <View style={styles.actions}>
        {snapshot.state === 'thinking' ? (
          <ActionButton label="取消等待" onPress={() => aiAdapter.cancelRequest()} />
        ) : null}
        {snapshot.state === 'error' || snapshot.state === 'offline' ? (
          <ActionButton label="重试" onPress={() => void retry()} />
        ) : null}
        <ActionButton label="新对话" onPress={newConversation} />
      </View>
      <View style={styles.conversationPanel}>
        <Text style={styles.fieldLabel}>当前会话</Text>
        {messages.length === 0 ? (
          <Text style={styles.helper}>还没有对话。选择建议问题或输入查询内容开始。</Text>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageRow,
                message.role === 'user' && styles.messageRowUser,
              ]}
            >
              <Text style={styles.messageRole}>{message.role === 'user' ? '你' : '海豚助手'}</Text>
              <Text style={styles.messageText}>{message.content}</Text>
            </View>
          ))
        )}
      </View>
      <View style={styles.recentPanel}>
        <Text style={styles.fieldLabel}>最近对话</Text>
        {messages.filter((message) => message.role === 'user').length === 0 ? (
          <Text style={styles.helper}>暂无最近对话。</Text>
        ) : (
          messages
            .filter((message) => message.role === 'user')
            .slice(-3)
            .reverse()
            .map((message) => (
              <Text key={`recent-${message.id}`} style={styles.recentPrompt}>• {message.content}</Text>
            ))
        )}
      </View>
      <AiResultCard snapshot={snapshot} />
      <AiAuditResultCard snapshot={snapshot} />
      {!isScopeReady || snapshot.actionPreview === null ? null : (
        <WriteActionPreviewCard
          adapter={writeExecutionAdapter}
          onCancel={() => {
            void aiAdapter
              .cancelAction(snapshot.actionPreview!.draftId)
              .catch(() => undefined);
          }}
          onModify={() => {
            const lastPrompt = [...messages]
              .reverse()
              .find((message) => message.role === 'user');
            const generation = scopeGuard.beginScopeChange();
            void aiAdapter
              .returnToModify(snapshot.actionPreview!.draftId)
              .then(() => {
                if (scopeGuard.isCurrent(generation)) {
                  setPrompt(lastPrompt?.content ?? '');
                }
              })
              .catch(() => undefined);
          }}
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
  const [coursewareTitle, setCoursewareTitle] = useState('');
  const [coursewareSubject, setCoursewareSubject] = useState('数学');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentSubject, setAssignmentSubject] = useState('数学');
  const [assignmentContent, setAssignmentContent] = useState('');
  const [assignmentDueDays, setAssignmentDueDays] = useState('1');
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
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
    return <Text style={styles.helper}>正在加载教学数据……</Text>;
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedClassId === item.id }}
                  key={item.id}
                  onPress={() => {
                    setSelectedClassId(item.id);
                    setEditingAssignmentId(null);
                  }}
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

          {presentation.mode === 'courseware' ? (
            <>
              <View style={styles.featureDivider} />
              <View style={styles.featureHeading}>
                <FolderUp color={theme.color.brand.primary} size={18} />
                <View>
                  <Text style={styles.featureTitle}>发送课件</Text>
                  <Text style={styles.featureDescription}>上传到私有存储，并只发送给当前班级</Text>
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>课件标题</Text>
                  <TextInput onChangeText={setCoursewareTitle} placeholder="例如：函数复习资料" placeholderTextColor={theme.color.text.disabled} style={styles.input} value={coursewareTitle} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>科目</Text>
                  <TextInput onChangeText={setCoursewareSubject} placeholder="例如：数学" placeholderTextColor={theme.color.text.disabled} style={styles.input} value={coursewareSubject} />
                </View>
              </View>
              {selectedFile === null ? null : (
                <View style={styles.fileSelection}>
                  <Text style={styles.itemTitle}>{selectedFile.metadata.originalFilename}</Text>
                  <Text style={styles.itemMeta}>{formatFileSize(selectedFile.metadata.sizeBytes)} · {selectedFile.metadata.mimeType}</Text>
                </View>
              )}
              <View style={styles.actions}>
                <ActionButton label={selectedFile === null ? '选择课件文件' : '重新选择文件'} onPress={() => void pickFile()} />
                <ActionButton
                  disabled={selectedClassId === null || selectedFile === null || coursewareTitle.trim().length === 0 || coursewareSubject.trim().length === 0 || isPending}
                  label="预览并发送"
                  onPress={() =>
                    requestWrite(
                      'courseware.send',
                      [snapshot.classes.find((item) => item.id === selectedClassId)?.name ?? '当前班级'],
                      ['上传私有课件并发送到所选班级'],
                      [`文件：${selectedFile?.metadata.originalFilename ?? ''}`, `标题：${coursewareTitle}`, `科目：${coursewareSubject}`],
                      async () => {
                        await teachingAdapter.sendCourseware({ classId: selectedClassId!, file: selectedFile!, subject: coursewareSubject.trim(), title: coursewareTitle.trim() });
                        setCoursewareTitle('');
                        setSelectedFile(null);
                      },
                      '课件已发送。',
                    )
                  }
                />
                <ActionButton label="刷新列表" onPress={() => void load()} />
              </View>
              <View style={styles.featureDivider} />
              <Text style={styles.fieldLabel}>已发送课件</Text>
              {snapshot.courseware.filter((item) => item.classId === selectedClassId).length === 0 ? (
                <Text style={styles.helper}>当前班级还没有课件。</Text>
              ) : (
                snapshot.courseware.filter((item) => item.classId === selectedClassId).map((item) => (
                  <View key={item.id} style={styles.listItem}>
                    <View style={styles.listHeading}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.statusBadge}>已发送</Text>
                    </View>
                    <Text style={styles.itemMeta}>{item.subject} · {item.originalFilename} · {formatFileSize(item.sizeBytes)}</Text>
                    <Text style={styles.itemMeta}>发送于 {formatDateTime(item.createdAt)}</Text>
                  </View>
                ))
              )}
            </>
          ) : null}

          {presentation.mode === 'assignment' ? (
            <>
              <View style={styles.featureDivider} />
              <View style={styles.featureHeading}>
                <ClipboardList color={theme.color.brand.primary} size={18} />
                <View>
                  <Text style={styles.featureTitle}>{editingAssignmentId === null ? '发布作业' : '编辑作业草稿'}</Text>
                  <Text style={styles.featureDescription}>先保存草稿，确认后再发布到班级端与家庭端</Text>
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>作业标题</Text>
                  <TextInput onChangeText={setAssignmentTitle} placeholder="例如：函数单元练习" placeholderTextColor={theme.color.text.disabled} style={styles.input} value={assignmentTitle} />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>科目</Text>
                  <TextInput onChangeText={setAssignmentSubject} placeholder="例如：数学" placeholderTextColor={theme.color.text.disabled} style={styles.input} value={assignmentSubject} />
                </View>
                <View style={styles.formFieldSmall}>
                  <Text style={styles.fieldLabel}>几天后截止</Text>
                  <TextInput inputMode="numeric" onChangeText={setAssignmentDueDays} style={styles.input} value={assignmentDueDays} />
                </View>
              </View>
              <Text style={styles.fieldLabel}>作业内容</Text>
              <TextInput multiline onChangeText={setAssignmentContent} placeholder="填写任务要求、提交方式与注意事项" placeholderTextColor={theme.color.text.disabled} style={[styles.input, styles.multiline]} value={assignmentContent} />
              <View style={styles.actions}>
                <ActionButton
                  disabled={selectedClassId === null || assignmentTitle.trim().length === 0 || assignmentSubject.trim().length === 0 || assignmentContent.trim().length === 0 || !validDueDays(assignmentDueDays) || isPending}
                  label={editingAssignmentId === null ? '预览并保存草稿' : '预览并保存修改'}
                  onPress={() => {
                    const dueAt = new Date(Date.now() + Number(assignmentDueDays) * 86400000).toISOString();
                    const editingId = editingAssignmentId;
                    requestWrite(
                      editingId === null ? 'assignment.create_draft' : 'assignment.update_draft',
                      [snapshot.classes.find((item) => item.id === selectedClassId)?.name ?? '当前班级'],
                      [editingId === null ? '创建仅教师可见的作业草稿' : '更新指定作业草稿'],
                      [`标题：${assignmentTitle}`, `科目：${assignmentSubject}`, `截止：${dueAt}`],
                      async () => {
                        if (editingId === null) {
                          await teachingAdapter.createAssignmentDraft({ classId: selectedClassId!, content: assignmentContent.trim(), dueAt, subject: assignmentSubject.trim(), title: assignmentTitle.trim() });
                        } else {
                          await teachingAdapter.updateAssignmentDraft(editingId, { content: assignmentContent.trim(), dueAt, title: assignmentTitle.trim() });
                        }
                        setAssignmentTitle('');
                        setAssignmentContent('');
                        setAssignmentDueDays('1');
                        setEditingAssignmentId(null);
                      },
                      editingId === null ? '作业草稿已创建。' : '作业草稿已更新。',
                    );
                  }}
                />
                {editingAssignmentId === null ? null : (
                  <ActionButton label="取消编辑" onPress={() => { setEditingAssignmentId(null); setAssignmentTitle(''); setAssignmentContent(''); setAssignmentDueDays('1'); }} />
                )}
                <ActionButton label="刷新列表" onPress={() => void load()} />
              </View>
              <View style={styles.featureDivider} />
              <Text style={styles.fieldLabel}>作业列表</Text>
              {snapshot.assignments.filter((item) => item.classId === selectedClassId).length === 0 ? (
                <Text style={styles.helper}>当前班级还没有作业。</Text>
              ) : (
                snapshot.assignments.filter((item) => item.classId === selectedClassId).map((item) => (
                  <View key={item.id} style={styles.listItem}>
                    <View style={styles.listHeading}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={item.status === 'published' ? styles.statusBadge : styles.statusBadgeMuted}>{item.status === 'published' ? '已发布' : '草稿'}</Text>
                    </View>
                    <Text style={styles.itemMeta}>{item.subject} · 截止 {formatDateTime(item.dueAt)}</Text>
                    <Text style={styles.itemBody}>{item.content}</Text>
                    {item.status === 'draft' ? (
                      <View style={styles.actions}>
                        <ActionButton label="编辑草稿" onPress={() => { setEditingAssignmentId(item.id); setAssignmentTitle(item.title); setAssignmentSubject(item.subject); setAssignmentContent(item.content); setAssignmentDueDays(daysUntil(item.dueAt)); }} />
                        <ActionButton label="预览并发布" onPress={() => requestWrite('assignment.publish', [item.title], ['班级端和绑定家庭端将可见'], [`截止：${item.dueAt}`], () => teachingAdapter.publishAssignment(item.id), '作业已发布。', true)} />
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </>
          ) : null}
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
          <View style={styles.listHeading}>
            <Text style={styles.fieldLabel}>课件</Text>
            <ActionButton label="刷新列表" onPress={() => void load()} />
          </View>
          {snapshot.courseware.length === 0 ? (
            <Text style={styles.helper}>暂无已发送课件。</Text>
          ) : (
            snapshot.courseware.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.listHeading}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.statusBadge}>已接收</Text>
                </View>
                <Text style={styles.itemMeta}>{item.subject} · {item.originalFilename} · {formatFileSize(item.sizeBytes)}</Text>
                <Text style={styles.itemMeta}>发送于 {formatDateTime(item.createdAt)}</Text>
              </View>
            ))
          )}
        </>
      ) : null}

      {(role === 'class_terminal' || role === 'family') &&
      presentation.mode === 'assignment' ? (
        <>
          <View style={styles.listHeading}>
            <Text style={styles.fieldLabel}>已发布作业</Text>
            <ActionButton label="刷新列表" onPress={() => void load()} />
          </View>
          {snapshot.assignments.length === 0 ? (
            <Text style={styles.helper}>暂无已发布作业。</Text>
          ) : (
            snapshot.assignments.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.listHeading}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.statusBadge}>已发布</Text>
                </View>
                <Text style={styles.itemMeta}>{item.subject} · 截止 {formatDateTime(item.dueAt)}</Text>
                <Text style={styles.itemBody}>{item.content}</Text>
              </View>
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
    return (
      <AiExperienceSection
        key={getAiConversationScopeKey(roleScope)}
        roleScope={roleScope}
      />
    );
  }

  if (
    (role === 'teacher' && activeNavigation === 'class') ||
    (role === 'family' && activeNavigation === 'growth')
  ) {
    return (
      <>
        <GradeReportSection role={role} roleScope={roleScope} />
        <GovernanceExperienceSection
          activeNavigation={activeNavigation}
          roleScope={roleScope}
        />
      </>
    );
  }

  if (resolveGovernanceExperienceMode(role, activeNavigation) !== null) {
    return (
      <GovernanceExperienceSection
        activeNavigation={activeNavigation}
        roleScope={roleScope}
      />
    );
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间待确认'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function validDueDays(value: string): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365;
}

function daysUntil(value: string): string {
  const milliseconds = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(milliseconds)) return '1';
  return String(Math.max(1, Math.ceil(milliseconds / 86400000)));
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderRadius: theme.radius.control, justifyContent: 'center', minHeight: 44, paddingHorizontal: theme.space.md },
  actionLabel: { color: theme.color.surface.card, fontSize: theme.text.size.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  aiComposer: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  aiGuidance: { backgroundColor: theme.color.surface.page, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, gap: theme.space.sm, padding: theme.space.md },
  aiInput: { flex: 1 },
  aiScopeBar: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  aiScopeLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '700' },
  aiWriteHint: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  classButton: { alignItems: 'center', borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: theme.space.base },
  classButtonSelected: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  classLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  classSelectorRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.base },
  disabled: { opacity: 0.5 },
  conversationPanel: { gap: theme.space.sm },
  error: { color: theme.color.text.primary, fontWeight: '600' },
  feedbackBox: { gap: theme.space.sm },
  featureDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, marginTop: 2 },
  featureDivider: { backgroundColor: theme.color.border.default, height: 1, marginVertical: theme.space.sm },
  featureHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.sm },
  featureTitle: { color: theme.color.text.primary, fontSize: theme.text.size.md, fontWeight: '800' },
  fileSelection: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary, borderRadius: theme.radius.control, borderWidth: 1, gap: 3, padding: theme.space.base },
  fieldLabel: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700', marginTop: theme.space.xs },
  formField: { flex: 1, gap: theme.space.xs, minWidth: 220 },
  formFieldSmall: { flex: 0.45, gap: theme.space.xs, minWidth: 140 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  helper: { color: theme.color.text.secondary, fontSize: theme.text.size.sm, lineHeight: 21 },
  input: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, color: theme.color.text.primary, fontSize: theme.text.size.sm, minHeight: 46, paddingHorizontal: theme.space.md },
  itemBody: { color: theme.color.text.primary, fontSize: theme.text.size.sm, lineHeight: 21 },
  itemMeta: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  itemTitle: { color: theme.color.text.primary, fontWeight: '600' },
  interactiveFocus: { borderColor: theme.color.brand.primary, boxShadow: '0 0 0 3px rgba(22, 119, 254, 0.18)' },
  interactiveHover: { backgroundColor: theme.color.surface.primaryTint, borderColor: theme.color.brand.primary },
  interactivePressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  listItem: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, color: theme.color.text.primary, gap: theme.space.sm, padding: theme.space.base },
  listHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'space-between' },
  messageRole: { color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800' },
  messageRow: { alignSelf: 'flex-start', backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, gap: theme.space.xs, maxWidth: '88%', padding: theme.space.base },
  messageRowUser: { alignSelf: 'flex-end', backgroundColor: theme.color.surface.primaryTint },
  messageText: { color: theme.color.text.primary, fontSize: theme.text.size.sm, lineHeight: 21 },
  multiline: { minHeight: 88, paddingVertical: theme.space.md, textAlignVertical: 'top' },
  performanceCard: { backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: theme.radius.control, borderWidth: 1, flex: 1, gap: theme.space.xs, minWidth: 180, padding: theme.space.md },
  performanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  performanceLabel: { color: theme.color.text.secondary, fontSize: theme.text.size.xs },
  performancePending: { color: theme.color.text.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  performanceValue: { color: theme.color.text.primary, fontSize: theme.text.size.xl, fontWeight: '800' },
  recentPanel: { borderTopColor: theme.color.border.default, borderTopWidth: 1, gap: theme.space.xs, paddingTop: theme.space.sm },
  recentPrompt: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18 },
  section: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.space.md, padding: theme.space.lg },
  sectionDescription: { color: theme.color.text.secondary, fontSize: theme.text.size.xs, lineHeight: 18, marginTop: 3 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: theme.space.base },
  sectionHeadingCopy: { flex: 1 },
  sectionIcon: { alignItems: 'center', backgroundColor: theme.color.surface.secondaryTint, borderRadius: theme.radius.control, height: 40, justifyContent: 'center', width: 40 },
  sectionTitle: { color: theme.color.text.primary, fontSize: theme.text.size.lg, fontWeight: '800' },
  success: { color: theme.color.brand.primary, fontSize: theme.text.size.sm, fontWeight: '700' },
  statusBadge: { backgroundColor: theme.color.surface.primaryTint, borderRadius: theme.radius.pill, color: theme.color.brand.primary, fontSize: theme.text.size.xs, fontWeight: '800', overflow: 'hidden', paddingHorizontal: theme.space.sm, paddingVertical: 4 },
  statusBadgeMuted: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.pill, borderWidth: 1, color: theme.color.text.secondary, fontSize: theme.text.size.xs, fontWeight: '800', overflow: 'hidden', paddingHorizontal: theme.space.sm, paddingVertical: 4 },
  suggestionButton: { borderColor: theme.color.border.default, borderRadius: theme.radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: theme.space.base },
  suggestionLabel: { color: theme.color.text.primary, fontSize: theme.text.size.xs, fontWeight: '700' },
});
