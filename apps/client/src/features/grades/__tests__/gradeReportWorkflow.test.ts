import type { GradeReportSheet } from '@dolphincloud/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  addGradeReportColumn,
  beginFamilyScopeLoad,
  buildGradeReportDraftInput,
  buildGradeReportRevisionInput,
  canWriteGradeReports,
  createGradeReportDraftForm,
  prepareGradeReportCsvPreview,
  reopenGradeReportSheet,
  resolveGradeReportLayout,
} from '../gradeReportWorkflow';

const classId = '20000000-0000-0000-0000-000000000001';
const students = [
  { classId, id: '50000000-0000-0000-0000-000000000001', name: '合成学生 01' },
  { classId, id: '50000000-0000-0000-0000-000000000002', name: '合成学生 02' },
];

function completeForm(columnCount: number) {
  let form = createGradeReportDraftForm(classId, students);
  for (let index = 1; index < columnCount; index += 1) {
    form = addGradeReportColumn(form);
  }
  return {
    ...form,
    rows: form.rows.map((row, rowIndex) => ({
      ...row,
      values: Object.fromEntries(
        form.columns.map((column, columnIndex) => [
          column.key,
          { comment: '合成评语', score: String(80 + rowIndex + columnIndex) },
        ]),
      ),
    })),
    subject: '数学',
    title: `${columnCount} 项成绩单`,
  };
}

describe('gradeReportWorkflow', () => {
  it.each([1, 3])('构建 %i 项、多学生填写 DTO', (columnCount) => {
    const input = buildGradeReportDraftInput(completeForm(columnCount));
    expect(input.columns).toHaveLength(columnCount);
    expect(input.rows).toHaveLength(2);
    expect(input.rows.every((row) => row.values.length === columnCount)).toBe(true);
  });

  it('把服务端成绩单重新打开为可编辑草稿', () => {
    const input = buildGradeReportDraftInput(completeForm(1));
    const sheet: GradeReportSheet = {
      classId,
      columns: input.columns.map((column) => ({ ...column, id: '86000000-0000-0000-0000-000000000001' })),
      createdAt: '2026-08-05T00:00:00.000Z',
      id: '85000000-0000-0000-0000-000000000001',
      publishedAt: null,
      rows: input.rows.map((row, index) => ({
        id: `87000000-0000-0000-0000-00000000000${index + 1}`,
        studentId: row.studentId,
        values: row.values.map((value, valueIndex) => ({
          columnId: '86000000-0000-0000-0000-000000000001',
          comment: value.comment,
          id: `88000000-0000-0000-0000-0000000000${index}${valueIndex}`,
          score: value.score,
        })),
      })),
      source: 'grid',
      status: 'draft',
      subject: input.subject,
      teacherId: '30000000-0000-0000-0000-000000000001',
      title: input.title,
      updatedAt: '2026-08-05T00:00:00.000Z',
    };

    const reopened = reopenGradeReportSheet(sheet, students);
    expect(reopened.sheetId).toBe(sheet.id);
    expect(reopened.rows[1]?.studentName).toBe('合成学生 02');
    expect(reopened.rows[0]?.values.item_1?.score).toBe('80');
  });

  it('CSV 非法列或非法数字时不进入保存调用', () => {
    const saveDraft = vi.fn();
    const runImport = (csv: string) => {
      const preview = prepareGradeReportCsvPreview(
        { classId, sheetId: null, subject: '数学', title: '导入成绩单' },
        csv,
      );
      saveDraft(preview);
    };
    expect(() => runImport('student_id,笔试,笔试\n50000000-0000-0000-0000-000000000001,90,91')).toThrow();
    expect(() => runImport('student_id,笔试[100]\n50000000-0000-0000-0000-000000000001,九十')).toThrow();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('家庭 scope 切换开始时同步清空旧学生与旧成绩单', () => {
    expect(beginFamilyScopeLoad()).toEqual({
      isLoading: true,
      sheets: [],
      studentId: null,
    });
  });

  it('只有教师角色可以进入写操作', () => {
    const base = { assignmentId: 'assignment', id: classId, label: '演示范围', type: 'class' as const };
    expect(canWriteGradeReports({ ...base, role: 'teacher' })).toBe(true);
    expect(canWriteGradeReports({ ...base, role: 'family' })).toBe(false);
    expect(canWriteGradeReports({ ...base, role: 'class_terminal' })).toBe(false);
  });

  it('390px 使用卡片布局而不是横向压缩宽表', () => {
    expect(resolveGradeReportLayout(390)).toBe('compact');
    expect(resolveGradeReportLayout(1024)).toBe('table');
  });

  it.each([
    ['90.999', '复核', 100],
    ['101', '复核', 100],
    ['90', '', 100],
  ])('拒绝非法修订：score=%s reason=%s', (score, reason, maxScore) => {
    expect(() => buildGradeReportRevisionInput(score, '', reason, maxScore)).toThrow();
  });
});
