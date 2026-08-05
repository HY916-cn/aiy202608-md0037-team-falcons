import { ROLE_LABELS, type RoleCode } from '@dolphincloud/auth';

export type RoleNavigationKey =
  | 'home'
  | 'courseware'
  | 'assignment'
  | 'class'
  | 'ai'
  | 'growth'
  | 'coins'
  | 'accounts'
  | 'fines'
  | 'transactions'
  | 'class_score'
  | 'inspections'
  | 'appeals'
  | 'users'
  | 'permissions'
  | 'audit'
  | 'settings';

export const ROLE_NAVIGATION_KEYS = {
  admin: ['home', 'users', 'permissions', 'audit', 'settings'],
  bank_operator: ['home', 'accounts', 'fines', 'transactions', 'ai'],
  class_terminal: ['home', 'courseware', 'assignment', 'class', 'ai'],
  council: ['home', 'class_score', 'inspections', 'appeals', 'ai'],
  family: ['home', 'assignment', 'growth', 'coins', 'ai'],
  teacher: ['home', 'courseware', 'assignment', 'class', 'coins', 'ai'],
} as const satisfies Record<RoleCode, readonly RoleNavigationKey[]>;

export type RolePageHeader = {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
};

type RolePageCopy = Omit<RolePageHeader, 'eyebrow'>;

type RolePageHeaders = {
  readonly [Role in RoleCode]: Readonly<
    Record<(typeof ROLE_NAVIGATION_KEYS)[Role][number], RolePageCopy>
  >;
};

const ROLE_PAGE_HEADERS = {
  admin: {
    audit: { description: '按时间与操作人追溯系统操作。', title: '操作审计' },
    home: {
      description: '掌握账号、班级、权限与系统运行情况。',
      title: '管理工作台',
    },
    permissions: {
      description: '维护角色权限、业务规则与可用范围。',
      title: '权限与规则',
    },
    settings: { description: '维护应用基础配置与运行设置。', title: '系统设置' },
    users: { description: '管理账号、角色分配与班级关系。', title: '账号与班级' },
  },
  bank_operator: {
    accounts: { description: '查看并管理当前范围内的海豚币账户。', title: '账户' },
    ai: { description: '在校园银行权限范围内使用 AI 助手。', title: 'AI 中心' },
    fines: { description: '查看、核对并处理当前范围的罚款单。', title: '罚款单' },
    home: { description: '处理账户、罚款单与海豚币流水。', title: '校园银行' },
    transactions: { description: '按账户与时间查看海豚币收支记录。', title: '账户流水' },
  },
  class_terminal: {
    ai: { description: '在当前班级权限范围内使用 AI 助手。', title: 'AI 中心' },
    assignment: { description: '查看当前班级已发布的作业与截止时间。', title: '作业' },
    class: {
      description: '查看学生档案、班级分、排行与表现记录。',
      title: '班级表现',
    },
    courseware: { description: '查看教师发送到当前班级的课件。', title: '课件' },
    home: {
      description: '在公共设备上安全查看课件、作业与班级表现。',
      title: '班级工作台',
    },
  },
  council: {
    ai: { description: '在自治会权限范围内使用 AI 助手。', title: 'AI 中心' },
    appeals: { description: '查看并处理班级表现记录的更正申请。', title: '更正申请' },
    class_score: { description: '管理班级分变动并查看班级排行。', title: '班级分' },
    home: { description: '记录班级表现并处理更正申请。', title: '自治会工作台' },
    inspections: { description: '查看自治会已提交的班级检查记录。', title: '检查记录' },
  },
  family: {
    ai: { description: '在当前学生权限范围内使用 AI 助手。', title: 'AI 中心' },
    assignment: { description: '查看当前学生的作业与截止时间。', title: '作业' },
    coins: { description: '查看当前学生的海豚币余额、流水与罚款状态。', title: '海豚币' },
    growth: { description: '查看当前学生的成绩单与成长记录。', title: '成长记录' },
    home: {
      description: '查看孩子今天的任务、成长记录与海豚币。',
      title: '家庭首页',
    },
  },
  teacher: {
    ai: { description: '在教师权限范围内使用 AI 助手处理服务。', title: 'AI 中心' },
    assignment: { description: '发布并跟进当前班级的作业。', title: '作业' },
    class: { description: '查看学生档案并向当前班级发布成绩。', title: '班级与成绩' },
    coins: { description: '查看当前班级学生的海豚币余额、流水与罚款状态。', title: '海豚币' },
    courseware: { description: '向当前班级发送并管理课件。', title: '课件' },
    home: { description: '集中处理课堂评价、课件、作业与成绩。', title: '教学工作台' },
  },
} as const satisfies RolePageHeaders;

export function resolveRoleNavigationKey(
  role: RoleCode,
  candidate: string | undefined,
): RoleNavigationKey {
  return ROLE_NAVIGATION_KEYS[role].some((key) => key === candidate)
    ? (candidate as RoleNavigationKey)
    : 'home';
}

export function resolveRolePageHeader(
  role: RoleCode,
  activeNavigation: RoleNavigationKey,
): RolePageHeader {
  const resolvedNavigation = resolveRoleNavigationKey(role, activeNavigation);
  const roleHeaders: Readonly<Partial<Record<RoleNavigationKey, RolePageCopy>>> =
    ROLE_PAGE_HEADERS[role];
  const copy = roleHeaders[resolvedNavigation] ?? roleHeaders.home;
  if (copy === undefined) {
    throw new Error(`Missing page header for ${role}/${resolvedNavigation}`);
  }
  return {
    ...copy,
    eyebrow:
      resolvedNavigation === 'home'
        ? ROLE_LABELS[role]
        : `${ROLE_LABELS[role]} · ${copy.title}`,
  };
}
