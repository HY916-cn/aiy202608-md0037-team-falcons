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
  readonly explanation: string;
  readonly result: string | null;
  readonly state: AiExperienceState;
};

export type AiExperienceActionPreview = WriteActionPreview & {
  readonly draftId: string;
};

export type AiExperienceListener = (snapshot: AiExperienceSnapshot) => void;

export interface AiExperienceAdapter {
  cancelAction(): Promise<void>;
  confirmAction(dangerousConfirmed: boolean): Promise<void>;
  getSnapshot(): AiExperienceSnapshot;
  reset(): void;
  returnToModify(): Promise<void>;
  selectActiveRole(roleScope: AuthRoleScope): Promise<void>;
  startListening(): void;
  submit(prompt: string): Promise<void>;
  subscribe(listener: AiExperienceListener): () => void;
}

type MockAiExperienceAdapterOptions = {
  readonly isOffline?: boolean;
  readonly result?: string;
};

const STATE_EXPLANATIONS = {
  idle: '海豚助手已准备好，普通教学功能始终可用。',
  listening: '正在听取你的需求。',
  thinking: '正在整理信息，不会直接执行写操作。',
  preview: '已生成结果预览，请检查后再继续。',
  success: '处理成功。',
  error: 'AI 暂时没有完成请求，请重试或使用普通功能。',
  offline: 'AI 当前离线，课件、作业和成绩功能不受影响。',
} as const satisfies Record<AiExperienceState, string>;

export function createAiExperienceSnapshot(
  state: AiExperienceState,
  result: string | null = null,
  actionPreview: AiExperienceActionPreview | null = null,
): AiExperienceSnapshot {
  return { actionPreview, explanation: STATE_EXPLANATIONS[state], result, state };
}

export class MockAiExperienceAdapter implements AiExperienceAdapter {
  private readonly listeners = new Set<AiExperienceListener>();
  private readonly result: string;
  private isOffline: boolean;
  private snapshot = createAiExperienceSnapshot('idle');

  constructor({
    isOffline = false,
    result = '已整理今日教学信息。',
  }: MockAiExperienceAdapterOptions = {}) {
    this.isOffline = isOffline;
    this.result = result;
    if (isOffline) {
      this.snapshot = createAiExperienceSnapshot('offline');
    }
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  async cancelAction(): Promise<void> {
    this.reset();
  }

  async confirmAction(_dangerousConfirmed: boolean): Promise<void> {
    this.succeed();
  }

  async returnToModify(): Promise<void> {
    this.setSnapshot(createAiExperienceSnapshot('listening'));
  }

  async selectActiveRole(_roleScope: AuthRoleScope): Promise<void> {
    await Promise.resolve();
  }

  reset(): void {
    this.setSnapshot(
      createAiExperienceSnapshot(this.isOffline ? 'offline' : 'idle'),
    );
  }

  setOffline(isOffline: boolean): void {
    this.isOffline = isOffline;
    this.setSnapshot(createAiExperienceSnapshot(isOffline ? 'offline' : 'idle'));
  }

  startListening(): void {
    if (!this.isOffline) {
      this.setSnapshot(createAiExperienceSnapshot('listening'));
    }
  }

  async submit(prompt: string): Promise<void> {
    if (this.isOffline) {
      this.setSnapshot(createAiExperienceSnapshot('offline'));
      return;
    }

    if (prompt.trim().length === 0) {
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }

    this.setSnapshot(createAiExperienceSnapshot('thinking'));
    await Promise.resolve();
    this.setSnapshot(createAiExperienceSnapshot('preview', this.result));
  }

  succeed(): void {
    this.setSnapshot(
      createAiExperienceSnapshot('success', this.snapshot.result),
    );
  }

  fail(): void {
    this.setSnapshot(createAiExperienceSnapshot('error'));
  }

  subscribe(listener: AiExperienceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setSnapshot(snapshot: AiExperienceSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }
}
