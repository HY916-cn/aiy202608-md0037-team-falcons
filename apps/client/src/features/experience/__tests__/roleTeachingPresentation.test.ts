import { describe, expect, it } from 'vitest';

import {
  countStudentsForClass,
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
});
