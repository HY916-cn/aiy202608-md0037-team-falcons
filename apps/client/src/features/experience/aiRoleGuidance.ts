import type { RoleCode } from '@dolphincloud/auth';

export type AiRoleGuidance = {
  readonly allowedWriteActions: readonly (
    | 'assignment_publish'
    | 'assessment_publish'
  )[];
  readonly suggestions: readonly string[];
  readonly writeHint: string;
};

export const AI_ROLE_GUIDANCE = {
  teacher: {
    allowedWriteActions: ['assignment_publish', 'assessment_publish'],
    suggestions: ['整理今天的教学事项', '列出当前班级作业', '查询已发布成绩'],
    writeHint: '可生成“发布作业”和“发布成绩”草稿；执行前必须由当前教师确认。',
  },
  class_terminal: {
    allowedWriteActions: [],
    suggestions: ['查询今日作业', '列出已发送课件', '整理当前班级事项'],
    writeHint: '当前角色仅提供查询建议，不提供 AI 写操作。',
  },
  family: {
    allowedWriteActions: [],
    suggestions: ['查询已发布作业', '查看已发布成绩', '整理今日事项'],
    writeHint: '当前角色仅提供绑定学生范围内的查询，不提供 AI 写操作。',
  },
  bank_operator: {
    allowedWriteActions: [],
    suggestions: ['整理今日待处理事项', '查询当前权限范围摘要'],
    writeHint: '账户与罚款操作请使用业务工作台；AI 暂不提供对应写操作。',
  },
  council: {
    allowedWriteActions: [],
    suggestions: ['整理今日待处理事项', '查询当前权限范围摘要'],
    writeHint: '班级分与更正申请请使用业务工作台；AI 暂不提供对应写操作。',
  },
  admin: {
    allowedWriteActions: [],
    suggestions: ['查询当前权限范围摘要', '整理今日待处理事项'],
    writeHint: '管理端 AI 仅提供查询，不提供账号或权限写操作。',
  },
} as const satisfies Record<RoleCode, AiRoleGuidance>;
