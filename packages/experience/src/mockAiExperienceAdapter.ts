import type { AuthRoleScope } from '@dolphincloud/auth';

import {
  createAiExperienceSnapshot,
  type AiExperienceAdapter,
  type AiExperienceListener,
  type AiExperienceSnapshot,
} from './aiExperience';

type MockAiExperienceAdapterOptions = {
  readonly isOffline?: boolean;
  readonly result?: string;
};

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
    if (isOffline) this.snapshot = createAiExperienceSnapshot('offline');
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  newConversation(): void {
    this.reset();
  }

  async cancelAction(): Promise<void> {
    this.reset();
  }

  cancelRequest(): void {
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

  async retry(): Promise<void> {
    this.reset();
  }

  setOffline(isOffline: boolean): void {
    this.isOffline = isOffline;
    this.setSnapshot(createAiExperienceSnapshot(isOffline ? 'offline' : 'idle'));
  }

  startListening(): void {
    if (!this.isOffline) this.setSnapshot(createAiExperienceSnapshot('listening'));
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
    this.setSnapshot(createAiExperienceSnapshot('success', this.snapshot.result));
  }

  fail(): void {
    this.setSnapshot(createAiExperienceSnapshot('error'));
  }

  subscribe(listener: AiExperienceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setSnapshot(snapshot: AiExperienceSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
