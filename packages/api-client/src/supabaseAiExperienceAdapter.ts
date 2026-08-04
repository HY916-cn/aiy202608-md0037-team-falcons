import {
  createAiExperienceSnapshot,
  type AiExperienceActionPreview,
  type AiExperienceAdapter,
  type AiExperienceListener,
  type AiExperienceSnapshot,
} from '@dolphincloud/experience';
import type { RoleCode } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

type GatewayEnvelope = {
  readonly data?: unknown;
  readonly error?: { readonly code?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resultText(value: unknown): {
  readonly action: AiExperienceActionPreview | null;
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
    const preview = value.preview as Record<string, unknown>;
    if (
      typeof preview.actionType !== 'string' ||
      typeof preview.expiresAt !== 'string' ||
      !Array.isArray(preview.impact) ||
      typeof preview.isDangerous !== 'boolean' ||
      !isRecord(preview.parameters) ||
      typeof preview.permissionScope !== 'string' ||
      typeof preview.role !== 'string' ||
      !Array.isArray(preview.targets)
    ) {
      throw new Error('AI_GATEWAY_INVALID_RESPONSE');
    }
    const action: AiExperienceActionPreview = {
      draftId: value.draftId,
      id: value.draftId,
      impact: preview.impact as readonly string[],
      isDangerous: preview.isDangerous,
      operationType: preview.actionType,
      parameterSummary: Object.entries(preview.parameters).map(
        ([key, parameter]) => `${key}：${String(parameter)}`,
      ),
      permissionScope: preview.permissionScope,
      role: preview.role as RoleCode,
      targets: preview.targets as readonly string[],
    };
    return {
      action,
      sessionId: value.sessionId,
      text: `已生成写操作预览：${preview.actionType}`,
    };
  }
  throw new Error('AI_GATEWAY_INVALID_RESPONSE');
}

export class SupabaseAiExperienceAdapter implements AiExperienceAdapter {
  private action: AiExperienceActionPreview | null = null;
  private contextId: string | undefined;
  private confirming = false;
  private readonly listeners = new Set<AiExperienceListener>();
  private sessionId: string | undefined;
  private snapshot = createAiExperienceSnapshot('idle');

  constructor(
    private readonly client: SupabaseClient,
    private readonly functionName = 'ai-gateway',
  ) {}

  getPendingAction(): AiExperienceActionPreview | null {
    return this.action;
  }

  getSnapshot(): AiExperienceSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.action = null;
    this.setSnapshot(createAiExperienceSnapshot('idle'));
  }

  async selectActiveRole(role: RoleCode): Promise<void> {
    const { data, error } = await this.client
      .from('role_assignments')
      .select('id')
      .eq('role', role)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error !== null || typeof data?.id !== 'string') {
      this.contextId = undefined;
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }
    this.contextId = data.id;
  }

  startListening(): void {
    this.setSnapshot(createAiExperienceSnapshot('listening'));
  }

  async submit(prompt: string): Promise<void> {
    if (prompt.trim().length === 0) {
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }
    if (this.contextId === undefined) {
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
      const body: { contextId: string; message: string; sessionId?: string } = {
        contextId: this.contextId,
        message: prompt,
      };
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
      this.setSnapshot(
        createAiExperienceSnapshot('preview', result.text, result.action),
      );
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

  async returnToModify(): Promise<void> {
    await this.cancelAction();
    this.setSnapshot(createAiExperienceSnapshot('listening'));
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
