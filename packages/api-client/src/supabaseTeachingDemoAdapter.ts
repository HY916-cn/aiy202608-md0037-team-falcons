import type { SupabaseClient } from '@supabase/supabase-js';
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

  async load(
    role: Parameters<TeachingDemoAdapter['load']>[0],
  ): Promise<TeachingDemoSnapshot> {
    if (!['teacher', 'class_terminal', 'family'].includes(role)) {
      return { assignments: [], classes: [], courseware: [], grades: [], students: [] };
    }

    const [classResult, studentResult] = await Promise.all([
      this.client.from('classes').select('id, name').order('name'),
      this.client
        .from('students')
        .select('id, class_id, display_name')
        .order('display_name'),
    ]);
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
    const coursewareLists = await Promise.all(
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
                    const { data } = await this.client
                      .from('assessments')
                      .select('title, status')
                      .eq('id', grade.assessmentId)
                      .single();
                    return {
                      ...grade,
                      assessmentTitle: (data?.title as string | undefined) ?? '成绩',
                      status:
                        data?.status === 'draft' ? 'draft' : 'published',
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
