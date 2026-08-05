import type { AuthRoleScope } from '@dolphincloud/auth';
import type {
  Assignment,
  CoursewareFileMetadata,
  CoursewareItem,
  GradeRecord,
} from '@dolphincloud/domain';

export type TeachingClass = {
  readonly id: string;
  readonly name: string;
};

export type TeachingStudent = {
  readonly classId: string;
  readonly id: string;
  readonly name: string;
};

export type TeachingGrade = GradeRecord & {
  readonly assessmentTitle: string;
  readonly status: 'draft' | 'published';
  readonly studentName: string;
};

export type TeachingCourseware = CoursewareItem & {
  readonly classId: string;
};

export type TeachingDemoSnapshot = {
  readonly assignments: readonly Assignment[];
  readonly classes: readonly TeachingClass[];
  readonly courseware: readonly TeachingCourseware[];
  readonly grades: readonly TeachingGrade[];
  readonly students: readonly TeachingStudent[];
};

export type TeachingFilePayload = {
  readonly body: ArrayBuffer | Blob | Uint8Array;
  readonly metadata: CoursewareFileMetadata;
};

export interface TeachingDemoAdapter {
  createCoursewareDownloadUrl(coursewareId: string): Promise<string>;
  createAssignmentDraft(input: {
    readonly classId: string;
    readonly content: string;
    readonly dueAt: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void>;
  createGradeDraft(input: {
    readonly classId: string;
    readonly comment: string;
    readonly score: number;
    readonly studentId: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void>;
  load(roleScope: AuthRoleScope): Promise<TeachingDemoSnapshot>;
  publishAssignment(assignmentId: string): Promise<void>;
  publishGrade(gradeId: string): Promise<void>;
  reviseGrade(input: {
    readonly comment: string;
    readonly gradeId: string;
    readonly reason: string;
    readonly score: number;
  }): Promise<void>;
  sendCourseware(input: {
    readonly classId: string;
    readonly file: TeachingFilePayload;
    readonly subject: string;
    readonly title: string;
  }): Promise<void>;
  updateAssignmentDraft(
    assignmentId: string,
    input: { readonly content: string; readonly dueAt: string; readonly title: string },
  ): Promise<void>;
}

const CLASS_ONE = '20000000-0000-0000-0000-000000000001';
const CLASS_TWO = '20000000-0000-0000-0000-000000000002';
const STUDENT_ONE = '50000000-0000-0000-0000-000000000001';
const STUDENT_OTHER = '50000000-0000-0000-0000-000000000002';
const STUDENT_TWO = '50000000-0000-0000-0000-000000000009';

export class MockTeachingDemoAdapter implements TeachingDemoAdapter {
  private readonly classes: TeachingClass[] = [
    { id: CLASS_ONE, name: '演示一班' },
    { id: CLASS_TWO, name: '演示二班' },
  ];
  private readonly students: TeachingStudent[] = [
    { classId: CLASS_ONE, id: STUDENT_ONE, name: '演示学生01' },
    { classId: CLASS_ONE, id: STUDENT_OTHER, name: '演示学生02' },
    { classId: CLASS_TWO, id: STUDENT_TWO, name: '演示学生09' },
  ];
  private courseware: TeachingCourseware[] = [];
  private assignments: Assignment[] = [];
  private grades: TeachingGrade[] = [];

  async createCoursewareDownloadUrl(coursewareId: string): Promise<string> {
    return `https://example.invalid/courseware/${encodeURIComponent(coursewareId)}`;
  }
  private sequence = 1;

  constructor({ seedData = false }: { readonly seedData?: boolean } = {}) {
    if (seedData) this.seedDemoData();
  }

  async createAssignmentDraft(input: {
    readonly classId: string;
    readonly content: string;
    readonly dueAt: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    this.assignments = [
      ...this.assignments,
      {
        classId: input.classId,
        content: input.content,
        createdAt: now,
        dueAt: input.dueAt,
        id: `demo-assignment-${this.sequence++}`,
        publishedAt: null,
        status: 'draft',
        subject: input.subject,
        teacherId: 'demo-teacher',
        title: input.title,
        updatedAt: now,
      },
    ];
  }

  async createGradeDraft(input: {
    readonly classId: string;
    readonly comment: string;
    readonly score: number;
    readonly studentId: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const student = this.students.find((item) => item.id === input.studentId);
    if (student === undefined || student.classId !== input.classId) {
      throw new Error('FORBIDDEN');
    }
    this.grades = [
      ...this.grades,
      {
        assessmentId: `demo-assessment-${this.sequence}`,
        assessmentTitle: input.title,
        comment: input.comment,
        createdAt: now,
        id: `demo-grade-${this.sequence++}`,
        score: input.score,
        status: 'draft',
        studentId: input.studentId,
        studentName: student.name,
        updatedAt: now,
      },
    ];
  }

  async load(roleScope: AuthRoleScope): Promise<TeachingDemoSnapshot> {
    const role = roleScope.role;
    if (role === 'class_terminal') {
      const snapshot = this.snapshotForClasses([roleScope.id], true);
      return { ...snapshot, grades: [] };
    }
    if (role === 'family') {
      const snapshot = this.snapshotForClasses([CLASS_ONE], true);
      return {
        ...snapshot,
        courseware: [],
        grades: snapshot.grades.filter((grade) => grade.studentId === STUDENT_ONE),
        students: snapshot.students.filter((student) => student.id === STUDENT_ONE),
      };
    }
    if (role === 'teacher') {
      const classIds =
        roleScope.type === 'class'
          ? [roleScope.id]
          : this.classes.map((item) => item.id);
      return this.snapshotForClasses(classIds, false, true);
    }
    return { assignments: [], classes: [], courseware: [], grades: [], students: [] };
  }

  async publishAssignment(assignmentId: string): Promise<void> {
    const publishedAt = new Date().toISOString();
    this.assignments = this.assignments.map((item) =>
      item.id === assignmentId
        ? { ...item, publishedAt, status: 'published', updatedAt: publishedAt }
        : item,
    );
  }

  async publishGrade(gradeId: string): Promise<void> {
    this.grades = this.grades.map((item) =>
      item.id === gradeId ? { ...item, status: 'published' } : item,
    );
  }

  async reviseGrade(input: {
    readonly comment: string;
    readonly gradeId: string;
    readonly reason: string;
    readonly score: number;
  }): Promise<void> {
    if (input.reason.trim().length === 0) {
      throw new Error('VALIDATION_ERROR');
    }
    this.grades = this.grades.map((item) =>
      item.id === input.gradeId && item.status === 'published'
        ? { ...item, comment: input.comment, score: input.score, updatedAt: new Date().toISOString() }
        : item,
    );
  }

  async sendCourseware(input: {
    readonly classId: string;
    readonly file: TeachingFilePayload;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    this.courseware = [
      ...this.courseware,
      {
        classId: input.classId,
        createdAt: now,
        id: `demo-courseware-${this.sequence++}`,
        ...input.file.metadata,
        status: 'published',
        storagePath: `mock/${input.classId}/${this.sequence}`,
        subject: input.subject,
        teacherId: 'demo-teacher',
        title: input.title,
      },
    ];
  }

  async updateAssignmentDraft(
    assignmentId: string,
    input: { readonly content: string; readonly dueAt: string; readonly title: string },
  ): Promise<void> {
    this.assignments = this.assignments.map((item) =>
      item.id === assignmentId && item.status === 'draft'
        ? { ...item, ...input, updatedAt: new Date().toISOString() }
        : item,
    );
  }

  private snapshotForClasses(
    classIds: readonly string[],
    publishedOnly: boolean,
    includeDrafts = false,
  ): TeachingDemoSnapshot {
    const allowsStatus = (status: string) => includeDrafts || !publishedOnly || status === 'published';
    return {
      assignments: this.assignments.filter((item) => classIds.includes(item.classId) && allowsStatus(item.status)),
      classes: this.classes.filter((item) => classIds.includes(item.id)),
      courseware: this.courseware.filter(
        (item) => classIds.includes(item.classId) && allowsStatus(item.status),
      ),
      grades: this.grades.filter((item) => {
        const student = this.students.find((candidate) => candidate.id === item.studentId);
        return student !== undefined && classIds.includes(student.classId) && allowsStatus(item.status);
      }),
      students: this.students.filter((item) => classIds.includes(item.classId)),
    };
  }

  private seedDemoData(): void {
    const now = new Date().toISOString();
    this.courseware = Array.from({ length: 3 }, (_, index) => ({
      classId: CLASS_ONE,
      createdAt: now,
      id: `demo-seed-courseware-${index + 1}`,
      mimeType: 'application/pdf',
      originalFilename: `演示课件${index + 1}.pdf`,
      sizeBytes: 1024 + index,
      status: 'published',
      storagePath: `mock/${CLASS_ONE}/seed-${index + 1}`,
      subject: '数学',
      teacherId: 'demo-teacher',
      title: `演示课件 ${index + 1}`,
    }));
    this.assignments = Array.from({ length: 2 }, (_, index) => ({
      classId: CLASS_ONE,
      content: `完成演示练习 ${index + 1}`,
      createdAt: now,
      dueAt: now,
      id: `demo-seed-assignment-${index + 1}`,
      publishedAt: now,
      status: 'published',
      subject: '数学',
      teacherId: 'demo-teacher',
      title: `今日作业 ${index + 1}`,
      updatedAt: now,
    }));
  }
}
