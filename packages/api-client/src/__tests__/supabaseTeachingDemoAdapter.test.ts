import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseTeachingDemoAdapter } from '../supabaseTeachingDemoAdapter';

const GRADE_ROW = {
  assessment_id: 'assessment-1',
  comment: '继续努力',
  created_at: '2026-08-04T00:00:00.000Z',
  id: 'grade-1',
  score: 88,
  student_id: 'student-1',
  updated_at: '2026-08-04T00:00:00.000Z',
};

function createClient(assessmentResult: {
  readonly data: unknown;
  readonly error: Error | null;
}): SupabaseClient {
  function query(result: { readonly data: unknown; readonly error: Error | null }) {
    const chain = {
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue(result),
      select: vi.fn(() => chain),
      single: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }
  const from = vi.fn((table: string) => {
    if (table === 'role_assignments') {
      return query({ data: { id: 'assignment-family' }, error: null });
    }
    if (table === 'household_students') {
      return query({ data: [{ student_id: 'student-1' }], error: null });
    }
    if (table === 'classes') {
      return query({ data: [{ id: 'class-1', name: '演示一班' }], error: null });
    }
    if (table === 'students') {
      return query({
        data: [
          {
            class_id: 'class-1',
            display_name: '演示学生',
            id: 'student-1',
          },
        ],
        error: null,
      });
    }
    if (table === 'assignments') {
      return query({ data: [], error: null });
    }
    if (table === 'grade_records') {
      return query({ data: [GRADE_ROW], error: null });
    }
    if (table === 'assessments') {
      return query(assessmentResult);
    }
    throw new Error(`UNEXPECTED_TABLE:${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe('SupabaseTeachingDemoAdapter', () => {
  const familyScope = {
    assignmentId: 'assignment-family',
    id: 'household-1',
    label: '演示家庭',
    role: 'family',
    type: 'household',
  } as const;

  it('assessment 查询失败时拒绝加载，不把成绩默认成已发布', async () => {
    const adapter = new SupabaseTeachingDemoAdapter(
      createClient({ data: null, error: new Error('query failed') }),
    );

    await expect(adapter.load(familyScope)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('assessment 缺失时拒绝加载，不把缺失数据默认成已发布', async () => {
    const adapter = new SupabaseTeachingDemoAdapter(
      createClient({ data: null, error: null }),
    );

    await expect(adapter.load(familyScope)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('双班级教师切换 assignment 后查询与结果都只包含当前班级', async () => {
    const requestedClassIds: string[] = [];
    const assignmentFilters: [string, unknown][] = [];
    const emptyQuery = () => {
      const chain = {
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        select: vi.fn(() => chain),
      };
      return chain;
    };
    const from = vi.fn((table: string) => {
      if (table === 'role_assignments') {
        const chain = {
          eq: vi.fn((key: string, value: unknown) => {
            assignmentFilters.push([key, value]);
            return chain;
          }),
          single: vi.fn().mockResolvedValue({ data: { id: 'validated' }, error: null }),
        };
        return { select: () => chain };
      }
      if (table === 'classes') {
        let classId = '';
        const chain = {
          eq: vi.fn((key: string, value: unknown) => {
            if (key === 'id') classId = String(value);
            return chain;
          }),
          order: vi.fn().mockImplementation(async () => {
            requestedClassIds.push(classId);
            return { data: [{ id: classId, name: classId }], error: null };
          }),
        };
        return { select: () => chain };
      }
      return emptyQuery();
    });
    const adapter = new SupabaseTeachingDemoAdapter({ from } as unknown as SupabaseClient);
    const baseScope = {
      assignmentId: 'assignment-a',
      id: 'class-a',
      label: '班级 A',
      role: 'teacher',
      type: 'class',
    } as const;

    const classA = await adapter.load(baseScope);
    const classB = await adapter.load({
      ...baseScope,
      assignmentId: 'assignment-b',
      id: 'class-b',
      label: '班级 B',
    });

    expect(requestedClassIds).toEqual(['class-a', 'class-b']);
    expect(classA.classes.map(({ id }) => id)).toEqual(['class-a']);
    expect(classB.classes.map(({ id }) => id)).toEqual(['class-b']);
    expect(assignmentFilters).toContainEqual(['id', 'assignment-b']);
    expect(assignmentFilters).toContainEqual(['scope_id', 'class-b']);
  });
});
