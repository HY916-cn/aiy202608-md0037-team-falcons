import { describe, expect, it, vi } from 'vitest';

import { DeepSeekGatewayClient } from '../deepSeekGatewayClient';
import { parseGatewayRequest } from '../inputSecurity';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function createClient(fetchImplementation: typeof fetch, timeoutMs = 100) {
  return new DeepSeekGatewayClient({
    apiBaseUrl: 'https://api.deepseek.com',
    apiKey: 'server-only-key',
    fetchImplementation,
    model: 'deepseek-chat',
    timeoutMs,
  });
}

const INPUT = {
  conversationReference: null,
  message: '查询今日摘要',
  sessionReference: 'session-1',
};

describe('DeepSeekGatewayClient contract', () => {
  it('调用 OpenAI 兼容接口并返回白名单结果', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValueOnce(
      response(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                arguments: {},
                skill: 'get_today_summary',
                type: 'skill_query',
              }),
              role: 'assistant',
            },
          },
        ],
      }),
    );

    await expect(createClient(fetchImplementation).send(INPUT)).resolves.toEqual({
      conversationReference: 'session-1',
      result: {
        arguments: {},
        skill: 'get_today_summary',
        type: 'skill_query',
      },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    const init = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer server-only-key',
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      stream: false,
      temperature: 0.2,
    });
  });

  it('保留同一海豚云会话引用', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, {
        choices: [
          { message: { content: '{"type":"text","text":"继续"}' } },
        ],
      }),
    );
    await expect(
      createClient(fetchImplementation).send({
        ...INPUT,
        conversationReference: 'session-1',
      }),
    ).resolves.toMatchObject({ conversationReference: 'session-1' });
  });

  it.each([
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_UNAVAILABLE'],
  ] as const)('对连续 %s 只重试一次并返回结构化错误', async (status, code) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(status, {}));
    await expect(createClient(fetchImplementation).send(INPUT)).rejects.toMatchObject({
      code,
      status: 503,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('超时会取消请求', async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
    );
    await expect(createClient(fetchImplementation, 5).send(INPUT)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
  });

  it('调用方取消会中止请求', async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
    );
    const controller = new AbortController();
    const pending = createClient(fetchImplementation).send({
      ...INPUT,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'AI_CANCELLED' });
  });

  it('拒绝非白名单操作和非 JSON 响应', async () => {
    const invalidAction = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, {
        choices: [
          {
            message: {
              content:
                '{"type":"action_proposal","action_type":"delete_all","parameters":{}}',
            },
          },
        ],
      }),
    );
    await expect(createClient(invalidAction).send(INPUT)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });

    const plainText = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, { choices: [{ message: { content: '完成' } }] }),
    );
    await expect(createClient(plainText).send(INPUT)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
});

describe('parseGatewayRequest', () => {
  it.each(['actorId', 'actor_role', 'role', 'scope', 'permissionScope', 'user_id'])(
    '拒绝客户端注入 %s',
    (key) => {
      expect(() =>
        parseGatewayRequest({ contextId: 'context-1', message: 'hello', [key]: 'forged' }),
      ).toThrow('VALIDATION_ERROR');
    },
  );

  it('要求 active context 且限制消息长度', () => {
    expect(() => parseGatewayRequest({ message: 'hello' })).toThrow('VALIDATION_ERROR');
    expect(() =>
      parseGatewayRequest({ contextId: 'context-1', message: 'x'.repeat(2001) }),
    ).toThrow('VALIDATION_ERROR');
  });
});
