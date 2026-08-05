import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';

import type { TeachingDemoAdapter, TeachingDemoSnapshot } from './teachingDemo';

export type TodaySummaryItem = {
  readonly id: string;
  readonly label: string;
  readonly tone: 'attention' | 'info' | 'positive';
  readonly value: string;
};

export type TodaySummary = {
  readonly dataMode: 'demo' | 'live';
  readonly generatedAt: string;
  readonly items: readonly TodaySummaryItem[];
  readonly role: RoleCode;
  readonly title: string;
};

export type TodaySummaryDataSource = {
  load(roleScope: AuthRoleScope): Promise<TodaySummary>;
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

function mapItems(
  items: readonly (readonly [string, string, string, TodaySummaryItem['tone']])[],
): readonly TodaySummaryItem[] {
  return items.map(([id, label, value, tone]) => ({ id, label, tone, value }));
}

function isToday(value: string | null, today: string): boolean {
  return value !== null && value.slice(0, 10) === today;
}

function createTeachingItems(
  role: 'class_terminal' | 'family' | 'teacher',
  snapshot: TeachingDemoSnapshot,
  today: string,
): readonly TodaySummaryItem[] {
  if (role === 'teacher') {
    const draftAssignments = snapshot.assignments.filter(
      (item) => item.status === 'draft',
    ).length;
    const draftGrades = snapshot.grades.filter(
      (item) => item.status === 'draft',
    ).length;
    const newCourseware = new Set(
      snapshot.courseware
        .filter((item) => isToday(item.createdAt, today))
        .map((item) => item.id),
    ).size;
    const classUpdates =
      snapshot.assignments.filter((item) => item.status === 'published').length +
      snapshot.grades.filter((item) => item.status === 'published').length +
      new Set(snapshot.courseware.map((item) => item.id)).size;

    return [
      { id: 'pending-assignments', label: '待发布作业', tone: 'attention', value: `${draftAssignments} 项` },
      { id: 'pending-grades', label: '待发布成绩', tone: 'attention', value: `${draftGrades} 项` },
      { id: 'new-courseware', label: '新课件', tone: 'info', value: `${newCourseware} 份` },
      { id: 'class-updates', label: '班级动态', tone: 'positive', value: `${classUpdates} 条` },
    ];
  }

  if (role === 'class_terminal') {
    const newCourseware = new Set(
      snapshot.courseware
        .filter((item) => isToday(item.createdAt, today))
        .map((item) => item.id),
    ).size;
    const todayAssignments = snapshot.assignments.filter(
      (item) => isToday(item.dueAt, today),
    ).length;
    return [
      { id: 'new-courseware', label: '新课件', tone: 'info', value: `${newCourseware} 份` },
      { id: 'today-assignments', label: '今日作业', tone: 'attention', value: `${todayAssignments} 项` },
    ];
  }

  return [
    { id: 'linked-assignments', label: '绑定学生作业', tone: 'attention', value: `${snapshot.assignments.length} 项` },
    { id: 'published-grades', label: '已发布成绩', tone: 'info', value: `${snapshot.grades.length} 项` },
  ];
}

export function createDemoTodaySummary(role: RoleCode): TodaySummary {
  return {
    dataMode: 'demo',
    generatedAt: '2026-08-04T08:00:00.000Z',
    items: mapItems(DEMO_SUMMARY_ITEMS[role]),
    role,
    title: '今日摘要（演示数据）',
  };
}

export class DemoTodaySummaryDataSource implements TodaySummaryDataSource {
  async load(roleScope: AuthRoleScope): Promise<TodaySummary> {
    return createDemoTodaySummary(roleScope.role);
  }
}

export class TeachingTodaySummaryDataSource implements TodaySummaryDataSource {
  constructor(
    private readonly teachingAdapter: TeachingDemoAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly dataMode: TodaySummary['dataMode'] = 'live',
  ) {}

  async load(roleScope: AuthRoleScope): Promise<TodaySummary> {
    const role = roleScope.role;
    const generatedAt = this.now().toISOString();
    if (role === 'admin' || role === 'bank_operator' || role === 'council') {
      return {
        dataMode: this.dataMode,
        generatedAt,
        items: [],
        role,
        title: '今日摘要',
      };
    }

    const snapshot = await this.teachingAdapter.load(roleScope);
    return {
      dataMode: this.dataMode,
      generatedAt,
      items: createTeachingItems(role, snapshot, generatedAt.slice(0, 10)),
      role,
      title: this.dataMode === 'demo' ? '今日摘要（演示数据）' : '今日摘要',
    };
  }
}
