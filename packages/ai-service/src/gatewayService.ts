import { AI_READ_SKILLS, type AiGatewayResponse } from './contracts';
import type { AiActionDraftService } from './actionDraftService';
import type { CozeGatewayClient } from './cozeGatewayClient';
import { AiServiceError } from './errors';
import { parseGatewayRequest } from './inputSecurity';
import type { AiRequestGuard } from './requestGuard';
import type { AiPrincipal, AiSessionService } from './sessionService';
import type { AiSkillContext, SkillQueryService } from './skillQueryService';
import type { AiSkillContextTokenIssuer } from './skillContextToken';

export class AiGatewayService {
  constructor(
    private readonly sessions: AiSessionService,
    private readonly provider: CozeGatewayClient,
    private readonly skills: SkillQueryService,
    private readonly drafts: AiActionDraftService,
    private readonly requestGuard: AiRequestGuard,
    private readonly skillTokenIssuer: AiSkillContextTokenIssuer,
  ) {}

  async chat(
    body: unknown,
    principal: AiPrincipal | null,
    skillContext: AiSkillContext,
    signal?: AbortSignal,
  ): Promise<AiGatewayResponse> {
    const request = parseGatewayRequest(body);
    const session = await this.sessions.resolve(
      principal,
      request.contextId,
      request.sessionId,
    );
    const requestId = await this.requestGuard.begin({
      messageLength: request.message.length,
      session,
    });
    let conversationReference: string | null = null;
    const skillContextToken = await this.skillTokenIssuer.issue(
      session,
      AI_READ_SKILLS,
    );
    const providerInput = {
      conversationReference: session.conversationReference,
      message: request.message,
      sessionReference: session.id,
      skillContextToken,
      ...(signal === undefined ? {} : { signal }),
    };
    try {
      const response = await this.provider.send(providerInput);
      conversationReference = response.conversationReference;
      await this.sessions.updateConversationReference(
        session.id,
        response.conversationReference,
      );
      const result = response.result;
      if (result.type === 'text') {
        return { ...result, sessionId: session.id };
      }
      if (result.type === 'skill_query') {
        return {
          card: {
            kind: result.skill,
            payload: await this.skills.query(
              result.skill,
              result.arguments,
              skillContext,
            ),
          },
          sessionId: session.id,
          type: 'data_card',
        };
      }
      if (principal === null) {
        throw new AiServiceError('UNAUTHENTICATED', 401);
      }
      const draft = await this.drafts.propose({
        actionType: result.actionType,
        context: skillContext,
        parameters: result.parameters,
        principal,
      });
      return {
        draftId: draft.id,
        preview: {
          actionType: draft.actionType,
          expiresAt: draft.expiresAt,
          impact: draft.impact,
          isDangerous: draft.isDangerous,
          parameters: draft.parameters,
          permissionScope: draft.permissionScope,
          role: draft.role,
          targets: draft.targets,
        },
        sessionId: session.id,
        type: 'action_draft',
      };
    } finally {
      await this.requestGuard.finish({
        conversationReference,
        requestId,
        sessionId: session.id,
      });
    }
  }
}
