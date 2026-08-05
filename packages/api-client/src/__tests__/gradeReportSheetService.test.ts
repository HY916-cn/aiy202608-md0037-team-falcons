import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseGradeReportSheetService } from '../gradeReportSheetService';

const sheet = {
  classId: '20000000-0000-0000-0000-000000000001',
  columns: [],
  createdAt: '2026-08-05T00:00:00Z',
  id: '85000000-0000-0000-0000-000000000001',
  publishedAt: null,
  rows: [],
  source: 'grid',
  status: 'draft',
  subject: '数学',
  teacherId: '30000000-0000-0000-0000-000000000001',
  title: '合成成绩单',
  updatedAt: '2026-08-05T00:00:00Z',
};

function createDraft() {
  return {
    classId: sheet.classId,
    columns: [
      { columnKey: 'written', maxScore: 100, name: '笔试', position: 0 },
    ],
    rows: [
      {
        studentId: '50000000-0000-0000-0000-000000000001',
        values: [{ columnKey: 'written', comment: '', score: 92 }],
      },
    ],
    sheetId: null,
    source: 'grid' as const,
    subject: '数学',
    title: '合成成绩单',
  };
}

describe('SupabaseGradeReportSheetService', () => {
  it('整张草稿只通过受控 RPC 原子保存', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: sheet, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const service = new SupabaseGradeReportSheetService(client);

    await expect(service.saveDraft(createDraft())).resolves.toMatchObject({
      id: sheet.id,
    });
    expect(rpc).toHaveBeenCalledWith('save_grade_report_sheet_draft', {
      normalized_columns: [
        { column_key: 'written', max_score: 100, name: '笔试', position: 0 },
      ],
      normalized_rows: [
        {
          student_id: '50000000-0000-0000-0000-000000000001',
          values: [{ column_key: 'written', comment: '', score: 92 }],
        },
      ],
      sheet_source: 'grid',
      sheet_subject: '数学',
      sheet_title: '合成成绩单',
      target_class_id: sheet.classId,
      target_sheet_id: null,
    });
  });

  it('无效整表 DTO 在调用 RPC 前被拒绝', async () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as SupabaseClient;
    const service = new SupabaseGradeReportSheetService(client);
    const draft = createDraft();
    draft.rows[0]!.values[0]!.score = 101;

    await expect(service.saveDraft(draft)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('整张成绩单通过发布 RPC 一次发布', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...sheet, publishedAt: '2026-08-05T01:00:00Z', status: 'published' },
      error: null,
    });
    const service = new SupabaseGradeReportSheetService(
      { rpc } as unknown as SupabaseClient,
    );

    await service.publishSheet(sheet.id);
    expect(rpc).toHaveBeenCalledWith('publish_grade_report_sheet', {
      target_sheet_id: sheet.id,
    });
  });
});
