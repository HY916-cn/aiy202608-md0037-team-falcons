import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import { createDemoTodaySummary } from '../todaySummary';

const EXPECTED_LABELS = {
  teacher: ['待发布作业', '待发布成绩', '新课件', '班级动态'],
  class_terminal: ['新课件', '今日作业', '班级分', '班级排行'],
  family: ['绑定学生作业', '已发布成绩', '学生分', '海豚币'],
  bank_operator: ['海豚币流水', '罚款单', '待处理事项'],
  council: ['班级分调整', '凭证', '班级排行'],
  admin: ['用户', '审计', '异常', '系统状态'],
} as const;

describe('createDemoTodaySummary', () => {
  it.each(ROLE_CODES)('只为 %s 返回本角色摘要字段', (role) => {
    const summary = createDemoTodaySummary(role);

    expect(summary.role).toBe(role);
    expect(summary.items.map((item) => item.label)).toEqual(
      EXPECTED_LABELS[role],
    );
  });
});
