import { describe, expect, it } from 'vitest';

import { saveGradeReportSheetDraftSchema } from '../gradeReportSheetSchemas';

const CLASS_ID = '20000000-0000-0000-0000-000000000001';
const STUDENT_ONE = '50000000-0000-0000-0000-000000000001';
const STUDENT_TWO = '50000000-0000-0000-0000-000000000002';

function createDraft() {
  return {
    classId: CLASS_ID,
    columns: [
      { columnKey: 'written', maxScore: 100, name: '笔试', position: 0 },
      { columnKey: 'practice', maxScore: 20, name: '实践', position: 1 },
      { columnKey: 'reading', maxScore: null, name: '阅读', position: 2 },
    ],
    rows: [STUDENT_ONE, STUDENT_TWO].map((studentId) => ({
      studentId,
      values: [
        { columnKey: 'written', comment: '', score: 90 },
        { columnKey: 'practice', comment: '合成评语', score: 18 },
        { columnKey: 'reading', comment: '', score: 95 },
      ],
    })),
    sheetId: null,
    source: 'grid' as const,
    subject: '数学',
    title: '三项目合成成绩单',
  };
}

describe('grade report sheet schemas', () => {
  it('接受单成绩项成绩单', () => {
    const draft = createDraft();
    draft.columns = [draft.columns[0]!];
    draft.rows = draft.rows.map((row) => ({
      ...row,
      values: [row.values[0]!],
    }));

    expect(saveGradeReportSheetDraftSchema.parse(draft).columns).toHaveLength(1);
  });

  it('接受三个成绩项和多个学生', () => {
    const result = saveGradeReportSheetDraftSchema.parse(createDraft());
    expect(result.columns).toHaveLength(3);
    expect(result.rows).toHaveLength(2);
  });

  it('拒绝缺少成绩项的学生行', () => {
    const draft = createDraft();
    draft.rows[0]!.values.pop();
    expect(() => saveGradeReportSheetDraftSchema.parse(draft)).toThrow();
  });

  it('拒绝超过成绩项满分的分值', () => {
    const draft = createDraft();
    draft.rows[0]!.values[1] = {
      columnKey: 'practice',
      comment: '',
      score: 21,
    };
    expect(() => saveGradeReportSheetDraftSchema.parse(draft)).toThrow();
  });

  it('拒绝超过两位小数的成绩值', () => {
    const draft = createDraft();
    draft.rows[0]!.values[0]!.score = 90.999;
    expect(() => saveGradeReportSheetDraftSchema.parse(draft)).toThrow();
  });

  it('拒绝超过两位小数或范围的满分', () => {
    const excessivePrecision = createDraft();
    excessivePrecision.columns[0]!.maxScore = 99.999;
    expect(() =>
      saveGradeReportSheetDraftSchema.parse(excessivePrecision),
    ).toThrow();

    const excessiveRange = createDraft();
    excessiveRange.columns[0]!.maxScore = 100000;
    expect(() => saveGradeReportSheetDraftSchema.parse(excessiveRange)).toThrow();
  });
});
