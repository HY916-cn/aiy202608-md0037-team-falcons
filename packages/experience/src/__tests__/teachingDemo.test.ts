import { describe, expect, it } from 'vitest';

import { MockTeachingDemoAdapter } from '../teachingDemo';

const TEACHER_SCOPE = {
  assignmentId: 'assignment-teacher-school',
  id: 'school-1',
  label: '演示学校',
  role: 'teacher',
  type: 'school',
} as const;
const CLASS_SCOPE = {
  assignmentId: 'assignment-class-one',
  id: '20000000-0000-0000-0000-000000000001',
  label: '演示一班',
  role: 'class_terminal',
  type: 'class',
} as const;
const FAMILY_SCOPE = {
  assignmentId: 'assignment-family-one',
  id: 'household-1',
  label: '演示家庭',
  role: 'family',
  type: 'household',
} as const;

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
    const teacher = await adapter.load(TEACHER_SCOPE);
    await adapter.publishGrade(teacher.grades[0]?.id ?? 'missing');

    const classTerminal = await adapter.load(CLASS_SCOPE);
    expect(classTerminal.courseware.map((item) => item.title)).toEqual([
      '一班课件',
    ]);
    expect(classTerminal.grades).toEqual([]);
    expect(classTerminal.students.slice(0, 1).map((student) => student.name)).toEqual([
      '演示学生01',
    ]);
    expect((await adapter.load(FAMILY_SCOPE)).courseware).toEqual([]);
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
    const teacher = await adapter.load(TEACHER_SCOPE);
    await adapter.publishGrade(teacher.grades[1]?.id ?? 'missing');

    const family = await adapter.load(FAMILY_SCOPE);
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
    const teacher = await adapter.load(TEACHER_SCOPE);
    await adapter.publishAssignment(teacher.assignments[0]?.id ?? 'missing');
    await adapter.publishGrade(teacher.grades[0]?.id ?? 'missing');

    const family = await adapter.load(FAMILY_SCOPE);
    expect(family.assignments).toHaveLength(1);
    expect(family.grades).toHaveLength(1);
    expect(family.grades[0]?.studentId).toBe(
      '50000000-0000-0000-0000-000000000001',
    );
  });

  it('同一教师切换班级 scope 后只返回当前班级数据', async () => {
    const adapter = new MockTeachingDemoAdapter();
    const classOne = await adapter.load({
      ...TEACHER_SCOPE,
      assignmentId: 'assignment-teacher-class-one',
      id: '20000000-0000-0000-0000-000000000001',
      label: '演示一班',
      type: 'class',
    });
    const classTwo = await adapter.load({
      ...TEACHER_SCOPE,
      assignmentId: 'assignment-teacher-class-two',
      id: '20000000-0000-0000-0000-000000000002',
      label: '演示二班',
      type: 'class',
    });

    expect(classOne.classes.map(({ id }) => id)).toEqual([
      '20000000-0000-0000-0000-000000000001',
    ]);
    expect(classTwo.classes.map(({ id }) => id)).toEqual([
      '20000000-0000-0000-0000-000000000002',
    ]);
  });

  it('教师端与班级端对同一班级返回一致的学生档案数量', async () => {
    const adapter = new MockTeachingDemoAdapter();
    const teacher = await adapter.load({
      ...TEACHER_SCOPE,
      assignmentId: 'assignment-teacher-class-one',
      id: CLASS_SCOPE.id,
      label: CLASS_SCOPE.label,
      type: 'class',
    });
    const classTerminal = await adapter.load(CLASS_SCOPE);

    expect(classTerminal.classes).toEqual(teacher.classes);
    expect(classTerminal.students).toEqual(teacher.students);
    expect(classTerminal.students).toHaveLength(2);
    expect(classTerminal.grades).toEqual([]);
  });
});
