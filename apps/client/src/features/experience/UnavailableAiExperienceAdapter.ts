import type { AuthRoleScope } from '@dolphincloud/auth';
import {
  createAiExperienceSnapshot,
  type AiExperienceAdapter,
  type AiExperienceListener,
  type AiExperienceSnapshot,
} from '@dolphincloud/experience';

export class UnavailableAiExperienceAdapter implements AiExperienceAdapter {
  private readonly listeners = new Set<AiExperienceListener>();
  private snapshot = createAiExperienceSnapshot('offline');

  async cancelAction(_previewId: string): Promise<void> {
    this.publishOffline();
  }

  cancelRequest(): void {
    this.publishOffline();
  }

  async confirmAction(_previewId: string, _dangerousConfirmed: boolean): Promise<void> {
    this.publishOffline();
    throw new Error('AI_UNAVAILABLE');
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  newConversation(): void {
    this.publishOffline();
  }

  reset(): void {
    this.publishOffline();
  }

  async retry(): Promise<void> {
    this.publishOffline();
  }

  async returnToModify(_previewId: string): Promise<void> {
    this.publishOffline();
  }

  async selectActiveRole(_roleScope: AuthRoleScope): Promise<boolean> {
    this.publishOffline();
    return false;
  }

  startListening(): void {
    this.publishOffline();
  }

  async submit(_prompt: string): Promise<void> {
    this.publishOffline();
  }

  subscribe(listener: AiExperienceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publishOffline(): void {
    this.snapshot = createAiExperienceSnapshot('offline');
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
