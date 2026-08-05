import type { GradeReportSheet, GradeReportValueRevision } from '@dolphincloud/domain';
import type { AuthRoleScope } from '@dolphincloud/auth';
import type { TeachingDemoSnapshot } from '@dolphincloud/experience';
import { InteractivePressable, theme } from '@dolphincloud/ui';
import * as DocumentPicker from 'expo-document-picker';
import { FileSpreadsheet, PencilLine, Save, Send } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useSupabaseServices } from '../supabase/SupabaseServiceProvider';
import {
  CsvImportPanel,
  GradeActionButton,
  GradeReportFeedback,
  GradeReportGrid,
  GradeReportHeader,
  GradeReportMetadataEditor,
  GradeReportPreview,
  PublishConfirmation,
  RevisionHistory,
  saveCsvPreview,
} from './GradeReportUi';
import {
  GradeReportFormError,
  addGradeReportColumn,
  buildGradeReportDraftInput,
  buildGradeReportRevisionInput,
  canWriteGradeReports,
  createGradeReportDraftForm,
  prepareGradeReportCsvPreview,
  removeGradeReportColumn,
  reopenGradeReportSheet,
  resolveGradeReportLayout,
  type GradeReportDraftForm,
} from './gradeReportWorkflow';

const EMPTY_TEACHING: TeachingDemoSnapshot = {
  assignments: [], classes: [], courseware: [], grades: [], students: [],
};

type RevisionTarget = {
  readonly columnName: string;
  readonly maxScore: number | null;
  readonly studentName: string;
  readonly valueId: string;
};

function messageForError(cause: unknown): string {
  if (cause instanceof GradeReportFormError) return cause.message;
  return '操作失败，请检查当前班级权限和输入后重试。';
}

export function TeacherGradeReportWorkspace({
  roleScope,
}: {
  readonly roleScope: AuthRoleScope;
}) {
  const { gradeReportService, teachingAdapter } = useSupabaseServices();
  const { width } = useWindowDimensions();
  const compact = resolveGradeReportLayout(width) === 'compact';
  const [teaching, setTeaching] = useState(EMPTY_TEACHING);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<readonly GradeReportSheet[]>([]);
  const [form, setForm] = useState<GradeReportDraftForm | null>(null);
  const [mode, setMode] = useState<'grid' | 'csv'>('grid');
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof prepareGradeReportCsvPreview> | null>(null);
  const [publishCandidate, setPublishCandidate] = useState<GradeReportSheet | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<RevisionTarget | null>(null);
  const [revisionScore, setRevisionScore] = useState('');
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [revisions, setRevisions] = useState<readonly GradeReportValueRevision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const students = useMemo(
    () => teaching.students.filter((student) => student.classId === selectedClassId),
    [selectedClassId, teaching.students],
  );

  const loadClassSheets = useCallback(async (classId: string) => {
    const next = await gradeReportService.listClassSheets(classId);
    setSheets(next);
    return next;
  }, [gradeReportService]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    setSheets([]);
    setForm(null);
    try {
      const snapshot = await teachingAdapter.load(roleScope);
      setTeaching(snapshot);
      const scopedClass = snapshot.classes.find((item) => item.id === roleScope.id);
      const classId = scopedClass?.id ?? snapshot.classes[0]?.id ?? null;
      setSelectedClassId(classId);
      if (classId !== null) {
        await loadClassSheets(classId);
        setForm(createGradeReportDraftForm(classId, snapshot.students));
      }
    } catch {
      setError('成绩单工作区加载失败，请重试。');
    } finally {
      setIsLoading(false);
    }
  }, [loadClassSheets, roleScope, teachingAdapter]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const selectClass = async (classId: string) => {
    setSelectedClassId(classId);
    setSheets([]);
    setCsvPreview(null);
    setError(null);
    setMessage(null);
    setForm(createGradeReportDraftForm(classId, teaching.students));
    try {
      await loadClassSheets(classId);
    } catch {
      setError('当前班级成绩单加载失败。');
    }
  };

  const reopenSheet = async (sheetId: string) => {
    setIsPending(true);
    setError(null);
    try {
      const sheet = await gradeReportService.getSheet(sheetId);
      setForm(reopenGradeReportSheet(sheet, teaching.students));
      setMode('grid');
      setCsvPreview(null);
      setMessage(sheet.status === 'draft' ? '草稿已从服务端重新打开。' : '已打开发布版本，可选择成绩值进行修订。');
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setIsPending(false);
    }
  };

  const saveDraft = async () => {
    if (form === null) return;
    setIsPending(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await gradeReportService.saveDraft(buildGradeReportDraftInput(form));
      setForm(reopenGradeReportSheet(saved, teaching.students));
      await loadClassSheets(saved.classId);
      setMessage('草稿已持久化保存，刷新页面后仍可重新打开。');
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setIsPending(false);
    }
  };

  const pickCsv = async () => {
    if (form === null) return;
    setError(null);
    setMessage(null);
    setCsvPreview(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['text/csv', 'text/comma-separated-values'],
      });
      const asset = result.assets?.[0];
      if (asset === undefined) return;
      const csv = asset.file === undefined
        ? await (await fetch(asset.uri)).text()
        : await asset.file.text();
      const preview = prepareGradeReportCsvPreview({
        classId: form.classId,
        sheetId: form.sheetId,
        subject: form.subject,
        title: form.title,
      }, csv);
      const allowedStudents = new Set(students.map((student) => student.id));
      const unknownStudent = preview.rows.find((row) => !allowedStudents.has(row.studentId));
      if (unknownStudent !== undefined) {
        throw new GradeReportFormError(`CSV 学生 ID ${unknownStudent.studentId} 不属于当前班级。`);
      }
      setCsvPreview(preview);
      setMessage('CSV 已解析，请核对整表预览后确认保存。');
    } catch (cause) {
      setError(messageForError(cause));
    }
  };

  const confirmCsv = async () => {
    if (csvPreview === null) return;
    setIsPending(true);
    setError(null);
    try {
      const saved = await saveCsvPreview(gradeReportService, csvPreview);
      setForm(reopenGradeReportSheet(saved, teaching.students));
      setCsvPreview(null);
      setMode('grid');
      await loadClassSheets(saved.classId);
      setMessage('CSV 成绩单已保存为草稿。');
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setIsPending(false);
    }
  };

  const publish = async () => {
    if (publishCandidate === null) return;
    setIsPending(true);
    setError(null);
    try {
      const published = await gradeReportService.publishSheet(publishCandidate.id);
      setForm(reopenGradeReportSheet(published, teaching.students));
      await loadClassSheets(published.classId);
      setPublishCandidate(null);
      setMessage(`整张成绩单已发布：${new Date(published.publishedAt ?? '').toLocaleString()}`);
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setIsPending(false);
    }
  };

  const chooseRevision = async (
    sheet: GradeReportSheet,
    rowIndex: number,
    columnIndex: number,
  ) => {
    const row = sheet.rows[rowIndex];
    const column = sheet.columns[columnIndex];
    const value = row?.values.find((candidate) => candidate.columnId === column?.id);
    if (row === undefined || column === undefined || value === undefined) return;
    setRevisionTarget({
      columnName: column.name,
      maxScore: column.maxScore,
      studentName: students.find((student) => student.id === row.studentId)?.name ?? '当前学生',
      valueId: value.id,
    });
    setRevisionScore(String(value.score));
    setRevisionComment(value.comment);
    setRevisionReason('');
    setRevisions(await gradeReportService.listValueRevisions(value.id));
  };

  const submitRevision = async () => {
    if (revisionTarget === null) return;
    setIsPending(true);
    setError(null);
    try {
      const input = buildGradeReportRevisionInput(
        revisionScore, revisionComment, revisionReason, revisionTarget.maxScore,
      );
      const revised = await gradeReportService.reviseValue(revisionTarget.valueId, input);
      setForm(reopenGradeReportSheet(revised, teaching.students));
      setRevisions(await gradeReportService.listValueRevisions(revisionTarget.valueId));
      await loadClassSheets(revised.classId);
      setMessage('成绩已修订，并已保存前后值、原因、时间和操作者。');
      setRevisionTarget(null);
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setIsPending(false);
    }
  };

  if (!canWriteGradeReports(roleScope)) {
    return <Text style={styles.empty}>当前角色无权创建或修改成绩单。</Text>;
  }
  if (isLoading) return <Text style={styles.empty}>正在加载成绩单工作区…</Text>;

  const selectedSheet = form?.sheetId === null
    ? null
    : sheets.find((sheet) => sheet.id === form?.sheetId) ?? null;

  return (
    <View style={[styles.section, compact && styles.sectionCompact]}>
      <GradeReportHeader
        description="填写或导入整张成绩单，保存草稿后预览并一次发布给绑定家庭。"
        title="成绩单工作区"
      />
      <GradeReportFeedback error={error} message={message} onRetry={() => void load()} />
      <View style={styles.selectorBlock}>
        <Text style={styles.label}>当前授权班级</Text>
        <View style={styles.actions}>
          {teaching.classes.map((item) => (
            <InteractivePressable
              key={item.id}
              onPress={() => void selectClass(item.id)}
              style={[styles.scopeButton, item.id === selectedClassId && styles.scopeSelected]}
            >
              <Text style={[styles.scopeText, item.id === selectedClassId && styles.scopeTextSelected]}>{item.name}</Text>
            </InteractivePressable>
          ))}
        </View>
      </View>
      {selectedClassId === null || form === null ? (
        <Text style={styles.empty}>当前权限范围没有可管理班级。</Text>
      ) : (
        <>
          <View style={styles.sheetLibrary}>
            <View style={styles.libraryHeading}>
              <Text style={styles.subtitle}>已保存成绩单</Text>
              <GradeActionButton
                label="新建成绩单"
                onPress={() => {
                  setForm(createGradeReportDraftForm(selectedClassId, teaching.students));
                  setCsvPreview(null);
                  setMode('grid');
                }}
                secondary
              />
            </View>
            {sheets.length === 0 ? <Text style={styles.empty}>暂无已保存成绩单。</Text> : sheets.map((sheet) => (
              <View key={sheet.id} style={styles.savedSheet}>
                <View style={styles.grow}>
                  <Text style={styles.savedTitle}>{sheet.title}</Text>
                  <Text style={styles.hint}>{sheet.subject} · {sheet.columns.length} 项 · {sheet.rows.length} 名学生 · {sheet.status === 'draft' ? '草稿' : `已发布 ${new Date(sheet.publishedAt ?? '').toLocaleString()}`}</Text>
                </View>
                <GradeActionButton
                  icon={<PencilLine color={theme.color.brand.primary} size={15} />}
                  label={sheet.status === 'draft' ? '继续填写' : '查看与修订'}
                  onPress={() => void reopenSheet(sheet.id)}
                  secondary
                />
              </View>
            ))}
          </View>
          <GradeReportMetadataEditor
            disabled={form.status === 'published'}
            form={form}
            onChange={setForm}
          />
          {form.status === 'draft' ? (
            <View style={styles.modeRow}>
              <GradeActionButton
                icon={<FileSpreadsheet color={mode === 'grid' ? theme.color.text.onAccent : theme.color.brand.primary} size={16} />}
                label="填写表格"
                onPress={() => setMode('grid')}
                secondary={mode !== 'grid'}
              />
              <GradeActionButton
                icon={<FileSpreadsheet color={mode === 'csv' ? theme.color.text.onAccent : theme.color.brand.primary} size={16} />}
                label="上传表格"
                onPress={() => setMode('csv')}
                secondary={mode !== 'csv'}
              />
            </View>
          ) : null}
          {mode === 'grid' || form.status === 'published' ? (
            <GradeReportGrid
              compact={compact}
              disabled={form.status === 'published'}
              form={form}
              onAddColumn={() => setForm(addGradeReportColumn(form))}
              onChange={setForm}
              onRemoveColumn={(key) => {
                try { setForm(removeGradeReportColumn(form, key)); }
                catch (cause) { setError(messageForError(cause)); }
              }}
            />
          ) : (
            <CsvImportPanel disabled={isPending} onPick={() => void pickCsv()} preview={csvPreview} />
          )}
          {csvPreview === null ? null : (
            <>
              <GradeReportPreview input={csvPreview} students={students} />
              <View style={styles.actions}>
                <GradeActionButton label="返回修改" onPress={() => setCsvPreview(null)} secondary />
                <GradeActionButton disabled={isPending} label="确认并保存草稿" onPress={() => void confirmCsv()} />
              </View>
            </>
          )}
          {form.status === 'draft' && csvPreview === null ? (
            <View style={styles.actions}>
              <GradeActionButton
                disabled={isPending}
                icon={<Save color={theme.color.text.onAccent} size={16} />}
                label="保存草稿"
                onPress={() => void saveDraft()}
              />
              {selectedSheet === null ? null : (
                <GradeActionButton
                  disabled={isPending}
                  icon={<Send color={theme.color.brand.primary} size={16} />}
                  label="预览并发布整表"
                  onPress={() => setPublishCandidate(selectedSheet)}
                  secondary
                />
              )}
            </View>
          ) : null}
          {selectedSheet === null ? null : (
            <GradeReportPreview
              input={{
                classId: selectedSheet.classId,
                columns: selectedSheet.columns,
                rows: selectedSheet.rows.map((row) => ({
                  studentId: row.studentId,
                  values: row.values.map((value) => ({
                    columnKey: selectedSheet.columns.find((column) => column.id === value.columnId)?.columnKey ?? '',
                    comment: value.comment,
                    score: value.score,
                  })),
                })),
                sheetId: selectedSheet.id,
                source: selectedSheet.source,
                subject: selectedSheet.subject,
                title: selectedSheet.title,
              }}
              students={students}
            />
          )}
          {publishCandidate === null ? null : (
            <PublishConfirmation
              disabled={isPending}
              onCancel={() => setPublishCandidate(null)}
              onConfirm={() => void publish()}
              sheet={publishCandidate}
            />
          )}
          {selectedSheet?.status === 'published' ? (
            <View style={styles.revisionArea}>
              <Text style={styles.subtitle}>修订已发布成绩</Text>
              <Text style={styles.hint}>先选择学生与成绩项目，再填写新成绩、评语和必填原因。</Text>
              {selectedSheet.rows.map((row, rowIndex) => (
                <View key={row.id} style={styles.actions}>
                  {selectedSheet.columns.map((column, columnIndex) => {
                    const value = row.values.find((candidate) => candidate.columnId === column.id);
                    return (
                      <GradeActionButton
                        key={column.id}
                        label={`${students.find((student) => student.id === row.studentId)?.name ?? '学生'} · ${column.name}: ${value?.score ?? '-'}`}
                        onPress={() => void chooseRevision(selectedSheet, rowIndex, columnIndex)}
                        secondary
                      />
                    );
                  })}
                </View>
              ))}
              {revisionTarget === null ? null : (
                <Modal animationType="fade" onRequestClose={() => { if (!isPending) setRevisionTarget(null); }} transparent visible>
                  <Pressable accessibilityLabel="关闭成绩修订" accessibilityRole="button" onPress={() => { if (!isPending) setRevisionTarget(null); }} style={styles.revisionBackdrop}>
                    <Pressable onPress={(event) => event.stopPropagation()} style={styles.revisionDialog}>
                      <ScrollView contentContainerStyle={styles.revisionForm}>
                        <Text style={styles.savedTitle}>{revisionTarget.studentName} · {revisionTarget.columnName}</Text>
                        <TextInput inputMode="decimal" onChangeText={setRevisionScore} placeholder="新成绩" style={styles.input} value={revisionScore} />
                        <TextInput onChangeText={setRevisionComment} placeholder="新评语" style={styles.input} value={revisionComment} />
                        <TextInput onChangeText={setRevisionReason} placeholder="修订原因（必填）" style={styles.input} value={revisionReason} />
                        <View style={styles.actions}>
                          <GradeActionButton disabled={isPending} label="取消" onPress={() => setRevisionTarget(null)} secondary />
                          <GradeActionButton disabled={isPending} label="确认修订" onPress={() => void submitRevision()} />
                        </View>
                        <RevisionHistory revisions={revisions} />
                      </ScrollView>
                    </Pressable>
                  </Pressable>
                </Modal>
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  empty: { color: theme.color.text.disabled, fontSize: 14, paddingVertical: 12 },
  grow: { flex: 1 },
  hint: { color: theme.color.text.secondary, fontSize: 13, lineHeight: 20 },
  input: { backgroundColor: theme.color.surface.input, borderColor: theme.color.border.control, borderRadius: theme.radius.control, borderWidth: 1, color: theme.color.text.primary, fontSize: 14, minHeight: 40, paddingHorizontal: theme.space.base, paddingVertical: theme.space.sm },
  label: { color: theme.color.text.secondary, fontSize: 13, fontWeight: '700' },
  libraryHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  revisionArea: { borderTopColor: theme.color.border.default, borderTopWidth: 1, gap: 13, paddingTop: 18 },
  revisionBackdrop: { alignItems: 'center', backgroundColor: theme.color.overlay.smoke, flex: 1, justifyContent: 'center', padding: theme.space.md },
  revisionDialog: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, boxShadow: theme.shadow.dialog, maxHeight: '88%', maxWidth: 620, overflow: 'hidden', width: '100%' },
  revisionForm: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, gap: theme.space.sm, padding: theme.space.base },
  savedSheet: { alignItems: 'center', borderBottomColor: theme.color.border.default, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 12 },
  savedTitle: { color: theme.color.text.primary, fontSize: 15, fontWeight: '600' },
  scopeButton: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.control, borderRadius: theme.radius.pill, borderWidth: 1, paddingHorizontal: theme.space.base, paddingVertical: theme.space.sm },
  scopeSelected: { backgroundColor: theme.color.brand.primary, borderColor: theme.color.brand.primary },
  scopeText: { color: theme.color.text.primary, fontSize: 13, fontWeight: '700' },
  scopeTextSelected: { color: theme.color.text.onAccent },
  section: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: 20, maxWidth: '100%', padding: 20, position: 'relative' },
  sectionCompact: { gap: 16, padding: 16 },
  selectorBlock: { gap: 9 },
  sheetLibrary: { backgroundColor: theme.color.surface.muted, borderRadius: theme.radius.control, gap: theme.space.xs, padding: theme.space.base },
  subtitle: { color: theme.color.text.primary, fontSize: 16, fontWeight: '600' },
});
