import {
  createAiExperienceSnapshot,
  type AiExperienceAdapter,
  type AiExperienceListener,
  type AiExperienceSnapshot,
} from '@dolphincloud/experience';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AiActionPreview = {
  readonly draftId: string;
  readonly preview: {
    readonly actionType: string;
    readonly expiresAt: string;
    readonly impact: readonly string[];
    readonly isDangerous: boolean;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly permissionScope: string;
    readonly targets: readonly string[];
  };
};

type GatewayEnvelope = {
  readonly data?: unknown;
  readonly error?: { readonly code?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resultText(value: unknown): {
  readonly action: AiActionPreview | null;
  readonly sessionId: string;
  readonly text: string;
} {
  if (!isRecord(value) || typeof value.sessionId !== 'string') {
    throw new Error('AI_GATEWAY_INVALID_RESPONSE');
  }
  if (value.type === 'text' && typeof value.text === 'string') {
    return { action: null, sessionId: value.sessionId, text: value.text };
  }
  if (value.type === 'data_card' && isRecord(value.card)) {
    return {
      action: null,
      sessionId: value.sessionId,
      text: JSON.stringify(value.card.payload, null, 2),
    };
  }
  if (
    value.type === 'action_draft' &&
    typeof value.draftId === 'string' &&
    isRecord(value.preview)
  ) {
    const preview = value.preview as AiActionPreview['preview'];
    return {
      action: { draftId: value.draftId, preview },
      sessionId: value.sessionId,
      text: `已生成写操作预览：${String(preview.actionType)}`,
    };
  }
  throw new Error('AI_GATEWAY_INVALID_RESPONSE');
}

export class SupabaseAiExperienceAdapter implements AiExperienceAdapter {
  private action: AiActionPreview | null = null;
  private confirming = false;
  private readonly listeners = new Set<AiExperienceListener>();
  private sessionId: string | undefined;
  private snapshot = createAiExperienceSnapshot('idle');

  constructor(
    private readonly client: SupabaseClient,
    private readonly functionName = 'ai-gateway',
  ) {}

  getPendingAction(): AiActionPreview | null {
    return this.action;
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.action = null;
    this.setSnapshot(createAiExperienceSnapshot('idle'));
  }

  startListening(): void {
    this.setSnapshot(createAiExperienceSnapshot('listening'));
  }

  async submit(prompt: string): Promise<void> {
    if (prompt.trim().length === 0) {
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }
    const { data: sessionData } = await this.client.auth.getSession();
    if (sessionData.session === null) {
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }
    this.setSnapshot(createAiExperienceSnapshot('thinking'));
    try {
      const body: { message: string; sessionId?: string } = { message: prompt };
      if (this.sessionId !== undefined) body.sessionId = this.sessionId;
      const { data, error } = await this.client.functions.invoke(this.functionName, {
        body,
        headers: { 'x-ai-route': '/chat' },
      });
      if (error !== null) throw error;
      const envelope = data as GatewayEnvelope;
      if (envelope.error !== undefined) throw new Error('AI_GATEWAY_ERROR');
      const result = resultText(envelope.data);
      this.action = result.action;
      this.sessionId = result.sessionId;
      this.setSnapshot(createAiExperienceSnapshot('preview', result.text));
    } catch {
      this.setSnapshot(createAiExperienceSnapshot('offline'));
    }
  }

  async confirmAction(dangerousConfirmed: boolean): Promise<void> {
    if (this.action === null || this.confirming) return;
    this.confirming = true;
    try {
      const { error } = await this.client.functions.invoke(this.functionName, {
        body: { dangerousConfirmed },
        headers: {
          'x-ai-route': `/action-drafts/${this.action.draftId}/confirm`,
        },
      });
      if (error !== null) throw error;
      this.action = null;
      this.setSnapshot(
        createAiExperienceSnapshot('success', this.snapshot.result),
      );
    } catch {
      this.setSnapshot(createAiExperienceSnapshot('error'));
    } finally {
      this.confirming = false;
    }
  }

  async cancelAction(): Promise<void> {
    if (this.action === null) return;
    const draftId = this.action.draftId;
    try {
      const { error } = await this.client.functions.invoke(this.functionName, {
        body: {},
        headers: { 'x-ai-route': `/action-drafts/${draftId}/cancel` },
      });
      if (error !== null) throw error;
      this.action = null;
      this.setSnapshot(createAiExperienceSnapshot('idle'));
    } catch {
      this.setSnapshot(createAiExperienceSnapshot('error'));
    }
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
