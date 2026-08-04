import type { RoleCode } from '@dolphincloud/auth';

export type TodaySummaryItem = {
  readonly id: string;
  readonly label: string;
  readonly tone: 'attention' | 'info' | 'positive';
  readonly value: string;
};

export type TodaySummary = {
  readonly generatedAt: string;
  readonly items: readonly TodaySummaryItem[];
  readonly role: RoleCode;
  readonly title: string;
};

export type TodaySummaryDataSource = {
  load(role: RoleCode): Promise<TodaySummary>;
};

const DEMO_SUMMARY_ITEMS = {
  teacher: [
    ['pending-assignments', '待发布作业', '2 项', 'attention'],
    ['pending-grades', '待发布成绩', '1 项', 'attention'],
    ['new-courseware', '新课件', '3 份', 'info'],
    ['class-updates', '班级动态', '5 条', 'positive'],
  ],
  class_terminal: [
    ['new-courseware', '新课件', '3 份', 'info'],
    ['today-assignments', '今日作业', '2 项', 'attention'],
    ['class-score', '班级分', '128 分', 'positive'],
    ['class-ranking', '班级排行', '第 2 名', 'positive'],
  ],
  family: [
    ['linked-assignments', '绑定学生作业', '2 项', 'attention'],
    ['published-grades', '已发布成绩', '1 项', 'info'],
    ['student-score', '学生分', '96 分', 'positive'],
    ['dolphin-coins', '海豚币', '42 枚', 'positive'],
  ],
  bank_operator: [
    ['coin-ledger', '海豚币流水', '18 笔', 'info'],
    ['fine-orders', '罚款单', '3 单', 'attention'],
    ['pending-items', '待处理事项', '2 项', 'attention'],
  ],
  council: [
    ['class-score-adjustments', '班级分调整', '6 次', 'info'],
    ['evidence', '凭证', '4 份', 'attention'],
    ['class-ranking', '班级排行', '已更新', 'positive'],
  ],
  admin: [
    ['users', '用户', '58 个', 'info'],
    ['audit-events', '审计', '24 条', 'info'],
    ['anomalies', '异常', '1 项', 'attention'],
    ['system-status', '系统状态', '正常', 'positive'],
  ],
} as const satisfies Record<
  RoleCode,
  readonly (readonly [string, string, string, TodaySummaryItem['tone']])[]
>;

export function createDemoTodaySummary(role: RoleCode): TodaySummary {
  return {
    generatedAt: '2026-08-04T08:00:00.000Z',
    items: DEMO_SUMMARY_ITEMS[role].map(([id, label, value, tone]) => ({
      id,
      label,
      tone,
      value,
    })),
    role,
    title: '今日摘要',
  };
}

export class DemoTodaySummaryDataSource implements TodaySummaryDataSource {
  async load(role: RoleCode): Promise<TodaySummary> {
    return createDemoTodaySummary(role);
  }
}
