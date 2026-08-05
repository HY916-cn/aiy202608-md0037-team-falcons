import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it, vi } from 'vitest';

import type {
  TeachingDemoAdapter,
  TeachingDemoSnapshot,
} from '../teachingDemo';
import {
  createDemoTodaySummary,
  TeachingTodaySummaryDataSource,
} from '../todaySummary';

const EXPECTED_LABELS = {
  teacher: ['待发布作业', '待发布成绩', '新课件', '班级动态'],
  class_terminal: ['新课件', '今日作业', '班级分', '班级排行'],
  family: ['绑定学生作业', '已发布成绩', '学生分', '海豚币'],
  bank_operator: ['海豚币流水', '罚款单', '待处理事项'],
  council: ['班级分调整', '凭证', '班级排行'],
  admin: ['用户', '审计', '异常', '系统状态'],
} as const;

function roleScope(role: (typeof ROLE_CODES)[number]) {
  return {
    assignmentId: `assignment-${role}`,
    id: role === 'family' ? 'household-1' : role === 'class_terminal' ? 'class-1' : 'school-1',
    label: `scope-${role}`,
    role,
    type: role === 'family' ? 'household' as const : role === 'class_terminal' ? 'class' as const : 'school' as const,
  };
}

describe('createDemoTodaySummary', () => {
  it.each(ROLE_CODES)('只为 %s 返回本角色摘要字段', (role) => {
    const summary = createDemoTodaySummary(role);

    expect(summary.role).toBe(role);
    expect(summary.dataMode).toBe('demo');
    expect(summary.title).toContain('演示数据');
    expect(summary.items.map((item) => item.label)).toEqual(
      EXPECTED_LABELS[role],
    );
  });
});

describe('TeachingTodaySummaryDataSource', () => {
  const snapshot: TeachingDemoSnapshot = {
    assignments: [
      {
        classId: 'class-1',
        content: '草稿内容',
        createdAt: '2026-08-04T01:00:00.000Z',
        dueAt: '2026-08-04T12:00:00.000Z',
        id: 'assignment-draft',
        publishedAt: null,
        status: 'draft',
        subject: '语文',
        teacherId: 'teacher-1',
        title: '草稿作业',
        updatedAt: '2026-08-04T01:00:00.000Z',
      },
      {
        classId: 'class-1',
        content: '已发布内容',
        createdAt: '2026-08-03T01:00:00.000Z',
        dueAt: '2026-08-05T12:00:00.000Z',
        id: 'assignment-published',
        publishedAt: '2026-08-03T02:00:00.000Z',
        status: 'published',
        subject: '数学',
        teacherId: 'teacher-1',
        title: '已发布作业',
        updatedAt: '2026-08-03T02:00:00.000Z',
      },
    ],
    classes: [{ id: 'class-1', name: '演示一班' }],
    courseware: [
      {
        classId: 'class-1',
        createdAt: '2026-08-04T03:00:00.000Z',
        id: 'courseware-1',
        mimeType: 'application/pdf',
        originalFilename: 'lesson.pdf',
        sizeBytes: 100,
        status: 'published',
        storagePath: 'teacher-1/lesson.pdf',
        subject: '语文',
        teacherId: 'teacher-1',
        title: '今日课件',
      },
    ],
    grades: [
      {
        assessmentId: 'assessment-1',
        assessmentTitle: '草稿测验',
        comment: '',
        createdAt: '2026-08-04T01:00:00.000Z',
        id: 'grade-draft',
        score: 80,
        status: 'draft',
        studentId: 'student-1',
        studentName: '演示学生',
        updatedAt: '2026-08-04T01:00:00.000Z',
      },
      {
        assessmentId: 'assessment-2',
        assessmentTitle: '已发布测验',
        comment: '',
        createdAt: '2026-08-03T01:00:00.000Z',
        id: 'grade-published',
        score: 90,
        status: 'published',
        studentId: 'student-1',
        studentName: '演示学生',
        updatedAt: '2026-08-03T01:00:00.000Z',
      },
    ],
    students: [{ classId: 'class-1', id: 'student-1', name: '演示学生' }],
  };

  it('从真实教学数据计算教师摘要，不使用固定数字', async () => {
    const load = vi.fn().mockResolvedValue(snapshot);
    const source = new TeachingTodaySummaryDataSource(
      { load } as unknown as TeachingDemoAdapter,
      () => new Date('2026-08-04T08:00:00.000Z'),
    );

    const summary = await source.load(roleScope('teacher'));

    expect(load).toHaveBeenCalledWith(roleScope('teacher'));
    expect(summary.dataMode).toBe('live');
    expect(summary.items.map(({ value }) => value)).toEqual([
      '1 项',
      '1 项',
      '1 份',
      '3 条',
    ]);
  });

  it.each(['bank_operator', 'council', 'admin'] as const)(
    '%s 没有真实摘要数据源时返回空列表而非占位统计',
    async (role) => {
      const load = vi.fn();
      const source = new TeachingTodaySummaryDataSource(
        { load } as unknown as TeachingDemoAdapter,
        () => new Date('2026-08-04T08:00:00.000Z'),
      );

      const summary = await source.load(roleScope(role));

      expect(load).not.toHaveBeenCalled();
      expect(summary.title).toBe('今日摘要');
      expect(summary.items).toEqual([]);
    },
  );
});
