import { describe, expect, it, vi } from 'vitest';

import {
  AiSkillContextTokenIssuer,
  readVerifiedSkillTokenId,
} from '../skillContextToken';

describe('AiSkillContextTokenIssuer', () => {
  it('签发 60 秒 JWT 并先登记单用途 jti 与允许 Skill', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const issuer = new AiSkillContextTokenIssuer(
      'local-test-secret-at-least-32-characters',
      { register },
      () => 1_000,
    );

    const token = await issuer.issue(
      {
        conversationReference: null,
        id: 'session-1',
        roleAssignmentId: 'context-1',
        status: 'active',
        userId: 'user-1',
      },
      ['get_today_summary', 'get_grades'],
    );

    const tokenId = readVerifiedSkillTokenId(token);
    expect(register).toHaveBeenCalledWith({
      allowedSkills: ['get_today_summary', 'get_grades'],
      sessionId: 'session-1',
      tokenId,
    });
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ai_context_id: 'context-1',
      exp: 1_060,
      iat: 1_000,
      role: 'authenticated',
      sub: 'user-1',
    });
  });
});
