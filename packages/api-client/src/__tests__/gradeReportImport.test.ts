import { describe, expect, it } from 'vitest';

import {
  normalizeGradeReportCsv,
  normalizeGradeReportCsvUpload,
  normalizeGradeReportMatrix,
} from '../gradeReportImport';

const context = {
  classId: '20000000-0000-0000-0000-000000000001',
  sheetId: null,
  subject: '数学',
  title: '合成导入成绩单',
};

const definition = {
  columns: [
    {
      columnKey: 'written',
      commentHeader: '笔试评语',
      maxScore: 100,
      name: '笔试',
      scoreHeader: '笔试',
    },
    {
      columnKey: 'practice',
      commentHeader: null,
      maxScore: 20,
      name: '实践',
      scoreHeader: '实践',
    },
  ],
  studentIdHeader: 'student_id',
};

describe('grade report imports', () => {
  it('把 CSV 规范化为整张成绩单 DTO', () => {
    const result = normalizeGradeReportCsv(
      context,
      definition,
      [
        'student_id,笔试,笔试评语,实践',
        '50000000-0000-0000-0000-000000000001,92,"合成,复核",18',
        '50000000-0000-0000-0000-000000000002,88,,17',
      ].join('\r\n'),
    );

    expect(result.source).toBe('csv');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.values[0]?.comment).toBe('合成,复核');
  });

  it('把 XLSX 解析器输出的二维数据规范化为同一 DTO', () => {
    const result = normalizeGradeReportMatrix(
      context,
      definition,
      [
        ['student_id', '笔试', '笔试评语', '实践'],
        ['50000000-0000-0000-0000-000000000001', 91.5, '合成评语', 19],
      ],
      'xlsx',
    );

    expect(result.source).toBe('xlsx');
    expect(result.rows[0]?.values.map((value) => value.score)).toEqual([91.5, 19]);
  });

  it('列名错误时原子拒绝且不返回部分 DTO', () => {
    expect(() =>
      normalizeGradeReportCsv(
        context,
        definition,
        'student_id,错误列,笔试评语,实践\n50000000-0000-0000-0000-000000000001,90,,18',
      ),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('数值错误时原子拒绝且不返回部分 DTO', () => {
    expect(() =>
      normalizeGradeReportCsv(
        context,
        definition,
        'student_id,笔试,笔试评语,实践\n50000000-0000-0000-0000-000000000001,九十,,18',
      ),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('CSV 中三位小数在规范化边界被拒绝', () => {
    expect(() =>
      normalizeGradeReportCsv(
        context,
        definition,
        'student_id,笔试,笔试评语,实践\n50000000-0000-0000-0000-000000000001,90.999,,18',
      ),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('从用户上传的 CSV 表头推导多个成绩项目并保留评语', () => {
    const result = normalizeGradeReportCsvUpload(
      context,
      [
        'student_id,笔试[100],笔试评语,实践[20],表达[10]',
        '50000000-0000-0000-0000-000000000001,92,稳定,18,9',
      ].join('\n'),
    );

    expect(result.columns.map(({ name, maxScore }) => [name, maxScore])).toEqual([
      ['笔试', 100],
      ['实践', 20],
      ['表达', 10],
    ]);
    expect(result.rows[0]?.values[0]?.comment).toBe('稳定');
  });

  it.each([
    ['缺少学生 ID', '笔试[100]\n90'],
    ['重复列', 'student_id,笔试,笔试\n50000000-0000-0000-0000-000000000001,90,91'],
    ['非法数字', 'student_id,笔试[100]\n50000000-0000-0000-0000-000000000001,九十'],
    ['超过满分', 'student_id,笔试[100]\n50000000-0000-0000-0000-000000000001,101'],
    ['三位小数', 'student_id,笔试[100]\n50000000-0000-0000-0000-000000000001,90.999'],
  ])('拒绝%s且不返回部分 DTO', (_label, csv) => {
    expect(() => normalizeGradeReportCsvUpload(context, csv)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
