import { describe, expect, it } from 'vitest';

import {
  createAssignmentDraftSchema,
  updateAssignmentDraftSchema,
} from '../assignmentSchemas';

describe('assignment schemas', () => {
  it('接受带截止时间的作业草稿', () => {
    expect(
      createAssignmentDraftSchema.parse({
        classId: '20000000-0000-0000-0000-000000000001',
        content: '完成第 1 至 3 题',
        dueAt: '2026-08-10T12:00:00+08:00',
        subject: '数学',
        title: '周末作业',
      }),
    ).toMatchObject({ title: '周末作业' });
  });

  it('拒绝没有任何字段的草稿修改', () => {
    expect(() => updateAssignmentDraftSchema.parse({})).toThrow(
      '至少提供一个修改字段',
    );
  });
});
