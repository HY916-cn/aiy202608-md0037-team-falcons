import {
  createAiExperienceSnapshot,
  type AiExperienceActionPreview,
  type AiExperienceAdapter,
  type AiExperienceListener,
  type AiExperienceSnapshot,
} from '@dolphincloud/experience';
import { isRoleCode, type AuthRoleScope } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

type GatewayEnvelope = {
  readonly data?: unknown;
  readonly error?: { readonly code?: unknown };
  readonly request_id?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isNonEmptyString(item))
  );
}

const DATA_CARD_TITLES: Readonly<Record<string, string>> = {
  get_grades: '成绩单',
  get_today_summary: '今日摘要',
  list_assignments: '作业',
  list_courseware: '课件',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  assessmentTitle: '测评',
  comment: '评语',
  content: '内容',
  dueAt: '截止时间',
  fileName: '文件',
  generatedAt: '更新时间',
  label: '项目',
  score: '成绩',
  status: '状态',
  studentName: '学生',
  subject: '科目',
  title: '名称',
  value: '结果',
};

function readableValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '暂无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (Array.isArray(value)) return value.map(readableValue).join('、');
  return '已读取';
}

function summarizeRecord(value: Readonly<Record<string, unknown>>): string {
  const preferredKeys = [
    'title', 'assessmentTitle', 'studentName', 'subject', 'label', 'value',
    'score', 'status', 'dueAt', 'fileName', 'comment', 'content',
  ];
  const entries = preferredKeys
    .filter((key) => value[key] !== undefined)
    .slice(0, 4)
    .map((key) => `${FIELD_LABELS[key] ?? key}：${readableValue(value[key])}`);
  return entries.length > 0 ? entries.join(' · ') : '已读取一条记录';
}

function formatDataCard(kind: string, payload: unknown): string {
  const title = DATA_CARD_TITLES[kind] ?? '查询结果';
  if (isRecord(payload) && Array.isArray(payload.items)) {
    const items = payload.items.filter(isRecord);
    if (items.length === 0) return `${title}：当前没有需要关注的内容。`;
    return `${title}\n${items.map((item) => `• ${readableValue(item.label)}：${readableValue(item.value)}`).join('\n')}`;
  }
  if (Array.isArray(payload)) {
    const items = payload.filter(isRecord);
    if (items.length === 0) return `${title}：当前暂无数据。`;
    const visible = items.slice(0, 8).map((item) => `• ${summarizeRecord(item)}`);
    const remainder = items.length - visible.length;
    return `${title}（${items.length} 条）\n${visible.join('\n')}${remainder > 0 ? `\n• 另有 ${remainder} 条，请前往对应页面查看。` : ''}`;
  }
  if (isRecord(payload)) return `${title}\n• ${summarizeRecord(payload)}`;
  return `${title}：${readableValue(payload)}`;
}

function formatAssistantText(text: string): string {
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return text;
  try {
    return formatDataCard('query', JSON.parse(trimmed) as unknown);
  } catch {
    return text;
  }
}

function parseEnvelope(value: unknown): GatewayEnvelope {
  if (!isRecord(value) || (value.error !== undefined && value.error !== null)) {
    throw new Error('AI_GATEWAY_ERROR');
  }
  return value;
}

function parseActionMutation(
  value: unknown,
  expectedStatus: 'cancelled' | 'completed',
): {
  readonly receipt: Readonly<Record<string, unknown>> | null;
  readonly requestId: string;
} {
  const envelope = parseEnvelope(value);
  if (!isNonEmptyString(envelope.request_id) || !isRecord(envelope.data)) {
    throw new Error('AI_GATEWAY_INVALID_RESPONSE');
  }
  if (envelope.data.status !== expectedStatus) {
    throw new Error('AI_GATEWAY_INVALID_RESPONSE');
  }
  if (expectedStatus === 'completed' && !isRecord(envelope.data.receipt)) {
    throw new Error('AI_GATEWAY_INVALID_RESPONSE');
  }
  return {
    receipt:
      expectedStatus === 'completed'
        ? (envelope.data.receipt as Readonly<Record<string, unknown>>)
        : null,
    requestId: envelope.request_id,
  };
}

function resultText(value: unknown): {
  readonly action: AiExperienceActionPreview | null;
  readonly sessionId: string;
  readonly structuredResult: { readonly kind: string; readonly payload: unknown } | null;
  readonly text: string;
} {
  if (!isRecord(value) || !isNonEmptyString(value.sessionId)) {
    throw new Error('AI_GATEWAY_INVALID_RESPONSE');
  }
  if (value.type === 'text' && typeof value.text === 'string') {
    return {
      action: null,
      sessionId: value.sessionId,
      structuredResult: null,
      text: formatAssistantText(value.text),
    };
  }
  if (value.type === 'data_card' && isRecord(value.card)) {
    const kind = typeof value.card.kind === 'string' ? value.card.kind : 'query';
    return {
      action: null,
      sessionId: value.sessionId,
      structuredResult: {
        kind,
        payload: value.card.payload,
      },
      text: formatDataCard(kind, value.card.payload),
    };
  }
  if (
    value.type === 'action_draft' &&
    isNonEmptyString(value.draftId) &&
    isRecord(value.preview)
  ) {
    const preview = value.preview as Record<string, unknown>;
    if (
      !isNonEmptyString(preview.actionType) ||
      !isNonEmptyString(preview.expiresAt) ||
      !isNonEmptyStringArray(preview.impact) ||
      typeof preview.isDangerous !== 'boolean' ||
      !isRecord(preview.parameters) ||
      !isNonEmptyString(preview.permissionScope) ||
      !isNonEmptyString(preview.role) ||
      !isRoleCode(preview.role) ||
      !isNonEmptyStringArray(preview.targets)
    ) {
      throw new Error('AI_GATEWAY_INVALID_RESPONSE');
    }
    const action: AiExperienceActionPreview = {
      draftId: value.draftId,
      id: value.draftId,
      impact: preview.impact,
      isDangerous: preview.isDangerous,
      operationType: preview.actionType,
      parameterSummary: Object.entries(preview.parameters).map(
        ([key, parameter]) => `${key}：${String(parameter)}`,
      ),
      permissionScope: preview.permissionScope,
      role: preview.role,
      targets: preview.targets,
    };
    return {
      action,
      sessionId: value.sessionId,
      structuredResult: null,
      text: `已生成写操作预览：${preview.actionType}`,
    };
  }
  throw new Error('AI_GATEWAY_INVALID_RESPONSE');
}

export class SupabaseAiExperienceAdapter implements AiExperienceAdapter {
  private action: AiExperienceActionPreview | null = null;
  private contextId: string | undefined;
  private confirmingDraftId: string | null = null;
  private lastPrompt: string | null = null;
  private readonly listeners = new Set<AiExperienceListener>();
  private requestGeneration = 0;
  private scopeGeneration = 0;
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
    this.requestGeneration += 1;
    this.action = null;
    this.setSnapshot(createAiExperienceSnapshot('idle'));
  }

  newConversation(): void {
    this.sessionId = undefined;
    this.lastPrompt = null;
    this.reset();
  }

  cancelRequest(): void {
    if (this.snapshot.state !== 'thinking') return;
    this.requestGeneration += 1;
    this.setSnapshot(createAiExperienceSnapshot('idle'));
  }

  async retry(): Promise<void> {
    if (this.lastPrompt !== null) await this.submit(this.lastPrompt);
  }

  async selectActiveRole(roleScope: AuthRoleScope): Promise<boolean> {
    const generation = ++this.scopeGeneration;
    this.contextId = undefined;
    this.requestGeneration += 1;
    this.action = null;
    this.confirmingDraftId = null;
    this.lastPrompt = null;
    this.sessionId = undefined;
    this.setSnapshot(createAiExperienceSnapshot('idle'));
    try {
      const { data, error } = await this.client
        .from('role_assignments')
        .select('id')
        .eq('id', roleScope.assignmentId)
        .eq('role', roleScope.role)
        .eq('scope_type', roleScope.type)
        .eq('scope_id', roleScope.id)
        .single();
      if (generation !== this.scopeGeneration) return false;
      if (error !== null || data?.id !== roleScope.assignmentId) {
        this.setSnapshot(createAiExperienceSnapshot('error'));
        return false;
      }
      this.contextId = data.id;
      this.setSnapshot(createAiExperienceSnapshot('idle'));
      return true;
    } catch {
      if (generation !== this.scopeGeneration) return false;
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return false;
    }
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
    this.lastPrompt = prompt.trim();
    const generation = ++this.requestGeneration;
    const scopeGeneration = this.scopeGeneration;
    const contextId = this.contextId;
    const { data: sessionData } = await this.client.auth.getSession();
    if (
      generation !== this.requestGeneration ||
      scopeGeneration !== this.scopeGeneration
    ) {
      return;
    }
    if (sessionData.session === null) {
      this.setSnapshot(createAiExperienceSnapshot('error'));
      return;
    }
    this.setSnapshot(createAiExperienceSnapshot('thinking'));
    try {
      const body: { contextId: string; message: string; sessionId?: string } = {
        contextId,
        message: prompt,
      };
      if (this.sessionId !== undefined) body.sessionId = this.sessionId;
      const { data, error } = await this.client.functions.invoke(this.functionName, {
        body,
        headers: { 'x-ai-route': '/chat' },
      });
      if (error !== null) throw error;
      const envelope = parseEnvelope(data);
      const result = resultText(envelope.data);
      if (
        generation !== this.requestGeneration ||
        scopeGeneration !== this.scopeGeneration
      ) {
        return;
      }
      this.action = result.action;
      this.sessionId = result.sessionId;
      this.setSnapshot(
        createAiExperienceSnapshot(
          'preview',
          result.text,
          result.action,
          result.structuredResult,
        ),
      );
    } catch {
      if (
        generation !== this.requestGeneration ||
        scopeGeneration !== this.scopeGeneration
      ) {
        return;
      }
      this.setSnapshot(createAiExperienceSnapshot('offline'));
    }
  }

  async confirmAction(previewId: string, dangerousConfirmed: boolean): Promise<void> {
    const action = this.action;
    if (action === null || action.draftId !== previewId) {
      if (action !== null) {
        this.setSnapshot(
          createAiExperienceSnapshot(
            'error',
            this.snapshot.result,
            action,
            this.snapshot.structuredResult,
          ),
        );
      }
      throw new Error('AI_ACTION_PREVIEW_STALE');
    }
    if (this.confirmingDraftId !== null) return;
    const draftId = action.draftId;
    const scopeGeneration = this.scopeGeneration;
    this.confirmingDraftId = draftId;
    try {
      const { data, error } = await this.client.functions.invoke(this.functionName, {
        body: { dangerousConfirmed },
        headers: {
          'x-ai-route': `/action-drafts/${draftId}/confirm`,
        },
      });
      if (error !== null) throw error;
      const completed = parseActionMutation(data, 'completed');
      if (
        scopeGeneration !== this.scopeGeneration ||
        this.action?.draftId !== draftId
      ) {
        throw new Error('AI_SCOPE_CHANGED');
      }
      this.action = null;
      this.setSnapshot(
        createAiExperienceSnapshot(
          'success',
          this.snapshot.result,
          null,
          this.snapshot.structuredResult,
          {
            receipt: completed.receipt ?? {},
            requestId: completed.requestId,
          },
        ),
      );
    } catch (error) {
      if (
        scopeGeneration === this.scopeGeneration &&
        this.action?.draftId === draftId
      ) {
        this.setSnapshot(
          createAiExperienceSnapshot(
            'error',
            this.snapshot.result,
            this.action,
            this.snapshot.structuredResult,
          ),
        );
      }
      throw error;
    } finally {
      if (
        scopeGeneration === this.scopeGeneration &&
        this.confirmingDraftId === draftId
      ) {
        this.confirmingDraftId = null;
      }
    }
  }

  async cancelAction(previewId: string): Promise<void> {
    if (this.action === null || this.action.draftId !== previewId) {
      throw new Error('AI_ACTION_PREVIEW_STALE');
    }
    const draftId = previewId;
    const scopeGeneration = this.scopeGeneration;
    try {
      const { data, error } = await this.client.functions.invoke(this.functionName, {
        body: {},
        headers: { 'x-ai-route': `/action-drafts/${draftId}/cancel` },
      });
      if (error !== null) throw error;
      parseActionMutation(data, 'cancelled');
      if (
        scopeGeneration !== this.scopeGeneration ||
        this.action?.draftId !== draftId
      ) {
        throw new Error('AI_SCOPE_CHANGED');
      }
      this.action = null;
      this.setSnapshot(createAiExperienceSnapshot('idle'));
    } catch (error) {
      if (
        scopeGeneration === this.scopeGeneration &&
        this.action?.draftId === draftId
      ) {
        this.setSnapshot(
          createAiExperienceSnapshot(
            'error',
            this.snapshot.result,
            this.action,
            this.snapshot.structuredResult,
          ),
        );
      }
      throw error;
    }
  }

  async returnToModify(previewId: string): Promise<void> {
    const scopeGeneration = this.scopeGeneration;
    await this.cancelAction(previewId);
    if (scopeGeneration === this.scopeGeneration) {
      this.setSnapshot(createAiExperienceSnapshot('listening'));
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
