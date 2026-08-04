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
  const from = vi.fn((table: string) => {
    if (table === 'classes') {
      return {
        select: () => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }
    if (table === 'students') {
      return {
        select: () => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                class_id: 'class-1',
                display_name: '演示学生',
                id: 'student-1',
              },
            ],
            error: null,
          }),
        }),
      };
    }
    if (table === 'grade_records') {
      return {
        select: () => ({
          eq: () => ({
            order: vi.fn().mockResolvedValue({
              data: [GRADE_ROW],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'assessments') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue(assessmentResult),
          }),
        }),
      };
    }
    throw new Error(`UNEXPECTED_TABLE:${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe('SupabaseTeachingDemoAdapter', () => {
  it('assessment 查询失败时拒绝加载，不把成绩默认成已发布', async () => {
    const adapter = new SupabaseTeachingDemoAdapter(
      createClient({ data: null, error: new Error('query failed') }),
    );

    await expect(adapter.load('family')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('assessment 缺失时拒绝加载，不把缺失数据默认成已发布', async () => {
    const adapter = new SupabaseTeachingDemoAdapter(
      createClient({ data: null, error: null }),
    );

    await expect(adapter.load('family')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
