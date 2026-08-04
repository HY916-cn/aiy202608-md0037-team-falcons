import type { AiGatewayResponse } from './contracts';
import type { AiActionDraftService } from './actionDraftService';
import type { CozeGatewayClient } from './cozeGatewayClient';
import { AiServiceError } from './errors';
import { parseGatewayRequest } from './inputSecurity';
import type { AiPrincipal, AiSessionService } from './sessionService';
import type { AiSkillContext, SkillQueryService } from './skillQueryService';

export class AiGatewayService {
  constructor(
    private readonly sessions: AiSessionService,
    private readonly provider: CozeGatewayClient,
    private readonly skills: SkillQueryService,
    private readonly drafts: AiActionDraftService,
  ) {}

  async chat(
    body: unknown,
    principal: AiPrincipal | null,
    skillContext: AiSkillContext,
    signal?: AbortSignal,
  ): Promise<AiGatewayResponse> {
    const request = parseGatewayRequest(body);
    const session = await this.sessions.resolve(principal, request.sessionId);
    const providerInput = {
      conversationReference: session.conversationReference,
      message: request.message,
      sessionReference: session.id,
      ...(signal === undefined ? {} : { signal }),
    };
    const result = await this.provider.send(providerInput);
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
      impact: result.impact,
      isDangerous: result.isDangerous,
      parameters: result.parameters,
      principal,
      targets: result.targets,
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
        targets: draft.targets,
      },
      sessionId: session.id,
      type: 'action_draft',
    };
  }
}
