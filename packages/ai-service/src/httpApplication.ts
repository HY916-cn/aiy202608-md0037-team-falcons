import type { RoleCode } from '@dolphincloud/auth';

import type { AiActionDraftService } from './actionDraftService';
import { AiServiceError } from './errors';
import type { AiGatewayService } from './gatewayService';
import { assertNoAuthorizationInjection } from './inputSecurity';
import type { AiPrincipal } from './sessionService';

export type AiHttpRequest = {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
  readonly principal: AiPrincipal | null;
  readonly signal?: AbortSignal;
  readonly skillContext: {
    readonly permissionScope: string;
    readonly role: RoleCode;
    readonly userId: string;
  } | null;
};

export type AiHttpResponse = {
  readonly body: unknown;
  readonly status: number;
};

function messageForCode(code: string): string {
  if (code.startsWith('AI_')) return 'AI 暂不可用，普通功能不受影响。';
  if (code === 'UNAUTHENTICATED') return '请先登录。';
  if (code === 'FORBIDDEN') return '当前账号无权执行此操作。';
  if (code === 'SECOND_CONFIRMATION_REQUIRED') return '危险操作需要二次确认。';
  return '请求未完成，请检查后重试。';
}

export class AiGatewayHttpApplication {
  constructor(
    private readonly gateway: AiGatewayService,
    private readonly drafts: AiActionDraftService,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  async handle(request: AiHttpRequest): Promise<AiHttpResponse> {
    const requestId = this.createRequestId();
    try {
      if (request.principal === null || request.skillContext === null) {
        throw new AiServiceError('UNAUTHENTICATED', 401);
      }
      if (request.skillContext.userId !== request.principal.userId) {
        throw new AiServiceError('FORBIDDEN', 403);
      }
      if (request.method === 'POST' && request.path === '/chat') {
        return {
          body: {
            data: await this.gateway.chat(
              request.body,
              request.principal,
              request.skillContext,
              request.signal,
            ),
            request_id: requestId,
          },
          status: 200,
        };
      }
      const confirmMatch = /^\/action-drafts\/([^/]+)\/confirm$/.exec(
        request.path,
      );
      if (request.method === 'POST' && confirmMatch?.[1] !== undefined) {
        assertNoAuthorizationInjection(request.body);
        if (
          request.body === null ||
          typeof request.body !== 'object' ||
          Array.isArray(request.body) ||
          Object.keys(request.body).some((key) => key !== 'dangerousConfirmed')
        ) {
          throw new AiServiceError('VALIDATION_ERROR', 400);
        }
        const dangerousConfirmed =
          request.body !== null &&
          typeof request.body === 'object' &&
          !Array.isArray(request.body) &&
          (request.body as Record<string, unknown>).dangerousConfirmed === true;
        await this.drafts.confirm({
          dangerousConfirmed,
          draftId: confirmMatch[1],
          principal: request.principal,
        });
        return {
          body: { data: { status: 'completed' }, request_id: requestId },
          status: 200,
        };
      }
      const cancelMatch = /^\/action-drafts\/([^/]+)\/cancel$/.exec(request.path);
      if (request.method === 'POST' && cancelMatch?.[1] !== undefined) {
        assertNoAuthorizationInjection(request.body);
        await this.drafts.cancel(request.principal, cancelMatch[1]);
        return {
          body: { data: { status: 'cancelled' }, request_id: requestId },
          status: 200,
        };
      }
      throw new AiServiceError('NOT_FOUND', 404);
    } catch (error) {
      const serviceError =
        error instanceof AiServiceError
          ? error
          : new AiServiceError('INTERNAL_ERROR', 500, { cause: error });
      return {
        body: {
          error: {
            code: serviceError.code,
            message: messageForCode(serviceError.code),
          },
          request_id: requestId,
        },
        status: serviceError.status,
      };
    }
  }
}
