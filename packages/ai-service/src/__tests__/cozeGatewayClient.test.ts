import { describe, expect, it, vi } from 'vitest';

import { CozeGatewayClient } from '../cozeGatewayClient';
import { parseGatewayRequest } from '../inputSecurity';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function createClient(fetchImplementation: typeof fetch, timeoutMs = 100) {
  return new CozeGatewayClient({
    apiBaseUrl: 'https://coze.example.test',
    botId: 'server-bot-id',
    fetchImplementation,
    timeoutMs,
    token: 'server-only-token',
  });
}

const INPUT = {
  conversationReference: null,
  message: '查询今日摘要',
  sessionReference: 'session-1',
};

describe('CozeGatewayClient', () => {
  it.each([429, 500, 503])('对 %s 仅重试一次后成功', async (status) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(status, {}))
      .mockResolvedValueOnce(response(200, { type: 'text', text: '完成' }));

    await expect(createClient(fetchImplementation).send(INPUT)).resolves.toEqual({
      text: '完成',
      type: 'text',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_UNAVAILABLE'],
  ] as const)('对连续 %s 返回结构化错误', async (status, code) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(status, {}));

    await expect(createClient(fetchImplementation).send(INPUT)).rejects.toMatchObject({
      code,
      status: 503,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('超时后取消请求并返回结构化错误', async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    );

    await expect(createClient(fetchImplementation, 5).send(INPUT)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
      status: 503,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('调用方取消后中止外部请求', async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    );
    const controller = new AbortController();
    const pending = createClient(fetchImplementation).send({
      ...INPUT,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'AI_CANCELLED',
      status: 499,
    });
  });

  it('拒绝非法 provider 响应', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(200, { data: { type: 'script', code: 'bad' } }));

    await expect(createClient(fetchImplementation).send(INPUT)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
});

describe('parseGatewayRequest', () => {
  it.each(['actorId', 'actor_role', 'role', 'scope', 'permissionScope', 'user_id'])(
    '拒绝客户端注入 %s',
    (key) => {
      expect(() => parseGatewayRequest({ message: 'hello', [key]: 'forged' })).toThrow(
        'VALIDATION_ERROR',
      );
    },
  );

  it('递归拒绝参数中的授权注入', () => {
    expect(() =>
      parseGatewayRequest({ message: 'hello', nested: { actorId: 'forged' } }),
    ).toThrow('VALIDATION_ERROR');
  });
});
