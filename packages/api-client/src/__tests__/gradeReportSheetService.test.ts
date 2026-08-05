import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseGradeReportSheetService } from '../gradeReportSheetService';

const sheet = {
  classId: '20000000-0000-0000-0000-000000000001',
  columns: [
    {
      columnKey: 'written',
      id: '86000000-0000-0000-0000-000000000001',
      maxScore: 100,
      name: '笔试',
      position: 0,
    },
  ],
  createdAt: '2026-08-05T00:00:00Z',
  id: '85000000-0000-0000-0000-000000000001',
  publishedAt: null,
  rows: [
    {
      id: '87000000-0000-0000-0000-000000000001',
      studentId: '50000000-0000-0000-0000-000000000001',
      values: [
        {
          columnId: '86000000-0000-0000-0000-000000000001',
          comment: '',
          id: '88000000-0000-0000-0000-000000000001',
          score: 92,
        },
      ],
    },
  ],
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

  it('教师按当前班级列出草稿和已发布成绩单', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [sheet], error: null });
    const service = new SupabaseGradeReportSheetService(
      { rpc } as unknown as SupabaseClient,
    );

    await expect(service.listClassSheets(sheet.classId)).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('list_grade_report_sheets_for_class', {
      target_class_id: sheet.classId,
    });
  });

  it('教师重新打开指定成绩单', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: sheet, error: null });
    const service = new SupabaseGradeReportSheetService(
      { rpc } as unknown as SupabaseClient,
    );

    await expect(service.getSheet(sheet.id)).resolves.toMatchObject({
      id: sheet.id,
    });
    expect(rpc).toHaveBeenCalledWith('get_grade_report_sheet', {
      target_sheet_id: sheet.id,
    });
  });

  it('畸形成绩单 RPC 响应返回 INTERNAL_ERROR', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...sheet, rows: [{ ...sheet.rows[0], values: [] }] },
      error: null,
    });
    const service = new SupabaseGradeReportSheetService(
      { rpc } as unknown as SupabaseClient,
    );

    await expect(service.getSheet(sheet.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('非法状态和 numeric 字符串响应不能被强制转换', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...sheet, status: 'withdrawn', rows: [{ ...sheet.rows[0], values: [{ ...sheet.rows[0]!.values[0], score: '92' }] }] }],
      error: null,
    });
    const service = new SupabaseGradeReportSheetService(
      { rpc } as unknown as SupabaseClient,
    );

    await expect(service.listClassSheets(sheet.classId)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('所有读取和发布 ID 在请求前验证', async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    const service = new SupabaseGradeReportSheetService(
      { from, rpc } as unknown as SupabaseClient,
    );

    await expect(service.getSheet('not-a-uuid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.listClassSheets('not-a-uuid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.listStudentSheets('not-a-uuid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.publishSheet('not-a-uuid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.listValueRevisions('not-a-uuid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('畸形修订历史响应返回 INTERNAL_ERROR', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          actor_id: sheet.teacherId,
          created_at: sheet.createdAt,
          id: '89000000-0000-0000-0000-000000000001',
          new_comment: '',
          new_score: 90.999,
          old_comment: '',
          old_score: 90,
          reason: '合成复核',
          value_id: sheet.rows[0]!.values[0]!.id,
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const service = new SupabaseGradeReportSheetService(
      { from } as unknown as SupabaseClient,
    );

    await expect(
      service.listValueRevisions(sheet.rows[0]!.values[0]!.id),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
