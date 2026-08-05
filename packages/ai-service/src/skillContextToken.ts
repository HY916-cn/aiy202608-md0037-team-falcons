import type { SupabaseClient } from '@supabase/supabase-js';

import type { AiReadSkill } from './contracts';
import { AiServiceError } from './errors';
import type { AiSession } from './sessionService';

export interface AiSkillTokenRegistry {
  register(input: {
    readonly allowedSkills: readonly AiReadSkill[];
    readonly sessionId: string;
    readonly tokenId: string;
  }): Promise<void>;
}

function base64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export class AiSkillContextTokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly registry: AiSkillTokenRegistry,
    private readonly now: () => number = () => Math.floor(Date.now() / 1_000),
  ) {}

  async issue(
    session: AiSession,
    allowedSkills: readonly AiReadSkill[],
  ): Promise<string> {
    const tokenId = crypto.randomUUID();
    await this.registry.register({ allowedSkills, sessionId: session.id, tokenId });
    const encodedHeader = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = base64Url(
      JSON.stringify({
        ai_context_id: session.roleAssignmentId,
        ai_session_id: session.id,
        aud: 'authenticated',
        exp: this.now() + 60,
        iat: this.now(),
        iss: 'supabase',
        jti: tokenId,
        role: 'authenticated',
        skills: allowedSkills,
        sub: session.userId,
      }),
    );
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.secret),
      { hash: 'SHA-256', name: 'HMAC' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    return `${encodedHeader}.${encodedPayload}.${base64Url(new Uint8Array(signature))}`;
  }
}

export class SupabaseAiSkillTokenRegistry implements AiSkillTokenRegistry {
  constructor(private readonly client: SupabaseClient) {}

  async register(input: {
    readonly allowedSkills: readonly AiReadSkill[];
    readonly sessionId: string;
    readonly tokenId: string;
  }): Promise<void> {
    const { error } = await this.client.rpc('register_ai_skill_context_token', {
      allowed_skill_names: input.allowedSkills,
      target_session_id: input.sessionId,
      token_id: input.tokenId,
    });
    if (error !== null) {
      throw new AiServiceError('FORBIDDEN', 403, { cause: error });
    }
  }
}

export function readVerifiedSkillTokenId(token: string): string {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new AiServiceError('FORBIDDEN', 403);
  try {
    const unpadded = payload.replaceAll('-', '+').replaceAll('_', '/');
    const normalized = unpadded.padEnd(
      unpadded.length + ((4 - (unpadded.length % 4)) % 4),
      '=',
    );
    const parsed = JSON.parse(atob(normalized)) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('jti' in parsed) ||
      typeof parsed.jti !== 'string'
    ) {
      throw new Error('INVALID_JTI');
    }
    return parsed.jti;
  } catch (cause) {
    throw new AiServiceError('FORBIDDEN', 403, { cause });
  }
}
