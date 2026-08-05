import type {
  GradeReportSheetService,
  SaveGradeReportSheetDraftInput,
} from '@dolphincloud/api-client';
import type { GradeReportSheet, GradeReportValueRevision } from '@dolphincloud/domain';
import type { TeachingStudent } from '@dolphincloud/experience';
import { InteractivePressable, theme } from '@dolphincloud/ui';
import { Check, FileUp, Plus, RefreshCw, Send, Trash2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  GradeReportColumnForm,
  GradeReportDraftForm,
  GradeReportValueForm,
} from './gradeReportWorkflow';

const BLANK_UI_VALUE: GradeReportValueForm = { comment: '', score: '' };

export function GradeActionButton({
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
  secondary = false,
}: {
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly secondary?: boolean;
}) {
  return (
    <InteractivePressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ focused, hovered, pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        hovered && styles.hovered,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.buttonText,
          secondary && styles.buttonTextSecondary,
          danger && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </InteractivePressable>
  );
}

export function GradeReportHeader({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerMark} />
      <View style={styles.grow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

export function GradeReportFeedback({
  error,
  message,
  onRetry,
}: {
  readonly error: string | null;
  readonly message: string | null;
  readonly onRetry?: () => void;
}) {
  if (error === null && message === null) return null;
  return (
    <View style={[styles.feedback, error === null ? styles.success : styles.failure]}>
      <Text style={error === null ? styles.successText : styles.failureText}>
        {error ?? message}
      </Text>
      {error !== null && onRetry !== undefined ? (
        <GradeActionButton
          icon={<RefreshCw color={theme.color.brand.primary} size={15} />}
          label="重试"
          onPress={onRetry}
          secondary
        />
      ) : null}
    </View>
  );
}

function GradeField({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  readonly label: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.text.disabled}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

export function GradeReportMetadataEditor({
  disabled,
  form,
  onChange,
}: {
  readonly disabled: boolean;
  readonly form: GradeReportDraftForm;
  readonly onChange: (form: GradeReportDraftForm) => void;
}) {
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={styles.metadataRow}>
      <GradeField
        label="成绩单标题"
        onChangeText={(title) => onChange({ ...form, title })}
        placeholder="例如：八月学习成果"
        value={form.title}
      />
      <GradeField
        label="科目"
        onChangeText={(subject) => onChange({ ...form, subject })}
        placeholder="例如：数学"
        value={form.subject}
      />
    </View>
  );
}

export function GradeReportGrid({
  compact,
  disabled,
  form,
  onAddColumn,
  onChange,
  onRemoveColumn,
}: {
  readonly compact: boolean;
  readonly disabled: boolean;
  readonly form: GradeReportDraftForm;
  readonly onAddColumn: () => void;
  readonly onChange: (form: GradeReportDraftForm) => void;
  readonly onRemoveColumn: (columnKey: string) => void;
}) {
  const updateColumn = (columnKey: string, patch: Partial<GradeReportColumnForm>) => {
    onChange({
      ...form,
      columns: form.columns.map((column) =>
        column.key === columnKey ? { ...column, ...patch } : column,
      ),
    });
  };
  const updateValue = (
    studentId: string,
    columnKey: string,
    patch: Partial<GradeReportValueForm>,
  ) => {
    onChange({
      ...form,
      rows: form.rows.map((row) =>
        row.studentId === studentId
          ? {
              ...row,
              values: {
                ...row.values,
                [columnKey]: {
                  ...(row.values[columnKey] ?? BLANK_UI_VALUE),
                  ...patch,
                },
              },
            }
          : row,
      ),
    });
  };
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={styles.workspace}>
      <View style={styles.workspaceHeading}>
        <View>
          <Text style={styles.subtitle}>填写表格</Text>
          <Text style={styles.hint}>学生为行，成绩项目为列；发布操作作用于整张成绩单。</Text>
        </View>
        {!disabled ? (
          <GradeActionButton
            icon={<Plus color={theme.color.brand.primary} size={16} />}
            label="增加成绩项目"
            onPress={onAddColumn}
            secondary
          />
        ) : null}
      </View>
      <View style={[styles.columnEditors, compact && styles.stack]}>
        {form.columns.map((column, index) => (
          <View key={column.key} style={styles.columnEditor}>
            <Text style={styles.columnNumber}>项目 {index + 1}</Text>
            <TextInput
              onChangeText={(name) => updateColumn(column.key, { name })}
              placeholder="项目名称"
              style={styles.input}
              value={column.name}
            />
            <TextInput
              inputMode="decimal"
              onChangeText={(maxScore) => updateColumn(column.key, { maxScore })}
              placeholder="满分（可选）"
              style={styles.input}
              value={column.maxScore}
            />
            {!disabled && form.columns.length > 1 ? (
              <GradeActionButton
                danger
                icon={<Trash2 color="#C2413B" size={15} />}
                label="删除项目"
                onPress={() => onRemoveColumn(column.key)}
                secondary
              />
            ) : null}
          </View>
        ))}
      </View>
      {form.rows.length === 0 ? (
        <Text style={styles.empty}>当前班级没有学生，不能创建成绩单。</Text>
      ) : (
        form.rows.map((row) => (
          <View key={row.studentId} style={styles.studentBlock}>
            <Text style={styles.studentName}>{row.studentName}</Text>
            <View style={[styles.valueGrid, compact && styles.stack]}>
              {form.columns.map((column) => {
                const value = row.values[column.key] ?? { comment: '', score: '' };
                return (
                  <View key={column.key} style={styles.valueCell}>
                    <Text style={styles.label}>
                      {column.name || '未命名项目'}
                      {column.maxScore === '' ? '' : ` / ${column.maxScore}`}
                    </Text>
                    <TextInput
                      inputMode="decimal"
                      onChangeText={(score) =>
                        updateValue(row.studentId, column.key, { score })
                      }
                      placeholder="成绩"
                      style={styles.input}
                      value={value.score}
                    />
                    <TextInput
                      onChangeText={(comment) =>
                        updateValue(row.studentId, column.key, { comment })
                      }
                      placeholder="评语（可选）"
                      style={styles.input}
                      value={value.comment}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function GradeReportPreview({
  input,
  students,
}: {
  readonly input: SaveGradeReportSheetDraftInput;
  readonly students: readonly TeachingStudent[];
}) {
  const names = new Map(students.map((student) => [student.id, student.name]));
  return (
    <View style={styles.preview}>
      <View style={styles.previewHeading}>
        <Check color="#16834A" size={18} />
        <Text style={styles.subtitle}>整表预览</Text>
      </View>
      <Text style={styles.previewTitle}>{input.title} · {input.subject}</Text>
      <Text style={styles.hint}>{input.columns.map((column) => `${column.name}${column.maxScore === null ? '' : `（满分 ${column.maxScore}）`}`).join(' · ')}</Text>
      {input.rows.map((row) => (
        <View key={row.studentId} style={styles.previewRow}>
          <Text style={styles.studentName}>{names.get(row.studentId) ?? '班级学生'}</Text>
          <Text style={styles.previewScores}>{row.values.map((value) => {
            const column = input.columns.find((item) => item.columnKey === value.columnKey);
            return `${column?.name ?? value.columnKey}: ${value.score}${value.comment === '' ? '' : `（${value.comment}）`}`;
          }).join('　')}</Text>
        </View>
      ))}
    </View>
  );
}

export function CsvImportPanel({
  disabled,
  onPick,
  preview,
}: {
  readonly disabled: boolean;
  readonly onPick: () => void;
  readonly preview: SaveGradeReportSheetDraftInput | null;
}) {
  return (
    <View style={styles.workspace}>
      <Text style={styles.subtitle}>上传表格</Text>
      <Text style={styles.hint}>
        本次演示真实支持 CSV。首列必须为 student_id；成绩列可写为“笔试[100]”，对应评语列写为“笔试评语”。
      </Text>
      <GradeActionButton
        disabled={disabled}
        icon={<FileUp color={theme.color.brand.primary} size={16} />}
        label="选择 CSV 文件"
        onPress={onPick}
        secondary
      />
      {preview === null ? null : (
        <Text style={styles.successText}>解析通过：{preview.rows.length} 名学生，{preview.columns.length} 个成绩项目。确认后才会保存。</Text>
      )}
    </View>
  );
}

export function PublishConfirmation({
  disabled,
  onCancel,
  onConfirm,
  sheet,
}: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly sheet: GradeReportSheet;
}) {
  return (
    <View style={styles.confirmation}>
      <Text style={styles.subtitle}>确认发布整张成绩单？</Text>
      <Text style={styles.hint}>
        “{sheet.title}”包含 {sheet.columns.length} 个成绩项目、{sheet.rows.length} 名学生。发布后绑定家庭可见本人数据。
      </Text>
      <View style={styles.actions}>
        <GradeActionButton label="取消" onPress={onCancel} secondary />
        <GradeActionButton
          disabled={disabled}
          icon={<Send color="#ffffff" size={15} />}
          label="确认整表发布"
          onPress={onConfirm}
        />
      </View>
    </View>
  );
}

export function RevisionHistory({
  revisions,
}: {
  readonly revisions: readonly GradeReportValueRevision[];
}) {
  return (
    <View style={styles.history}>
      <Text style={styles.subtitle}>修订历史</Text>
      {revisions.length === 0 ? <Text style={styles.empty}>尚无修订记录。</Text> : revisions.map((revision) => (
        <View key={revision.id} style={styles.historyRow}>
          <Text style={styles.studentName}>{revision.oldScore} → {revision.newScore}</Text>
          <Text style={styles.hint}>{revision.reason} · {new Date(revision.createdAt).toLocaleString()}</Text>
          <Text style={styles.hint}>评语：{revision.oldComment || '无'} → {revision.newComment || '无'}</Text>
        </View>
      ))}
    </View>
  );
}

export async function saveCsvPreview(
  service: GradeReportSheetService,
  preview: SaveGradeReportSheetDraftInput,
): Promise<GradeReportSheet> {
  return service.saveDraft(preview);
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { alignItems: 'center', backgroundColor: theme.color.brand.primary, borderColor: theme.color.brand.primary, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 42, paddingHorizontal: 15, paddingVertical: 10 },
  buttonDanger: { backgroundColor: theme.color.surface.card, borderColor: '#C2413B' },
  buttonSecondary: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  buttonTextDanger: { color: '#C2413B' },
  buttonTextSecondary: { color: theme.color.text.primary },
  columnEditor: { backgroundColor: theme.color.surface.muted, borderColor: theme.color.border.default, borderRadius: 12, borderWidth: 1, flex: 1, gap: 8, minWidth: 190, padding: 12 },
  columnEditors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  columnNumber: { color: theme.color.text.secondary, fontSize: 12, fontWeight: '700' },
  confirmation: { backgroundColor: '#fff8e8', borderColor: '#edb955', borderRadius: 14, borderWidth: 1, gap: 12, padding: 16 },
  description: { color: theme.color.text.secondary, fontSize: 14, lineHeight: 21 },
  disabled: { opacity: 0.5 },
  empty: { color: theme.color.text.disabled, fontSize: 14, paddingVertical: 12 },
  failure: { backgroundColor: '#fff3f2', borderColor: '#efb2ad' },
  failureText: { color: '#C2413B', flex: 1, fontSize: 14 },
  feedback: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', padding: 12 },
  field: { flex: 1, gap: 7, minWidth: 210 },
  focused: { borderColor: theme.color.brand.secondary, borderWidth: 2 },
  grow: { flex: 1 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  headerMark: { backgroundColor: theme.color.brand.secondary, borderRadius: 4, height: 42, width: 5 },
  hint: { color: theme.color.text.secondary, fontSize: 13, lineHeight: 20 },
  history: { gap: 10 },
  historyRow: { borderBottomColor: theme.color.border.default, borderBottomWidth: 1, gap: 3, paddingVertical: 10 },
  hovered: { borderColor: theme.color.brand.secondary },
  input: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: 9, borderWidth: 1, color: theme.color.text.primary, fontSize: 14, minHeight: 42, paddingHorizontal: 11, paddingVertical: 9 },
  label: { color: theme.color.text.secondary, fontSize: 13, fontWeight: '600' },
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pressed: { opacity: 0.78 },
  preview: { backgroundColor: '#f2fbfb', borderColor: '#9edcdc', borderRadius: 14, borderWidth: 1, gap: 10, padding: 16 },
  previewHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  previewRow: { borderTopColor: theme.color.border.default, borderTopWidth: 1, gap: 4, paddingTop: 9 },
  previewScores: { color: theme.color.text.primary, fontSize: 13, lineHeight: 20 },
  previewTitle: { color: theme.color.text.primary, fontSize: 16, fontWeight: '800' },
  stack: { flexDirection: 'column' },
  studentBlock: { borderTopColor: theme.color.border.default, borderTopWidth: 1, gap: 10, paddingTop: 14 },
  studentName: { color: theme.color.text.primary, fontSize: 14, fontWeight: '700' },
  subtitle: { color: theme.color.text.primary, fontSize: 16, fontWeight: '800' },
  success: { backgroundColor: '#effaf4', borderColor: '#a8dec1' },
  successText: { color: '#16834A', flex: 1, fontSize: 14 },
  title: { color: theme.color.text.primary, fontSize: 22, fontWeight: '800' },
  valueCell: { flex: 1, gap: 7, minWidth: 180 },
  valueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  workspace: { gap: 14 },
  workspaceHeading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
});
