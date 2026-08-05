import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseServiceRuntime } from '../supabaseServiceRuntime';

function createSessionAwareClient() {
  let accessToken: string | null = null;
  let authListener: ((event: string) => void) | null = null;
  const teachingRequestTokens: (string | null)[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { display_name: '演示教师', id: 'teacher-1' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'role_assignments') {
      const chain = {
        eq: vi.fn(() => chain),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'assignment-teacher-school',
              role: 'teacher',
              scope_id: 'school-1',
              scope_type: 'school',
            },
          ],
          error: null,
        }),
        single: vi.fn().mockResolvedValue({
          data: { id: 'assignment-teacher-school' },
          error: null,
        }),
      };
      return {
        select: () => chain,
      };
    }
    if (table === 'schools') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { name: '海豚云合成演示学校' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'classes' || table === 'students') {
      const chain = {
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn().mockImplementation(async () => {
          teachingRequestTokens.push(accessToken);
          return accessToken === null
            ? { data: null, error: new Error('UNAUTHENTICATED') }
            : { data: [], error: null };
        }),
      };
      return {
        select: () => chain,
      };
    }
    throw new Error(`UNEXPECTED_TABLE:${table}`);
  });

  const client = {
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: {
          user: accessToken === null ? null : { id: 'teacher-1' },
        },
        error: null,
      })),
      onAuthStateChange: vi.fn((listener: (event: string) => void) => {
        authListener = listener;
        return {
          data: { subscription: { unsubscribe: vi.fn() } },
        };
      }),
      signInWithPassword: vi.fn().mockImplementation(async () => {
        accessToken = 'signed-in-token';
        authListener?.('SIGNED_IN');
        return { error: null };
      }),
      signOut: vi.fn().mockImplementation(async () => {
        accessToken = null;
        authListener?.('SIGNED_OUT');
        return { error: null };
      }),
    },
    from,
  } as unknown as SupabaseClient;

  return {
    client,
    refreshToken() {
      accessToken = 'refreshed-token';
      authListener?.('TOKEN_REFRESHED');
    },
    teachingRequestTokens,
  };
}

describe('createSupabaseServiceRuntime', () => {
  const teacherScope = {
    assignmentId: 'assignment-teacher-school',
    id: 'school-1',
    label: '演示学校',
    role: 'teacher',
    type: 'school',
  } as const;

  it('认证和教学服务复用同一个 Supabase session，覆盖登录、刷新和退出', async () => {
    const fake = createSessionAwareClient();
    const clientFactory = vi.fn(() => fake.client);
    const runtime = createSupabaseServiceRuntime(
      {
        anonKey: 'anon-key',
        url: 'https://example.supabase.co',
      },
      clientFactory,
    );
    const unsubscribe = runtime.authAdapter.subscribe?.(() => undefined);

    await runtime.authAdapter.login({
      email: 'teacher@example.com',
      password: 'synthetic-password',
    });
    await expect(runtime.teachingAdapter.load(teacherScope)).resolves.toMatchObject({
      classes: [],
    });
    expect(fake.teachingRequestTokens.at(-1)).toBe('signed-in-token');

    fake.refreshToken();
    await expect(runtime.teachingAdapter.load(teacherScope)).resolves.toMatchObject({
      classes: [],
    });
    expect(fake.teachingRequestTokens.at(-1)).toBe('refreshed-token');

    await runtime.authAdapter.logout();
    await expect(runtime.teachingAdapter.load(teacherScope)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fake.teachingRequestTokens.at(-1)).toBeNull();
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(runtime.client).toBe(fake.client);
    unsubscribe?.();
  });

  it('Supabase 配置只提供一半时进入不可用边界而不是 Mock', async () => {
    const clientFactory = vi.fn();
    const runtime = createSupabaseServiceRuntime(
      { anonKey: undefined, url: 'https://example.supabase.co' },
      clientFactory,
    );

    expect(runtime.mode).toBe('unconfigured');
    expect(runtime.configurationIssue).toBe('incomplete');
    expect(runtime.client).toBeNull();
    expect(clientFactory).not.toHaveBeenCalled();
    await expect(
      runtime.authAdapter.login({ email: 'user@example.com', password: 'password' }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNCONFIGURED' });
  });

  it('无 Supabase 配置时不创建合成会话、摘要或教学数据', async () => {
    const runtime = createSupabaseServiceRuntime({
      anonKey: undefined,
      url: undefined,
    });

    expect(runtime.mode).toBe('unconfigured');
    expect(runtime.configurationIssue).toBe('missing');
    await expect(runtime.authAdapter.getSession()).resolves.toMatchObject({
      currentRole: null,
      user: null,
    });
    await expect(runtime.summaryDataSource.load(teacherScope)).rejects.toMatchObject({
      code: 'SERVICE_UNCONFIGURED',
    });
    await expect(runtime.teachingAdapter.load(teacherScope)).rejects.toMatchObject({
      code: 'SERVICE_UNCONFIGURED',
    });
  });
});
