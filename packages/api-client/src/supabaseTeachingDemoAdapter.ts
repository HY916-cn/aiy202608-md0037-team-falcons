import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthRoleScope } from '@dolphincloud/auth';
import type {
  TeachingClass,
  TeachingCourseware,
  TeachingDemoAdapter,
  TeachingDemoSnapshot,
  TeachingFilePayload,
  TeachingGrade,
  TeachingStudent,
} from '@dolphincloud/experience';

import { SupabaseAssignmentService } from './assignmentService';
import { SupabaseCoursewareService } from './coursewareService';
import { ApiClientError } from './apiError';
import { SupabaseGradeService } from './gradeService';

type TeachingClassRow = { readonly id: string; readonly name: string };
type TeachingStudentRow = {
  readonly class_id: string;
  readonly display_name: string;
  readonly id: string;
};

export class SupabaseTeachingDemoAdapter implements TeachingDemoAdapter {
  private readonly assignments: SupabaseAssignmentService;
  private readonly courseware: SupabaseCoursewareService;
  private readonly grades: SupabaseGradeService;

  constructor(private readonly client: SupabaseClient) {
    this.assignments = new SupabaseAssignmentService(client);
    this.courseware = new SupabaseCoursewareService({ client });
    this.grades = new SupabaseGradeService(client);
  }

  async createAssignmentDraft(input: {
    readonly classId: string;
    readonly content: string;
    readonly dueAt: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    await this.assignments.createDraft(input);
  }

  async createCoursewareDownloadUrl(coursewareId: string): Promise<string> {
    return this.courseware.createDownloadUrl(coursewareId);
  }

  async createGradeDraft(input: {
    readonly classId: string;
    readonly comment: string;
    readonly score: number;
    readonly studentId: string;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    const assessment = await this.grades.createAssessmentDraft(input);
    await this.grades.saveGradeDrafts(assessment.id, [input]);
  }

  async load(roleScope: AuthRoleScope): Promise<TeachingDemoSnapshot> {
    const role = roleScope.role;
    if (!['teacher', 'class_terminal', 'family'].includes(role)) {
      return { assignments: [], classes: [], courseware: [], grades: [], students: [] };
    }

    await this.assertActiveScope(roleScope);

    let classResult: { data: TeachingClassRow[] | null; error: unknown };
    let studentResult: { data: TeachingStudentRow[] | null; error: unknown };
    if (role === 'family') {
      if (roleScope.type !== 'household') {
        throw new ApiClientError('FORBIDDEN');
      }
      const householdResult = await this.client
        .from('household_students')
        .select('student_id')
        .eq('household_id', roleScope.id);
      if (householdResult.error !== null) {
        throw new ApiClientError('FORBIDDEN');
      }
      const studentIds = (householdResult.data ?? []).map((row) => row.student_id as string);
      studentResult =
        studentIds.length === 0
          ? { data: [], error: null }
          : await this.client
              .from('students')
              .select('id, class_id, display_name')
              .in('id', studentIds)
              .order('display_name');
      const classIds = [
        ...new Set((studentResult.data ?? []).map((row) => row.class_id)),
      ];
      classResult =
        classIds.length === 0
          ? { data: [], error: null }
          : await this.client
              .from('classes')
              .select('id, name')
              .in('id', classIds)
              .order('name');
    } else {
      if (
        (role === 'class_terminal' && roleScope.type !== 'class') ||
        (role === 'teacher' && roleScope.type !== 'class' && roleScope.type !== 'school')
      ) {
        throw new ApiClientError('FORBIDDEN');
      }
      const classQuery = this.client.from('classes').select('id, name');
      if (roleScope.type === 'class') {
        classResult = await classQuery.eq('id', roleScope.id).order('name');
      } else {
        const {
          data: { user },
          error: userError,
        } = await this.client.auth.getUser();
        if (userError !== null || user === null) {
          throw new ApiClientError('UNAUTHENTICATED', { cause: userError });
        }
        const assignmentResult = await this.client
          .from('teacher_class_assignments')
          .select('class_id')
          .eq('teacher_id', user.id);
        if (assignmentResult.error !== null) {
          throw new ApiClientError('FORBIDDEN', {
            cause: assignmentResult.error,
          });
        }
        const assignedClassIds = (assignmentResult.data ?? []).map(
          (row) => row.class_id as string,
        );
        classResult =
          assignedClassIds.length === 0
            ? { data: [], error: null }
            : await classQuery.in('id', assignedClassIds).order('name');
      }
      const classIds = (classResult.data ?? []).map((row) => row.id);
      studentResult =
        classIds.length === 0
          ? { data: [], error: null }
          : await this.client
              .from('students')
              .select('id, class_id, display_name')
              .in('class_id', classIds)
              .order('display_name');
    }
    if (classResult.error !== null || studentResult.error !== null) {
      throw new ApiClientError('FORBIDDEN');
    }

    const classes = (classResult.data ?? []).map(
      (row): TeachingClass => ({ id: row.id as string, name: row.name as string }),
    );
    const students = (studentResult.data ?? []).map(
      (row): TeachingStudent => ({
        classId: row.class_id as string,
        id: row.id as string,
        name: row.display_name as string,
      }),
    );
    const assignmentLists = await Promise.all(
      classes.map((item) => this.assignments.listForClass(item.id)),
    );
    const coursewareLists =
      role === 'family'
        ? []
        : await Promise.all(
            classes.map(async (item): Promise<readonly TeachingCourseware[]> =>
              (await this.courseware.listForClass(item.id)).map((courseware) => ({
                ...courseware,
                classId: item.id,
              })),
            ),
          );
    const gradeLists =
      role === 'class_terminal'
        ? []
        : await Promise.all(
            students.map(async (student): Promise<readonly TeachingGrade[]> =>
              Promise.all(
                (await this.grades.listStudentGrades(student.id)).map(
                  async (grade) => {
                    const { data, error } = await this.client
                      .from('assessments')
                      .select('title, status')
                      .eq('id', grade.assessmentId)
                      .single();
                    if (
                      error !== null ||
                      data === null ||
                      typeof data.title !== 'string' ||
                      (data.status !== 'draft' && data.status !== 'published')
                    ) {
                      throw new ApiClientError('INTERNAL_ERROR', {
                        cause: error ?? new Error('INVALID_ASSESSMENT_DATA'),
                      });
                    }
                    return {
                      ...grade,
                      assessmentTitle: data.title,
                      status: data.status,
                      studentName: student.name,
                    };
                  },
                ),
              ),
            ),
          );

    return {
      assignments: assignmentLists.flat(),
      classes,
      courseware: coursewareLists.flat(),
      grades: gradeLists.flat(),
      students,
    };
  }

  private async assertActiveScope(roleScope: AuthRoleScope): Promise<void> {
    const { data, error } = await this.client
      .from('role_assignments')
      .select('id')
      .eq('id', roleScope.assignmentId)
      .eq('role', roleScope.role)
      .eq('scope_type', roleScope.type)
      .eq('scope_id', roleScope.id)
      .single();
    if (error !== null || typeof data?.id !== 'string') {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
  }

  async publishAssignment(assignmentId: string): Promise<void> {
    await this.assignments.publish(assignmentId);
  }

  async publishGrade(gradeId: string): Promise<void> {
    const { data, error } = await this.client
      .from('grade_records')
      .select('assessment_id')
      .eq('id', gradeId)
      .single();
    if (error !== null || data === null) {
      throw new ApiClientError('NOT_FOUND');
    }
    await this.grades.publishAssessment(data.assessment_id as string);
  }

  async reviseGrade(input: {
    readonly comment: string;
    readonly gradeId: string;
    readonly reason: string;
    readonly score: number;
  }): Promise<void> {
    await this.grades.reviseGrade(input.gradeId, input);
  }

  async sendCourseware(input: {
    readonly classId: string;
    readonly file: TeachingFilePayload;
    readonly subject: string;
    readonly title: string;
  }): Promise<void> {
    const item = await this.courseware.createCourseware({
      body: input.file.body,
      file: input.file.metadata,
      subject: input.subject,
      title: input.title,
    });
    await this.courseware.sendToClasses(item.id, [input.classId]);
  }

  async updateAssignmentDraft(
    assignmentId: string,
    input: { readonly content: string; readonly dueAt: string; readonly title: string },
  ): Promise<void> {
    await this.assignments.updateDraft(assignmentId, input);
  }
}
