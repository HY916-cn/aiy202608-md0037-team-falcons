import type { AuthRoleScope } from '@dolphincloud/auth';
import type { GradeReportSheet } from '@dolphincloud/domain';
import type { TeachingStudent } from '@dolphincloud/experience';
import { InteractivePressable, theme } from '@dolphincloud/ui';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSupabaseServices } from '../supabase/SupabaseServiceProvider';
import {
  GradeActionButton,
  GradeReportFeedback,
  GradeReportHeader,
} from './GradeReportUi';
import { beginFamilyScopeLoad, type FamilyGradeReportState } from './gradeReportWorkflow';

export function FamilyGradeReportList({
  roleScope,
}: {
  readonly roleScope: AuthRoleScope;
}) {
  const { gradeReportService, teachingAdapter } = useSupabaseServices();
  const [students, setStudents] = useState<readonly TeachingStudent[]>([]);
  const [state, setState] = useState<FamilyGradeReportState>(beginFamilyScopeLoad);
  const [error, setError] = useState<string | null>(null);

  const loadStudent = useCallback(async (studentId: string) => {
    setState({ isLoading: true, sheets: [], studentId });
    setError(null);
    try {
      const response = await gradeReportService.listStudentSheets(studentId);
      setState({
        isLoading: false,
        sheets: response
          .filter((sheet) => sheet.status === 'published')
          .map((sheet) => ({
            ...sheet,
            rows: sheet.rows.filter((row) => row.studentId === studentId),
          }))
          .filter((sheet) => sheet.rows.length === 1),
        studentId,
      });
    } catch {
      setState({ isLoading: false, sheets: [], studentId });
      setError('成绩单加载失败，请重试。');
    }
  }, [gradeReportService]);

  const loadScope = useCallback(async () => {
    setStudents([]);
    setState(beginFamilyScopeLoad());
    setError(null);
    try {
      const snapshot = await teachingAdapter.load(roleScope);
      setStudents(snapshot.students);
      const studentId = snapshot.students[0]?.id ?? null;
      if (studentId === null) {
        setState({ isLoading: false, sheets: [], studentId: null });
        return;
      }
      await loadStudent(studentId);
    } catch {
      setState({ isLoading: false, sheets: [], studentId: null });
      setError('家庭绑定信息加载失败，请重试。');
    }
  }, [loadStudent, roleScope, teachingAdapter]);

  useEffect(() => {
    void Promise.resolve().then(loadScope);
  }, [loadScope]);

  return (
    <View style={styles.section}>
      <GradeReportHeader
        description="这里只展示当前家庭权限范围绑定学生本人的已发布成绩单。"
        title="成长与成绩单"
      />
      <GradeReportFeedback error={error} message={null} onRetry={() => void loadScope()} />
      {students.length > 1 ? (
        <View style={styles.selector}>
          <Text style={styles.label}>绑定学生</Text>
          <View style={styles.actions}>
            {students.map((student) => (
              <InteractivePressable
                key={student.id}
                onPress={() => void loadStudent(student.id)}
                style={[styles.studentButton, state.studentId === student.id && styles.studentButtonSelected]}
              >
                <Text style={[styles.studentButtonText, state.studentId === student.id && styles.studentButtonTextSelected]}>{student.name}</Text>
              </InteractivePressable>
            ))}
          </View>
        </View>
      ) : null}
      {state.isLoading ? <Text style={styles.empty}>正在读取已发布成绩单…</Text> : null}
      {!state.isLoading && state.studentId === null ? <Text style={styles.empty}>当前家庭范围未绑定学生。</Text> : null}
      {!state.isLoading && state.studentId !== null && state.sheets.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>暂无已发布成绩单</Text>
          <Text style={styles.empty}>教师保存的草稿不会在家庭端显示。</Text>
          <GradeActionButton label="重新加载" onPress={() => void loadStudent(state.studentId!)} secondary />
        </View>
      ) : null}
      {state.sheets.map((sheet) => (
        <FamilySheet key={sheet.id} sheet={sheet} />
      ))}
    </View>
  );
}

function FamilySheet({ sheet }: { readonly sheet: GradeReportSheet }) {
  const row = sheet.rows[0];
  if (row === undefined) return null;
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeading}>
        <View style={styles.grow}>
          <Text style={styles.sheetTitle}>{sheet.title}</Text>
          <Text style={styles.meta}>{sheet.subject} · 发布于 {new Date(sheet.publishedAt ?? '').toLocaleString()}</Text>
        </View>
        <View style={styles.publishedBadge}><Text style={styles.publishedText}>已发布</Text></View>
      </View>
      <View style={styles.items}>
        {[...sheet.columns]
          .sort((left, right) => left.position - right.position)
          .map((column) => {
            const value = row.values.find((candidate) => candidate.columnId === column.id);
            return (
              <View key={column.id} style={styles.item}>
                <Text style={styles.itemName}>{column.name}</Text>
                <Text style={styles.score}>{value?.score ?? '—'}{column.maxScore === null ? '' : ` / ${column.maxScore}`}</Text>
                <Text style={styles.comment}>{value?.comment || '暂无评语'}</Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  comment: { color: theme.color.text.secondary, fontSize: 13, lineHeight: 20 },
  empty: { color: theme.color.text.disabled, fontSize: 14, lineHeight: 21 },
  emptyPanel: { alignItems: 'flex-start', backgroundColor: theme.color.surface.muted, borderRadius: 12, gap: 8, padding: 16 },
  emptyTitle: { color: theme.color.text.primary, fontSize: 16, fontWeight: '800' },
  grow: { flex: 1 },
  item: { backgroundColor: theme.color.surface.muted, borderRadius: 12, flex: 1, gap: 6, minWidth: 180, padding: 14 },
  itemName: { color: theme.color.text.secondary, fontSize: 13, fontWeight: '700' },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  label: { color: theme.color.text.secondary, fontSize: 13, fontWeight: '700' },
  meta: { color: theme.color.text.secondary, fontSize: 13, lineHeight: 20 },
  publishedBadge: { backgroundColor: '#E8F8F0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  publishedText: { color: '#16834A', fontSize: 12, fontWeight: '800' },
  score: { color: theme.color.brand.primary, fontSize: 24, fontWeight: '900' },
  section: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: theme.radius.card, borderWidth: 1, gap: 18, maxWidth: '100%', padding: 20 },
  selector: { gap: 8 },
  sheet: { borderColor: theme.color.border.default, borderRadius: 14, borderWidth: 1, gap: 14, padding: 16 },
  sheetHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  sheetTitle: { color: theme.color.text.primary, fontSize: 18, fontWeight: '800' },
  studentButton: { backgroundColor: theme.color.surface.card, borderColor: theme.color.border.default, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  studentButtonSelected: { backgroundColor: theme.color.brand.primary, borderColor: theme.color.brand.primary },
  studentButtonText: { color: theme.color.text.primary, fontSize: 13, fontWeight: '700' },
  studentButtonTextSelected: { color: '#ffffff' },
});
