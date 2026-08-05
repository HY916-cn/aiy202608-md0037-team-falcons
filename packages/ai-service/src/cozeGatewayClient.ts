import {
  AI_READ_SKILLS,
  AI_WRITE_ACTION_TYPES,
  type AiProviderResponse,
  type AiProviderResult,
  type AiReadSkill,
  type AiWriteActionType,
} from './contracts';
import { AiServiceError } from './errors';

export type CozeGatewayClientOptions = {
  readonly apiBaseUrl: string;
  readonly botId: string;
  readonly fetchImplementation?: typeof fetch;
  readonly pollIntervalMs?: number;
  readonly skillEndpoint?: string;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly timeoutMs?: number;
  readonly token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReadSkill(value: unknown): value is AiReadSkill {
  return typeof value === 'string' && AI_READ_SKILLS.some((item) => item === value);
}

function isWriteActionType(value: unknown): value is AiWriteActionType {
  return (
    typeof value === 'string' &&
    AI_WRITE_ACTION_TYPES.some((item) => item === value)
  );
}

function parseBotContent(content: string): AiProviderResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { text: content, type: 'text' };
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
  }
  if (value.type === 'text' && typeof value.text === 'string') {
    return { text: value.text, type: 'text' };
  }
  if (
    value.type === 'skill_query' &&
    isReadSkill(value.skill) &&
    isRecord(value.arguments)
  ) {
    return { arguments: value.arguments, skill: value.skill, type: 'skill_query' };
  }
  if (
    value.type === 'action_proposal' &&
    isWriteActionType(value.action_type) &&
    isRecord(value.parameters)
  ) {
    return {
      actionType: value.action_type,
      parameters: value.parameters,
      type: 'action_proposal',
    };
  }
  throw new AiServiceError('AI_INVALID_RESPONSE', 502);
}

function readData(value: unknown): Record<string, unknown> {
  if (
    !isRecord(value) ||
    (value.code !== undefined && value.code !== 0) ||
    !isRecord(value.data)
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
  }
  return value.data;
}

export class CozeGatewayClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(private readonly options: CozeGatewayClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async send(input: {
    readonly conversationReference: string | null;
    readonly message: string;
    readonly signal?: AbortSignal;
    readonly skillContextToken?: string;
    readonly sessionReference: string;
  }): Promise<AiProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const cancel = () => controller.abort();
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const query =
        input.conversationReference === null
          ? ''
          : `?conversation_id=${encodeURIComponent(input.conversationReference)}`;
      const created = readData(
        await this.requestJson(
          `${this.baseUrl()}/v3/chat${query}`,
          {
            body: JSON.stringify({
              additional_messages: [
                {
                  content: input.message,
                  content_type: 'text',
                  role: 'user',
                  type: 'question',
                },
              ],
              auto_save_history: true,
              bot_id: this.options.botId,
              parameters:
                input.skillContextToken === undefined
                  ? {}
                  : {
                      skill_context_token: input.skillContextToken,
                      skill_endpoint: this.options.skillEndpoint,
                    },
              stream: false,
              user_id: input.sessionReference,
            }),
            method: 'POST',
            signal: controller.signal,
          },
        ),
      );
      const chatId = created.id;
      const conversationId = created.conversation_id;
      if (typeof chatId !== 'string' || typeof conversationId !== 'string') {
        throw new AiServiceError('AI_INVALID_RESPONSE', 502);
      }

      let status = created.status;
      while (status === 'created' || status === 'in_progress') {
        await this.sleep(this.pollIntervalMs);
        const retrieved = readData(
          await this.requestJson(
            `${this.baseUrl()}/v3/chat/retrieve?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
            { method: 'GET', signal: controller.signal },
          ),
        );
        status = retrieved.status;
      }
      if (status !== 'completed') {
        throw new AiServiceError('AI_UNAVAILABLE', 503);
      }

      const messagesEnvelope = await this.requestJson(
        `${this.baseUrl()}/v3/chat/message/list?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
        { method: 'GET', signal: controller.signal },
      );
      if (!isRecord(messagesEnvelope) || messagesEnvelope.code !== 0) {
        throw new AiServiceError('AI_INVALID_RESPONSE', 502);
      }
      const messages = messagesEnvelope.data;
      if (!Array.isArray(messages)) {
        throw new AiServiceError('AI_INVALID_RESPONSE', 502);
      }
      let answer: unknown;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (
          isRecord(message) &&
          message.role === 'assistant' &&
          message.type === 'answer' &&
          typeof message.content === 'string'
        ) {
          answer = message;
          break;
        }
      }
      if (!isRecord(answer) || typeof answer.content !== 'string') {
        throw new AiServiceError('AI_INVALID_RESPONSE', 502);
      }
      return {
        conversationReference: conversationId,
        result: parseBotContent(answer.content),
      };
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      if (controller.signal.aborted) {
        throw new AiServiceError(
          input.signal?.aborted === true ? 'AI_CANCELLED' : 'AI_TIMEOUT',
          input.signal?.aborted === true ? 499 : 503,
          { cause: error },
        );
      }
      throw new AiServiceError('AI_UNAVAILABLE', 503, { cause: error });
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', cancel);
    }
  }

  private baseUrl(): string {
    return this.options.apiBaseUrl.replace(/\/$/, '');
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImplementation(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Content-Type': 'application/json',
        },
      });
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        continue;
      }
      if (response.status === 429) {
        throw new AiServiceError('AI_RATE_LIMITED', 503);
      }
      if (response.status >= 500 || !response.ok) {
        throw new AiServiceError('AI_UNAVAILABLE', 503);
      }
      return response.json();
    }
    throw new AiServiceError('AI_UNAVAILABLE', 503);
  }
}
