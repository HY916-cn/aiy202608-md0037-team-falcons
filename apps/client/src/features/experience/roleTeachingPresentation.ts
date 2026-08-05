import type { RoleCode } from '@dolphincloud/auth';
import type { TeachingDemoSnapshot } from '@dolphincloud/experience';
import type { RoleNavigationKey } from '@dolphincloud/ui';

export type TeachingContentMode =
  | 'assignment'
  | 'class_performance'
  | 'courseware'
  | 'grade'
  | 'growth'
  | 'overview';

export type TeachingSectionPresentation = {
  readonly description: string;
  readonly mode: TeachingContentMode;
  readonly title: string;
};

export function resolveTeachingSectionPresentation(
  role: RoleCode,
  activeNavigation: RoleNavigationKey,
): TeachingSectionPresentation {
  if (activeNavigation === 'courseware') {
    return {
      description: '处理教师与班级之间的课件传输。',
      mode: 'courseware',
      title: '课件中心',
    };
  }
  if (activeNavigation === 'assignment') {
    return {
      description: '发布、查看并跟进当前范围内的作业。',
      mode: 'assignment',
      title: '作业中心',
    };
  }
  if (activeNavigation === 'class' && role === 'class_terminal') {
    return {
      description: '查看当前班级学生档案、班级分、排行与表现记录。',
      mode: 'class_performance',
      title: '班级表现',
    };
  }
  if (activeNavigation === 'class') {
    return {
      description: '查看当前班级学生，并在确认后发布成绩。',
      mode: 'grade',
      title: '班级与成绩',
    };
  }
  if (activeNavigation === 'growth') {
    return {
      description: '查看已发布的成绩和学习记录。',
      mode: 'growth',
      title: '成长记录',
    };
  }
  return {
    description:
      role === 'teacher'
        ? '在同一处完成课件发送、作业发布与成绩管理。'
        : '按发布时间查看教师发送的课件与作业。',
    mode: 'overview',
    title: role === 'teacher' ? '教学内容' : '班级教学资料',
  };
}

export function countStudentsForClass(
  snapshot: TeachingDemoSnapshot,
  classId: string,
): number {
  return snapshot.students.filter((student) => student.classId === classId).length;
}

export function filterTeachingSnapshotForClass(
  snapshot: TeachingDemoSnapshot,
  classId: string | null,
): TeachingDemoSnapshot {
  if (classId === null) {
    return {
      assignments: [],
      classes: snapshot.classes,
      courseware: [],
      grades: [],
      students: [],
    };
  }

  const students = snapshot.students.filter(
    (student) => student.classId === classId,
  );
  const studentIds = new Set(students.map((student) => student.id));

  return {
    assignments: snapshot.assignments.filter(
      (assignment) => assignment.classId === classId,
    ),
    classes: snapshot.classes,
    courseware: snapshot.courseware.filter(
      (courseware) => courseware.classId === classId,
    ),
    grades: snapshot.grades.filter((grade) => studentIds.has(grade.studentId)),
    students,
  };
}
