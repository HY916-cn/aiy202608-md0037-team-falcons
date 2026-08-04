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
    apiBaseUrl: 'https://api.coze.cn',
    botId: 'server-bot-id',
    fetchImplementation,
    pollIntervalMs: 0,
    sleep: async () => Promise.resolve(),
    timeoutMs,
    token: 'server-only-token',
  });
}

const INPUT = {
  conversationReference: null,
  message: '查询今日摘要',
  sessionReference: 'session-1',
  skillContextToken: 'short-lived-token',
};

describe('CozeGatewayClient v3 contract', () => {
  it('按官方 create、retrieve、message list 异步协议返回结果', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: {
            conversation_id: 'conversation-1',
            id: 'chat-1',
            status: 'in_progress',
          },
          msg: '',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: { id: 'chat-1', status: 'completed' },
          msg: '',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: [
            {
              content: JSON.stringify({ text: '完成', type: 'text' }),
              content_type: 'text',
              role: 'assistant',
              type: 'answer',
            },
          ],
          msg: '',
        }),
      );

    await expect(createClient(fetchImplementation).send(INPUT)).resolves.toEqual({
      conversationReference: 'conversation-1',
      result: { text: '完成', type: 'text' },
    });
    expect(fetchImplementation.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.coze.cn/v3/chat',
      'https://api.coze.cn/v3/chat/retrieve?conversation_id=conversation-1&chat_id=chat-1',
      'https://api.coze.cn/v3/chat/message/list?conversation_id=conversation-1&chat_id=chat-1',
    ]);
    const body = JSON.parse(
      String((fetchImplementation.mock.calls[0]?.[1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      additional_messages: [
        {
          content: '查询今日摘要',
          content_type: 'text',
          role: 'user',
          type: 'question',
        },
      ],
      auto_save_history: true,
      bot_id: 'server-bot-id',
      stream: false,
      user_id: 'session-1',
    });
  });

  it('复用已保存 conversation_id', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: { conversation_id: 'conversation-1', id: 'chat-2', status: 'completed' },
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: [{ content: '继续', role: 'assistant', type: 'answer' }],
        }),
      );

    await createClient(fetchImplementation).send({
      ...INPUT,
      conversationReference: 'conversation-1',
    });

    expect(String(fetchImplementation.mock.calls[0]?.[0])).toContain(
      '/v3/chat?conversation_id=conversation-1',
    );
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

  it('调用方取消会中止官方 v3 请求', async () => {
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

  it('拒绝非法官方响应和非白名单 action', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: { conversation_id: 'c', id: 'chat', status: 'completed' },
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          code: 0,
          data: [
            {
              content: JSON.stringify({ action_type: 'delete_all', parameters: {}, type: 'action_proposal' }),
              role: 'assistant',
              type: 'answer',
            },
          ],
        }),
      );
    await expect(createClient(fetchImplementation).send(INPUT)).rejects.toMatchObject({
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
