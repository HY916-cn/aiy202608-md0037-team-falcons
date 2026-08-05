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
        mockRole: undefined,
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

  it('Supabase 配置只提供一半时安全失败', () => {
    expect(() =>
      createSupabaseServiceRuntime({
        anonKey: undefined,
        mockRole: undefined,
        url: 'https://example.supabase.co',
      }),
    ).toThrow('SUPABASE_CONFIG_INCOMPLETE');
  });

  it('无 Supabase 配置时明确使用演示数据模式', async () => {
    const runtime = createSupabaseServiceRuntime({
      anonKey: undefined,
      mockRole: 'teacher',
      url: undefined,
    });

    expect(runtime.mode).toBe('demo');
    await expect(runtime.summaryDataSource.load(teacherScope)).resolves.toMatchObject({
      dataMode: 'demo',
      title: '今日摘要（演示数据）',
    });
  });

  it('班级端首页摘要、统计和列表来自同一个当前班级快照', async () => {
    const runtime = createSupabaseServiceRuntime({
      anonKey: undefined,
      mockRole: 'class_terminal',
      url: undefined,
    });
    const classScope = {
      assignmentId: 'demo_assignment_class_terminal',
      id: '20000000-0000-0000-0000-000000000001',
      label: '演示班级',
      role: 'class_terminal',
      type: 'class',
    } as const;

    const [snapshot, summary] = await Promise.all([
      runtime.teachingAdapter.load(classScope),
      runtime.summaryDataSource.load(classScope),
    ]);

    expect(snapshot.students).toHaveLength(2);
    expect(snapshot.courseware).toHaveLength(3);
    expect(snapshot.assignments).toHaveLength(2);
    expect(summary.items.find(({ id }) => id === 'new-courseware')?.value).toBe(
      `${snapshot.courseware.length} 份`,
    );
    expect(summary.items.find(({ id }) => id === 'today-assignments')?.value).toBe(
      `${snapshot.assignments.length} 项`,
    );
  });
});
