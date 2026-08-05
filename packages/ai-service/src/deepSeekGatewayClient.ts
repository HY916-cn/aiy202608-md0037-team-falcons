import {
  AI_READ_SKILLS,
  AI_WRITE_ACTION_TYPES,
  type AiProviderResponse,
  type AiProviderResult,
  type AiReadSkill,
  type AiWriteActionType,
} from './contracts';
import { AiServiceError } from './errors';
import type { AiProviderClient, AiProviderInput } from './providerClient';

export type DeepSeekGatewayClientOptions = {
  readonly apiBaseUrl?: string;
  readonly apiKey: string;
  readonly fetchImplementation?: typeof fetch;
  readonly model?: string;
  readonly timeoutMs?: number;
};

const SYSTEM_PROMPT = `你是海豚云 AI 中心的海豚助手。你只能输出一个 JSON 对象，不得输出 Markdown 或额外文字。

按用户意图选择以下一种结构：
1. 普通回答：{"type":"text","text":"简洁、友好的中文回答"}
2. 查询业务数据：{"type":"skill_query","skill":"白名单技能","arguments":{}}
3. 提议写操作：{"type":"action_proposal","action_type":"白名单操作","parameters":{}}

只读技能白名单：${AI_READ_SKILLS.join(', ')}。
写操作白名单：${AI_WRITE_ACTION_TYPES.join(', ')}。
不得伪造查询结果，不得声称尚未确认的操作已经执行。涉及数据查询时返回 skill_query；涉及写入时只返回 action_proposal，服务端会进行权限校验并要求用户确认。信息不足时返回 text 并询问必要信息。`;

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

function parseModelContent(content: string): AiProviderResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
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

function readAnswer(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
  }
  const first = value.choices[0];
  if (
    !isRecord(first) ||
    !isRecord(first.message) ||
    typeof first.message.content !== 'string'
  ) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
  }
  return first.message.content;
}

export class DeepSeekGatewayClient implements AiProviderClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: DeepSeekGatewayClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;
  }

  async send(input: AiProviderInput): Promise<AiProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const cancel = () => controller.abort();
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await this.requestJson(controller.signal, input.message);
      return {
        conversationReference:
          input.conversationReference ?? input.sessionReference,
        result: parseModelContent(readAnswer(response)),
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
    return (this.options.apiBaseUrl ?? 'https://api.deepseek.com').replace(
      /\/$/,
      '',
    );
  }

  private async requestJson(signal: AbortSignal, message: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImplementation(
        `${this.baseUrl()}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              { content: SYSTEM_PROMPT, role: 'system' },
              { content: message, role: 'user' },
            ],
            model: this.options.model ?? 'deepseek-chat',
            response_format: { type: 'json_object' },
            stream: false,
            temperature: 0.2,
          }),
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal,
        },
      );
      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        continue;
      }
      if (response.status === 429) {
        throw new AiServiceError('AI_RATE_LIMITED', 503);
      }
      if (!response.ok) {
        throw new AiServiceError('AI_UNAVAILABLE', 503);
      }
      return response.json();
    }
    throw new AiServiceError('AI_UNAVAILABLE', 503);
  }
}
