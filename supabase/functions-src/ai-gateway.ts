import {
  AI_READ_SKILLS,
  AiActionDraftService,
  AiGatewayHttpApplication,
  AiGatewayService,
  AiServiceError,
  AiSessionService,
  AiSkillContextTokenIssuer,
  CozeGatewayClient,
  SkillQueryService,
  SupabaseAiActionDraftRepository,
  SupabaseAiActionExecutionAdapter,
  SupabaseAiActionPreviewResolver,
  SupabaseAiRequestGuard,
  SupabaseAiSessionRepository,
  SupabaseAiSkillTokenRegistry,
  readVerifiedSkillTokenId,
  resolveSupabaseSkillContext,
  type AiReadSkill,
} from '@dolphincloud/ai-service';
import { SupabaseTeachingDemoAdapter } from '@dolphincloud/api-client';
import { TeachingTodaySummaryDataSource } from '@dolphincloud/experience';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-ai-route, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new AiServiceError('AI_UNAVAILABLE', 503);
  }
  return value;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });
}

function route(request: Request): string {
  return (
    request.headers.get('x-ai-route') ??
    new URL(request.url).pathname.replace(/^\/ai-gateway/, '')
  );
}

function bearer(request: Request): string | null {
  const value = request.headers.get('Authorization');
  return value?.startsWith('Bearer ') === true ? value.slice(7) : null;
}

function createUserClient(token: string): SupabaseClient {
  return createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

async function authenticatedUser(client: SupabaseClient, token: string) {
  const { data, error } = await client.auth.getUser(token);
  if (error !== null || data.user === null) {
    throw new AiServiceError('UNAUTHENTICATED', 401);
  }
  return data.user;
}

function parseSkillBody(value: unknown): {
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly skill: AiReadSkill;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.skill !== 'string' ||
    !AI_READ_SKILLS.some((skill) => skill === input.skill) ||
    input.arguments === null ||
    typeof input.arguments !== 'object' ||
    Array.isArray(input.arguments) ||
    Object.keys(input).some((key) => key !== 'skill' && key !== 'arguments')
  ) {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  return {
    arguments: input.arguments as Readonly<Record<string, unknown>>,
    skill: input.skill as AiReadSkill,
  };
}

async function handleSkillQuery(request: Request, body: unknown): Promise<Response> {
  const token = bearer(request);
  if (token === null) throw new AiServiceError('UNAUTHENTICATED', 401);
  const client = createUserClient(token);
  const user = await authenticatedUser(client, token);
  const input = parseSkillBody(body);
  const tokenId = readVerifiedSkillTokenId(token);
  const { data: contextId, error } = await client.rpc(
    'consume_ai_skill_context_token',
    { requested_skill: input.skill, token_id: tokenId },
  );
  if (error !== null || typeof contextId !== 'string') {
    throw new AiServiceError('FORBIDDEN', 403, { cause: error });
  }
  const teaching = new SupabaseTeachingDemoAdapter(client);
  const context = await resolveSupabaseSkillContext(client, user.id, contextId);
  const result = await new SkillQueryService(
    teaching,
    new TeachingTodaySummaryDataSource(teaching),
  ).query(input.skill, input.arguments, context);
  return json({ data: result, request_id: crypto.randomUUID() }, 200);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== 'POST') throw new AiServiceError('NOT_FOUND', 404);
    const body = await request.json().catch(() => null);
    if (route(request) === '/skills/query') {
      return await handleSkillQuery(request, body);
    }
    const token = bearer(request);
    if (token === null) throw new AiServiceError('UNAUTHENTICATED', 401);
    const client = createUserClient(token);
    const user = await authenticatedUser(client, token);

    let contextId: string;
    if (route(request) === '/chat') {
      if (
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        typeof (body as Record<string, unknown>).contextId !== 'string'
      ) {
        throw new AiServiceError('VALIDATION_ERROR', 422);
      }
      contextId = (body as Record<string, unknown>).contextId as string;
    } else {
      const draftId = /^\/action-drafts\/([^/]+)\/(?:confirm|cancel)$/.exec(
        route(request),
      )?.[1];
      if (draftId === undefined) throw new AiServiceError('NOT_FOUND', 404);
      const { data: draft, error } = await client
        .from('ai_action_drafts')
        .select('role_assignment_id')
        .eq('id', draftId)
        .single();
      if (error !== null || typeof draft?.role_assignment_id !== 'string') {
        throw new AiServiceError('FORBIDDEN', 403, { cause: error });
      }
      contextId = draft.role_assignment_id;
    }

    const context = await resolveSupabaseSkillContext(client, user.id, contextId);
    const teaching = new SupabaseTeachingDemoAdapter(client);
    const draftService = new AiActionDraftService(
      new SupabaseAiActionDraftRepository(client),
      new SupabaseAiActionExecutionAdapter(client),
      new SupabaseAiActionPreviewResolver(client),
    );
    const gateway = new AiGatewayService(
      new AiSessionService(new SupabaseAiSessionRepository(client)),
      new CozeGatewayClient({
        apiBaseUrl: requiredEnvironment('COZE_API_BASE_URL'),
        botId: requiredEnvironment('COZE_BOT_ID'),
        skillEndpoint: requiredEnvironment('AI_SKILL_ENDPOINT'),
        timeoutMs: Number(Deno.env.get('AI_GATEWAY_TIMEOUT_MS') ?? '8000'),
        token: requiredEnvironment('COZE_API_TOKEN'),
      }),
      new SkillQueryService(
        teaching,
        new TeachingTodaySummaryDataSource(teaching),
      ),
      draftService,
      new SupabaseAiRequestGuard(client),
      new AiSkillContextTokenIssuer(
        requiredEnvironment('SUPABASE_JWT_SECRET'),
        new SupabaseAiSkillTokenRegistry(client),
      ),
    );
    const result = await new AiGatewayHttpApplication(
      gateway,
      draftService,
    ).handle({
      body,
      method: request.method,
      path: route(request),
      principal: { userId: user.id },
      signal: request.signal,
      skillContext: context,
    });
    return json(result.body, result.status);
  } catch (error) {
    const serviceError =
      error instanceof AiServiceError
        ? error
        : new AiServiceError('AI_UNAVAILABLE', 503, { cause: error });
    return json(
      {
        error: {
          code: serviceError.code,
          message:
            serviceError.code === 'UNAUTHENTICATED'
              ? '请先登录。'
              : '请求未完成，普通功能不受影响。',
        },
        request_id: requestId,
      },
      serviceError.status,
    );
  }
});
