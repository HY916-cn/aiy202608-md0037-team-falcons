import { describe, expect, it } from 'vitest';

import {
  countStudentsForClass,
  filterTeachingSnapshotForClass,
  resolveTeachingSectionPresentation,
} from '../roleTeachingPresentation';

describe('roleTeachingPresentation', () => {
  it('班级端 class 导航映射到班级表现而不是教师成绩页', () => {
    expect(resolveTeachingSectionPresentation('class_terminal', 'class')).toEqual({
      description: '查看当前班级学生档案、班级分、排行与表现记录。',
      mode: 'class_performance',
      title: '班级表现',
    });
    expect(resolveTeachingSectionPresentation('teacher', 'class').mode).toBe('grade');
  });

  it('同一快照的班级学生统计只使用当前班级', () => {
    expect(
      countStudentsForClass(
        {
          assignments: [],
          classes: [],
          courseware: [],
          grades: [],
          students: [
            { classId: 'class-a', id: 'student-a', name: '学生 A' },
            { classId: 'class-b', id: 'student-b', name: '学生 B' },
          ],
        },
        'class-a',
      ),
    ).toBe(1);
  });

  it('教师切换班级后只保留所选班级的教学数据', () => {
    const filtered = filterTeachingSnapshotForClass(
      {
        assignments: [
          {
            classId: 'class-a',
            content: 'A',
            createdAt: '2026-08-05T00:00:00.000Z',
            dueAt: '2026-08-06T00:00:00.000Z',
            id: 'assignment-a',
            publishedAt: null,
            status: 'draft',
            subject: '数学',
            teacherId: 'teacher-1',
            title: 'A 班作业',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
          {
            classId: 'class-b',
            content: 'B',
            createdAt: '2026-08-05T00:00:00.000Z',
            dueAt: '2026-08-06T00:00:00.000Z',
            id: 'assignment-b',
            publishedAt: '2026-08-05T01:00:00.000Z',
            status: 'published',
            subject: '数学',
            teacherId: 'teacher-1',
            title: 'B 班作业',
            updatedAt: '2026-08-05T01:00:00.000Z',
          },
        ],
        classes: [
          { id: 'class-a', name: 'A 班' },
          { id: 'class-b', name: 'B 班' },
        ],
        courseware: [
          {
            classId: 'class-a',
            createdAt: '2026-08-05T00:00:00.000Z',
            id: 'courseware-a',
            mimeType: 'application/pdf',
            originalFilename: 'a.pdf',
            sizeBytes: 1,
            status: 'published',
            storagePath: 'a.pdf',
            subject: '数学',
            teacherId: 'teacher-1',
            title: 'A 班课件',
          },
          {
            classId: 'class-b',
            createdAt: '2026-08-05T00:00:00.000Z',
            id: 'courseware-b',
            mimeType: 'application/pdf',
            originalFilename: 'b.pdf',
            sizeBytes: 1,
            status: 'published',
            storagePath: 'b.pdf',
            subject: '数学',
            teacherId: 'teacher-1',
            title: 'B 班课件',
          },
        ],
        grades: [
          {
            assessmentId: 'assessment-a',
            assessmentTitle: 'A 班测验',
            comment: '',
            createdAt: '2026-08-05T00:00:00.000Z',
            id: 'grade-a',
            score: 90,
            status: 'published',
            studentId: 'student-a',
            studentName: '学生 A',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
          {
            assessmentId: 'assessment-b',
            assessmentTitle: 'B 班测验',
            comment: '',
            createdAt: '2026-08-05T00:00:00.000Z',
            id: 'grade-b',
            score: 95,
            status: 'published',
            studentId: 'student-b',
            studentName: '学生 B',
            updatedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
        students: [
          { classId: 'class-a', id: 'student-a', name: '学生 A' },
          { classId: 'class-b', id: 'student-b', name: '学生 B' },
        ],
      },
      'class-b',
    );

    expect(filtered.assignments.map((item) => item.id)).toEqual([
      'assignment-b',
    ]);
    expect(filtered.courseware.map((item) => item.id)).toEqual([
      'courseware-b',
    ]);
    expect(filtered.grades.map((item) => item.id)).toEqual(['grade-b']);
    expect(filtered.students.map((item) => item.id)).toEqual(['student-b']);
  });
});
