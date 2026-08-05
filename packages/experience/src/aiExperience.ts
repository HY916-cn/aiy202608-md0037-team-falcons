import type { AuthRoleScope } from '@dolphincloud/auth';

import type { WriteActionPreview } from './writeAction';

export const AI_EXPERIENCE_STATES = [
  'idle',
  'listening',
  'thinking',
  'preview',
  'success',
  'error',
  'offline',
] as const;

export type AiExperienceState = (typeof AI_EXPERIENCE_STATES)[number];

export type AiExperienceSnapshot = {
  readonly actionPreview: AiExperienceActionPreview | null;
  readonly auditResult: AiAuditResult | null;
  readonly explanation: string;
  readonly result: string | null;
  readonly state: AiExperienceState;
  readonly structuredResult: AiStructuredResult | null;
};

export type AiAuditResult = {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly requestId: string | null;
};

export type AiStructuredResult = {
  readonly kind: string;
  readonly payload: unknown;
};

export type AiExperienceActionPreview = WriteActionPreview & {
  readonly draftId: string;
};

export type AiExperienceListener = (snapshot: AiExperienceSnapshot) => void;

export interface AiExperienceAdapter {
  cancelAction(previewId: string): Promise<void>;
  cancelRequest(): void;
  confirmAction(previewId: string, dangerousConfirmed: boolean): Promise<void>;
  getSnapshot(): AiExperienceSnapshot;
  newConversation(): void;
  reset(): void;
  retry(): Promise<void>;
  returnToModify(previewId: string): Promise<void>;
  selectActiveRole(roleScope: AuthRoleScope): Promise<boolean>;
  startListening(): void;
  submit(prompt: string): Promise<void>;
  subscribe(listener: AiExperienceListener): () => void;
}

const STATE_EXPLANATIONS = {
  idle: '海豚助手已准备好，普通教学功能始终可用。',
  listening: '正在听取你的需求。',
  thinking: '正在整理信息，不会直接执行写操作。',
  preview: '已生成结果预览，请检查后再继续。',
  success: '处理成功。',
  error: 'AI 暂时没有完成请求，请重试或联系系统管理员。普通业务功能不受影响。',
  offline: 'AI 服务暂不可用，请重试或联系系统管理员。普通业务功能不受影响。',
} as const satisfies Record<AiExperienceState, string>;

export function createAiExperienceSnapshot(
  state: AiExperienceState,
  result: string | null = null,
  actionPreview: AiExperienceActionPreview | null = null,
  structuredResult: AiStructuredResult | null = null,
  auditResult: AiAuditResult | null = null,
): AiExperienceSnapshot {
  return {
    actionPreview,
    auditResult,
    explanation: STATE_EXPLANATIONS[state],
    result,
    state,
    structuredResult,
  };
}
