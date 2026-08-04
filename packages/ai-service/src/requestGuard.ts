import type { SupabaseClient } from '@supabase/supabase-js';

import { AiServiceError } from './errors';
import type { AiSession } from './sessionService';

export interface AiRequestGuard {
  begin(input: {
    readonly messageLength: number;
    readonly session: AiSession;
  }): Promise<string>;
  finish(input: {
    readonly conversationReference: string | null;
    readonly requestId: string;
    readonly sessionId: string;
  }): Promise<void>;
}

export class SupabaseAiRequestGuard implements AiRequestGuard {
  constructor(private readonly client: SupabaseClient) {}

  async begin(input: {
    readonly messageLength: number;
    readonly session: AiSession;
  }): Promise<string> {
    const requestId = crypto.randomUUID();
    const { error } = await this.client.rpc('begin_ai_request', {
      message_length: input.messageLength,
      request_id: requestId,
      selected_role_assignment_id: input.session.roleAssignmentId,
      target_session_id: input.session.id,
    });
    if (error !== null) {
      const rateLimited = /RATE_LIMITED|CONCURRENCY_LIMIT/.test(error.message);
      throw new AiServiceError(rateLimited ? 'RATE_LIMITED' : 'FORBIDDEN', rateLimited ? 429 : 403, {
        cause: error,
      });
    }
    return requestId;
  }

  async finish(input: {
    readonly conversationReference: string | null;
    readonly requestId: string;
    readonly sessionId: string;
  }): Promise<void> {
    await this.client.rpc('finish_ai_request', {
      conversation_reference: input.conversationReference,
      request_id: input.requestId,
      target_session_id: input.sessionId,
    });
  }
}
