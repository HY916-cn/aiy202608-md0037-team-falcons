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
  readonly explanation: string;
  readonly result: string | null;
  readonly state: AiExperienceState;
};

export type AiExperienceListener = (snapshot: AiExperienceSnapshot) => void;

export interface AiExperienceAdapter {
  getSnapshot(): AiExperienceSnapshot;
  reset(): void;
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

function createSnapshot(
  state: AiExperienceState,
  result: string | null = null,
): AiExperienceSnapshot {
  return { explanation: STATE_EXPLANATIONS[state], result, state };
}

export class MockAiExperienceAdapter implements AiExperienceAdapter {
  private readonly listeners = new Set<AiExperienceListener>();
  private readonly result: string;
  private isOffline: boolean;
  private snapshot = createSnapshot('idle');

  constructor({
    isOffline = false,
    result = '已整理今日教学信息。',
  }: MockAiExperienceAdapterOptions = {}) {
    this.isOffline = isOffline;
    this.result = result;
    if (isOffline) {
      this.snapshot = createSnapshot('offline');
    }
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.setSnapshot(createSnapshot(this.isOffline ? 'offline' : 'idle'));
  }

  setOffline(isOffline: boolean): void {
    this.isOffline = isOffline;
    this.setSnapshot(createSnapshot(isOffline ? 'offline' : 'idle'));
  }

  startListening(): void {
    if (!this.isOffline) {
      this.setSnapshot(createSnapshot('listening'));
    }
  }

  async submit(prompt: string): Promise<void> {
    if (this.isOffline) {
      this.setSnapshot(createSnapshot('offline'));
      return;
    }

    if (prompt.trim().length === 0) {
      this.setSnapshot(createSnapshot('error'));
      return;
    }

    this.setSnapshot(createSnapshot('thinking'));
    await Promise.resolve();
    this.setSnapshot(createSnapshot('preview', this.result));
  }

  succeed(): void {
    this.setSnapshot(createSnapshot('success', this.snapshot.result));
  }

  fail(): void {
    this.setSnapshot(createSnapshot('error'));
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
