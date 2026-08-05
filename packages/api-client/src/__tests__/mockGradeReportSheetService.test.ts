import { describe, expect, it } from 'vitest';

import {
  DEMO_GRADE_CLASS_ONE,
  DEMO_GRADE_STUDENT_ONE,
  DEMO_GRADE_STUDENT_OTHER,
  MockGradeReportSheetService,
} from '../mockGradeReportSheetService';

const students = [DEMO_GRADE_STUDENT_ONE, DEMO_GRADE_STUDENT_OTHER];

function createDraft(columnCount: number) {
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    columnKey: `item_${index + 1}`,
    maxScore: 100,
    name: `项目 ${index + 1}`,
    position: index,
  }));
  return {
    classId: DEMO_GRADE_CLASS_ONE,
    columns,
    rows: students.map((studentId, studentIndex) => ({
      studentId,
      values: columns.map((column, columnIndex) => ({
        columnKey: column.columnKey,
        comment: '合成评语',
        score: 80 + studentIndex + columnIndex,
      })),
    })),
    sheetId: null,
    source: 'grid' as const,
    subject: '数学',
    title: `${columnCount} 项成绩单`,
  };
}

describe('MockGradeReportSheetService', () => {
  it('提供单项、三项、草稿和已发布演示成绩单', async () => {
    const sheets = await new MockGradeReportSheetService().listClassSheets(
      DEMO_GRADE_CLASS_ONE,
    );
    expect(sheets.some((sheet) => sheet.columns.length === 1)).toBe(true);
    expect(sheets.some((sheet) => sheet.columns.length === 3)).toBe(true);
    expect(sheets.some((sheet) => sheet.status === 'draft')).toBe(true);
    expect(sheets.some((sheet) => sheet.status === 'published')).toBe(true);
  });

  it.each([1, 3])('保存并重新打开 %i 项、多学生草稿', async (columnCount) => {
    const service = new MockGradeReportSheetService({ seedData: false });
    const saved = await service.saveDraft(createDraft(columnCount));
    const reopened = await service.getSheet(saved.id);
    expect(reopened.columns).toHaveLength(columnCount);
    expect(reopened.rows).toHaveLength(2);
    expect(reopened.status).toBe('draft');
  });

  it('整张发布后家庭只读取本人一行且草稿不可见', async () => {
    const service = new MockGradeReportSheetService({ seedData: false });
    const draft = await service.saveDraft(createDraft(3));
    await expect(service.listStudentSheets(DEMO_GRADE_STUDENT_ONE)).resolves.toEqual([]);
    await service.publishSheet(draft.id);

    const current = await service.listStudentSheets(DEMO_GRADE_STUDENT_ONE);
    const other = await service.listStudentSheets(DEMO_GRADE_STUDENT_OTHER);
    expect(current).toHaveLength(1);
    expect(current[0]?.rows.map(({ studentId }) => studentId)).toEqual([
      DEMO_GRADE_STUDENT_ONE,
    ]);
    expect(other[0]?.rows.map(({ studentId }) => studentId)).toEqual([
      DEMO_GRADE_STUDENT_OTHER,
    ]);
  });

  it('发布后修订成绩并保存不可变历史', async () => {
    const service = new MockGradeReportSheetService({ seedData: false });
    const published = await service.publishSheet(
      (await service.saveDraft(createDraft(1))).id,
    );
    const value = published.rows[0]?.values[0];
    expect(value).toBeDefined();
    await service.reviseValue(value!.id, {
      comment: '复核后评语',
      reason: '录入复核',
      score: 93.5,
    });
    const revisions = await service.listValueRevisions(value!.id);
    expect(revisions).toMatchObject([
      { newScore: 93.5, oldScore: 80, reason: '录入复核' },
    ]);
  });

  it.each([
    [{ comment: '', reason: '', score: 90 }, '缺少原因'],
    [{ comment: '', reason: '复核', score: 90.999 }, '三位小数'],
    [{ comment: '', reason: '复核', score: 101 }, '超过满分'],
  ])('拒绝%s修订', async (input) => {
    const service = new MockGradeReportSheetService({ seedData: false });
    const published = await service.publishSheet(
      (await service.saveDraft(createDraft(1))).id,
    );
    await expect(
      service.reviseValue(published.rows[0]!.values[0]!.id, input),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
