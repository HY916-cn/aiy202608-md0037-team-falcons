import { describe, expect, it } from 'vitest';

import { reviseGradeSchema, saveGradeDraftsSchema } from '../gradeSchemas';

describe('grade schemas', () => {
  it('接受合成学生的成绩草稿', () => {
    expect(
      saveGradeDraftsSchema.parse({
        assessmentId: '80000000-0000-0000-0000-000000000001',
        grades: [
          {
            comment: '合成评语',
            score: 92.5,
            studentId: '50000000-0000-0000-0000-000000000001',
          },
        ],
      }).grades,
    ).toHaveLength(1);
  });

  it('拒绝没有修订原因的成绩修改', () => {
    expect(() =>
      reviseGradeSchema.parse({
        comment: '',
        gradeId: '81000000-0000-0000-0000-000000000001',
        reason: ' ',
        score: 90,
      }),
    ).toThrow();
  });
});
