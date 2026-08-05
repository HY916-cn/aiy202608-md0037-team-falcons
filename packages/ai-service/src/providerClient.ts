import type { AiProviderResponse } from './contracts';

export type AiProviderInput = {
  readonly conversationReference: string | null;
  readonly message: string;
  readonly sessionReference: string;
  readonly signal?: AbortSignal;
};

export interface AiProviderClient {
  send(input: AiProviderInput): Promise<AiProviderResponse>;
}
