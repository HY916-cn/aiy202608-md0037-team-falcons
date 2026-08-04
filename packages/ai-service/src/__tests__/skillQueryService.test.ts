import type { TeachingDemoAdapter } from '@dolphincloud/experience';
import { describe, expect, it, vi } from 'vitest';

import { SkillQueryService } from '../skillQueryService';

const EMPTY_SNAPSHOT = {
  assignments: [],
  classes: [],
  courseware: [],
  grades: [],
  students: [],
} as const;

function createService() {
  const load = vi.fn().mockResolvedValue(EMPTY_SNAPSHOT);
  const summaryLoad = vi.fn().mockResolvedValue({ role: 'family' });
  return {
    load,
    service: new SkillQueryService(
      { load } as unknown as TeachingDemoAdapter,
      { load: summaryLoad },
    ),
    summaryLoad,
  };
}

describe('SkillQueryService', () => {
  it('家庭查询通过 family 角色的现有 RLS adapter', async () => {
    const { load, service } = createService();

    await service.query('get_grades', {}, {
      permissionScope: '绑定家庭',
      role: 'family',
      userId: 'family-user',
    });

    expect(load).toHaveBeenCalledWith('family');
  });

  it('班级端禁止读取个人成绩', async () => {
    const { load, service } = createService();

    await expect(
      service.query('get_grades', {}, {
        permissionScope: '演示一班',
        role: 'class_terminal',
        userId: 'class-user',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(load).not.toHaveBeenCalled();
  });

  it('拒绝用参数选择其他学生或注入 scope', async () => {
    const { service } = createService();

    await expect(
      service.query('get_grades', { studentId: 'other-student' }, {
        permissionScope: '绑定家庭',
        role: 'family',
        userId: 'family-user',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.query('list_assignments', { scope: 'other-class' }, {
        permissionScope: '绑定家庭',
        role: 'family',
        userId: 'family-user',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
