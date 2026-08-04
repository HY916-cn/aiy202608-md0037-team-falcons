import {
  AI_READ_SKILLS,
  AI_WRITE_ACTION_TYPES,
  type AiProviderResult,
  type AiReadSkill,
  type AiWriteActionType,
} from './contracts';
import { AiServiceError } from './errors';

export type CozeGatewayClientOptions = {
  readonly apiBaseUrl: string;
  readonly botId: string;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
  readonly token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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

function parseProviderResult(value: unknown): AiProviderResult {
  const envelope = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(envelope) || typeof envelope.type !== 'string') {
    throw new AiServiceError('AI_INVALID_RESPONSE', 502);
  }
  if (envelope.type === 'text' && typeof envelope.text === 'string') {
    return { text: envelope.text, type: 'text' };
  }
  if (
    envelope.type === 'skill_query' &&
    isReadSkill(envelope.skill) &&
    isRecord(envelope.arguments)
  ) {
    return {
      arguments: envelope.arguments,
      skill: envelope.skill,
      type: 'skill_query',
    };
  }
  if (
    envelope.type === 'action_proposal' &&
    isWriteActionType(envelope.action_type) &&
    isRecord(envelope.parameters) &&
    isStringArray(envelope.targets) &&
    isStringArray(envelope.impact) &&
    typeof envelope.is_dangerous === 'boolean'
  ) {
    return {
      actionType: envelope.action_type,
      impact: envelope.impact,
      isDangerous: envelope.is_dangerous,
      parameters: envelope.parameters,
      targets: envelope.targets,
      type: 'action_proposal',
    };
  }
  throw new AiServiceError('AI_INVALID_RESPONSE', 502);
}

export class CozeGatewayClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: CozeGatewayClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async send(input: {
    readonly conversationReference: string | null;
    readonly message: string;
    readonly sessionReference: string;
  }): Promise<AiProviderResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImplementation(
          `${this.options.apiBaseUrl.replace(/\/$/, '')}/v1/chat`,
          {
            body: JSON.stringify({
              bot_id: this.options.botId,
              conversation_id: input.conversationReference,
              message: input.message,
              session_reference: input.sessionReference,
            }),
            headers: {
              Authorization: `Bearer ${this.options.token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal: controller.signal,
          },
        );
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          continue;
        }
        if (response.status === 429) {
          throw new AiServiceError('AI_RATE_LIMITED', 503);
        }
        if (response.status >= 500) {
          throw new AiServiceError('AI_UNAVAILABLE', 503);
        }
        if (!response.ok) {
          throw new AiServiceError('AI_UNAVAILABLE', 503);
        }
        return parseProviderResult(await response.json());
      } catch (error) {
        if (error instanceof AiServiceError) {
          throw error;
        }
        if (controller.signal.aborted) {
          throw new AiServiceError('AI_TIMEOUT', 503, { cause: error });
        }
        throw new AiServiceError('AI_UNAVAILABLE', 503, { cause: error });
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new AiServiceError('AI_UNAVAILABLE', 503);
  }
}
