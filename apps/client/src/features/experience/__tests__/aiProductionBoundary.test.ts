import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import { UnavailableAiExperienceAdapter } from '../UnavailableAiExperienceAdapter';
import { AI_ROLE_GUIDANCE } from '../aiRoleGuidance';

describe('AI production boundary', () => {
  it('未配置网关时不返回 Mock 查询结果或写操作草稿', async () => {
    const adapter = new UnavailableAiExperienceAdapter();

    await adapter.submit('查询今日摘要');

    expect(adapter.getSnapshot()).toMatchObject({
      actionPreview: null,
      auditResult: null,
      result: null,
      state: 'offline',
      structuredResult: null,
    });
  });

  it('六角色都有只读建议，只有教师声明网关已支持的写操作', () => {
    ROLE_CODES.forEach((role) => {
      expect(AI_ROLE_GUIDANCE[role].suggestions.length).toBeGreaterThan(0);
    });
    expect(AI_ROLE_GUIDANCE.teacher.allowedWriteActions).toEqual([
      'assignment_publish',
      'assessment_publish',
    ]);
    ROLE_CODES.filter((role) => role !== 'teacher').forEach((role) => {
      expect(AI_ROLE_GUIDANCE[role].allowedWriteActions).toEqual([]);
    });
  });
});
