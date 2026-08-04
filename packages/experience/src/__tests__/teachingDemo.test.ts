import { describe, expect, it } from 'vitest';

import { MockTeachingDemoAdapter } from '../teachingDemo';

describe('MockTeachingDemoAdapter', () => {
  it('班级端只接收本班课件且绝不读取个人成绩，家庭端不读取课件', async () => {
    const adapter = new MockTeachingDemoAdapter();
    const file = {
      body: new Uint8Array([1]),
      metadata: {
        mimeType: 'application/pdf' as const,
        originalFilename: '合成课件.pdf',
        sizeBytes: 1,
      },
    };
    await adapter.sendCourseware({
      classId: '20000000-0000-0000-0000-000000000001',
      file,
      subject: '数学',
      title: '一班课件',
    });
    await adapter.sendCourseware({
      classId: '20000000-0000-0000-0000-000000000002',
      file,
      subject: '数学',
      title: '二班课件',
    });
    await adapter.createGradeDraft({
      classId: '20000000-0000-0000-0000-000000000001',
      comment: '班级端不可见',
      score: 88,
      studentId: '50000000-0000-0000-0000-000000000001',
      subject: '数学',
      title: '隐私测验',
    });
    const teacher = await adapter.load('teacher');
    await adapter.publishGrade(teacher.grades[0]?.id ?? 'missing');

    const classTerminal = await adapter.load('class_terminal');
    expect(classTerminal.courseware.map((item) => item.title)).toEqual([
      '一班课件',
    ]);
    expect(classTerminal.grades).toEqual([]);
    expect((await adapter.load('family')).courseware).toEqual([]);
  });

  it('家庭端不能读取未发布成绩或其他学生成绩', async () => {
    const adapter = new MockTeachingDemoAdapter();
    await adapter.createGradeDraft({
      classId: '20000000-0000-0000-0000-000000000001',
      comment: '未发布成绩',
      score: 88,
      studentId: '50000000-0000-0000-0000-000000000001',
      subject: '数学',
      title: '演示测验',
    });
    await adapter.createGradeDraft({
      classId: '20000000-0000-0000-0000-000000000002',
      comment: '其他学生成绩',
      score: 99,
      studentId: '50000000-0000-0000-0000-000000000009',
      subject: '数学',
      title: '其他班测验',
    });
    const teacher = await adapter.load('teacher');
    await adapter.publishGrade(teacher.grades[1]?.id ?? 'missing');

    const family = await adapter.load('family');
    expect(family.grades).toEqual([]);
  });

  it('家庭端只读取绑定学生的已发布作业和成绩', async () => {
    const adapter = new MockTeachingDemoAdapter();
    await adapter.createAssignmentDraft({
      classId: '20000000-0000-0000-0000-000000000001',
      content: '合成作业内容',
      dueAt: '2026-08-10T18:00:00.000Z',
      subject: '数学',
      title: '合成作业',
    });
    await adapter.createGradeDraft({
      classId: '20000000-0000-0000-0000-000000000001',
      comment: '合成评语',
      score: 92,
      studentId: '50000000-0000-0000-0000-000000000001',
      subject: '数学',
      title: '合成测验',
    });
    const teacher = await adapter.load('teacher');
    await adapter.publishAssignment(teacher.assignments[0]?.id ?? 'missing');
    await adapter.publishGrade(teacher.grades[0]?.id ?? 'missing');

    const family = await adapter.load('family');
    expect(family.assignments).toHaveLength(1);
    expect(family.grades).toHaveLength(1);
    expect(family.grades[0]?.studentId).toBe(
      '50000000-0000-0000-0000-000000000001',
    );
  });
});
