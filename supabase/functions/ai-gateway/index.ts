import {
  AiActionDraftService,
  AiGatewayHttpApplication,
  AiGatewayService,
  AiSessionService,
  CozeGatewayClient,
  SkillQueryService,
  SupabaseAiActionDraftRepository,
  SupabaseAiActionExecutionAdapter,
  SupabaseAiSessionRepository,
  resolveSupabaseSkillContext,
} from '@dolphincloud/ai-service';
import { SupabaseTeachingDemoAdapter } from '@dolphincloud/api-client';
import { TeachingTodaySummaryDataSource } from '@dolphincloud/experience';
import { createClient } from '@supabase/supabase-js';

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
    throw new Error(`MISSING_SERVER_ENV:${name}`);
  }
  return value;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: CORS_HEADERS,
    status,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }

  const authorization = request.headers.get('Authorization');
  if (authorization === null) {
    return json(
      {
        error: { code: 'UNAUTHENTICATED', message: '请先登录。' },
        request_id: crypto.randomUUID(),
      },
      401,
    );
  }

  try {
    const client = createClient(
      requiredEnvironment('SUPABASE_URL'),
      requiredEnvironment('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authorization } } },
    );
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError !== null || user === null) {
      return json(
        {
          error: { code: 'UNAUTHENTICATED', message: '请先登录。' },
          request_id: crypto.randomUUID(),
        },
        401,
      );
    }

    const teachingAdapter = new SupabaseTeachingDemoAdapter(client);
    const summaryDataSource = new TeachingTodaySummaryDataSource(teachingAdapter);
    const sessionRepository = new SupabaseAiSessionRepository(client);
    const draftRepository = new SupabaseAiActionDraftRepository(client);
    const draftService = new AiActionDraftService(
      draftRepository,
      new SupabaseAiActionExecutionAdapter(client),
    );
    const gateway = new AiGatewayService(
      new AiSessionService(sessionRepository),
      new CozeGatewayClient({
        apiBaseUrl: requiredEnvironment('COZE_API_BASE_URL'),
        botId: requiredEnvironment('COZE_BOT_ID'),
        timeoutMs: Number(Deno.env.get('AI_GATEWAY_TIMEOUT_MS') ?? '8000'),
        token: requiredEnvironment('COZE_API_TOKEN'),
      }),
      new SkillQueryService(teachingAdapter, summaryDataSource),
      draftService,
    );
    const application = new AiGatewayHttpApplication(gateway, draftService);
    const pathname =
      request.headers.get('x-ai-route') ??
      new URL(request.url).pathname.replace(/^\/ai-gateway/, '');
    const result = await application.handle({
      body: await request.json().catch(() => null),
      method: request.method,
      path: pathname,
      principal: { userId: user.id },
      signal: request.signal,
      skillContext: await resolveSupabaseSkillContext(client, user.id),
    });
    return json(result.body, result.status);
  } catch {
    return json(
      {
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'AI 暂不可用，普通功能不受影响。',
        },
        request_id: crypto.randomUUID(),
      },
      503,
    );
  }
});
