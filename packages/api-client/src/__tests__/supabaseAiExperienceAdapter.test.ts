import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRoleScope } from '@dolphincloud/auth';
import { WriteActionConfirmationController } from '@dolphincloud/experience';

import { SupabaseAiExperienceAdapter } from '../supabaseAiExperienceAdapter';

const TEACHER_SCOPE: AuthRoleScope = {
  assignmentId: 'context-teacher',
  id: 'class-1',
  label: 'Class one',
  role: 'teacher',
  type: 'class',
};

const SECOND_TEACHER_SCOPE: AuthRoleScope = {
  assignmentId: 'context-teacher-class-2',
  id: 'class-2',
  label: 'Class two',
  role: 'teacher',
  type: 'class',
};

const ACTION_DRAFT = {
  data: {
    draftId: 'draft-1',
    preview: {
      actionType: 'assignment_publish',
      expiresAt: '2026-08-05T18:00:00.000Z',
      impact: ['Publish assignment'],
      isDangerous: false,
      parameters: { assignmentId: 'assignment-1' },
      permissionScope: 'class:class-1',
      role: 'teacher',
      targets: ['class-1'],
    },
    sessionId: 'session-1',
    type: 'action_draft',
  },
  request_id: 'request-draft',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createClient(
  invoke: ReturnType<typeof vi.fn>,
  single: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
    data: { id: TEACHER_SCOPE.assignmentId },
    error: null,
  }),
): SupabaseClient {
  const query = { eq: vi.fn(), single };
  query.eq.mockReturnValue(query);
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'user-jwt' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    }),
    functions: { invoke },
  } as unknown as SupabaseClient;
}

async function selectTeacherAndCreateDraft(
  invoke: ReturnType<typeof vi.fn>,
): Promise<SupabaseAiExperienceAdapter> {
  const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
  await adapter.selectActiveRole(TEACHER_SCOPE);
  await adapter.submit('Publish the assignment');
  return adapter;
}

describe('SupabaseAiExperienceAdapter', () => {
  it('binds a teacher request to the explicitly selected second class assignment', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: { sessionId: 'session-2', text: 'Class two summary', type: 'text' },
      },
      error: null,
    });
    const single = vi.fn().mockResolvedValue({
      data: { id: SECOND_TEACHER_SCOPE.assignmentId },
      error: null,
    });
    const eq = vi.fn();
    const query = { eq, single };
    eq.mockReturnValue(query);
    const client = createClient(invoke, single) as unknown as {
      from: ReturnType<typeof vi.fn>;
    };
    client.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(query),
    });
    const adapter = new SupabaseAiExperienceAdapter(
      client as unknown as SupabaseClient,
    );

    await expect(adapter.selectActiveRole(SECOND_TEACHER_SCOPE)).resolves.toBe(true);
    await adapter.submit('Current class');

    expect(eq.mock.calls).toEqual([
      ['id', 'context-teacher-class-2'],
      ['role', 'teacher'],
      ['scope_type', 'class'],
      ['scope_id', 'class-2'],
    ]);
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: {
        contextId: 'context-teacher-class-2',
        message: 'Current class',
      },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('keeps class B active when the older class A lookup resolves last', async () => {
    const lookupA = deferred<{ data: { id: string }; error: null }>();
    const lookupB = deferred<{ data: { id: string }; error: null }>();
    const single = vi
      .fn()
      .mockReturnValueOnce(lookupA.promise)
      .mockReturnValueOnce(lookupB.promise);
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { sessionId: 'session-b', text: 'B', type: 'text' } },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));

    const selectingA = adapter.selectActiveRole(TEACHER_SCOPE);
    const selectingB = adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    lookupB.resolve({ data: { id: SECOND_TEACHER_SCOPE.assignmentId }, error: null });
    await expect(selectingB).resolves.toBe(true);
    lookupA.resolve({ data: { id: TEACHER_SCOPE.assignmentId }, error: null });
    await expect(selectingA).resolves.toBe(false);

    await adapter.submit('Use the latest class');
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: {
        contextId: SECOND_TEACHER_SCOPE.assignmentId,
        message: 'Use the latest class',
      },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('invalidates the old context before the replacement scope lookup completes', async () => {
    const lookupB = deferred<{ data: { id: string }; error: null }>();
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: TEACHER_SCOPE.assignmentId },
        error: null,
      })
      .mockReturnValueOnce(lookupB.promise);
    const invoke = vi.fn();
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    const selectingB = adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    await adapter.submit('Must not use class A');
    expect(invoke).not.toHaveBeenCalled();

    lookupB.resolve({ data: { id: SECOND_TEACHER_SCOPE.assignmentId }, error: null });
    await expect(selectingB).resolves.toBe(true);
  });

  it('ignores a request from the previous scope when it resolves after switching', async () => {
    const oldResponse = deferred<{
      data: { data: { sessionId: string; text: string; type: 'text' } };
      error: null;
    }>();
    const invoke = vi
      .fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValueOnce({
        data: { data: { sessionId: 'session-b', text: 'B result', type: 'text' } },
        error: null,
      });
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: TEACHER_SCOPE.assignmentId }, error: null })
      .mockResolvedValueOnce({
        data: { id: SECOND_TEACHER_SCOPE.assignmentId },
        error: null,
      });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    const oldRequest = adapter.submit('Class A request');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    oldResponse.resolve({
      data: { data: { sessionId: 'session-a', text: 'Stale A', type: 'text' } },
      error: null,
    });
    await oldRequest;
    expect(adapter.getSnapshot()).toMatchObject({ result: null, state: 'idle' });

    await adapter.submit('Class B request');
    expect(adapter.getSnapshot()).toMatchObject({ result: 'B result', state: 'preview' });
  });

  it('does not send actor, role, or scope fields in a chat request', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: { sessionId: 'session-1', text: 'Today summary', type: 'text' },
        request_id: 'request-1',
      },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('Today summary');

    expect(adapter.getSnapshot()).toMatchObject({ result: 'Today summary', state: 'preview' });
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: { contextId: 'context-teacher', message: 'Today summary' },
      headers: { 'x-ai-route': '/chat' },
    });
  });

  it('turns a structured data card into readable Chinese instead of raw JSON', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: {
          card: {
            kind: 'get_today_summary',
            payload: {
              items: [
                { id: 'assignment', label: '今日作业', tone: 'info', value: '2 项' },
                { id: 'courseware', label: '新课件', tone: 'positive', value: '1 份' },
              ],
            },
          },
          sessionId: 'session-summary',
          type: 'data_card',
        },
      },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('今天有什么安排');

    expect(adapter.getSnapshot().result).toBe(
      '今日摘要\n• 今日作业：2 项\n• 新课件：1 份',
    );
    expect(adapter.getSnapshot().result).not.toContain('{');
  });

  it('does not expose JSON-looking provider text in the conversation', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: {
          sessionId: 'session-text-json',
          text: '[{"title":"语文作业","status":"published"}]',
          type: 'text',
        },
      },
      error: null,
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('查看作业');

    expect(adapter.getSnapshot().result).toBe(
      '查询结果（1 条）\n• 名称：语文作业 · 状态：published',
    );
  });

  it('uses the offline boundary for a transport failure without affecting ordinary services', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('gateway unavailable'),
    });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);
    const ordinaryTeachingAction = vi.fn().mockResolvedValue('available');

    await adapter.submit('Query');

    expect(adapter.getSnapshot().state).toBe('offline');
    await expect(ordinaryTeachingAction()).resolves.toBe('available');
  });

  it('clears the prior conversation and pending draft as soon as scope changes', async () => {
    const nextLookup = deferred<{ data: { id: string }; error: null }>();
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: TEACHER_SCOPE.assignmentId }, error: null })
      .mockReturnValueOnce(nextLookup.promise);
    const invoke = vi.fn().mockResolvedValueOnce({ data: ACTION_DRAFT, error: null });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));
    await adapter.selectActiveRole(TEACHER_SCOPE);
    await adapter.submit('Create draft');
    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');

    const selectingB = adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot()).toMatchObject({ result: null, state: 'idle' });
    await expect(adapter.confirmAction('draft-1', true)).rejects.toThrow(
      'AI_ACTION_PREVIEW_STALE',
    );
    expect(invoke).toHaveBeenCalledTimes(1);

    nextLookup.resolve({ data: { id: SECOND_TEACHER_SCOPE.assignmentId }, error: null });
    await selectingB;
  });

  it('does not let an old confirmation response update the new scope', async () => {
    const confirmation = deferred<{
      data: {
        data: { receipt: { operationId: string }; status: 'completed' };
        request_id: string;
      };
      error: null;
    }>();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockReturnValueOnce(confirmation.promise);
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: TEACHER_SCOPE.assignmentId }, error: null })
      .mockResolvedValueOnce({
        data: { id: SECOND_TEACHER_SCOPE.assignmentId },
        error: null,
      });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));
    await adapter.selectActiveRole(TEACHER_SCOPE);
    await adapter.submit('Create draft');

    const confirming = adapter.confirmAction('draft-1', true);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    confirmation.resolve({
      data: {
        data: { receipt: { operationId: 'old-operation' }, status: 'completed' },
        request_id: 'request-old-confirm',
      },
      error: null,
    });

    await expect(confirming).rejects.toThrow('AI_SCOPE_CHANGED');
    expect(adapter.getSnapshot()).toMatchObject({ auditResult: null, state: 'idle' });
  });

  it('does not let an old cancellation response update the new scope', async () => {
    const cancellation = deferred<{
      data: { data: { status: 'cancelled' }; request_id: string };
      error: null;
    }>();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockReturnValueOnce(cancellation.promise);
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: TEACHER_SCOPE.assignmentId }, error: null })
      .mockResolvedValueOnce({
        data: { id: SECOND_TEACHER_SCOPE.assignmentId },
        error: null,
      });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke, single));
    await adapter.selectActiveRole(TEACHER_SCOPE);
    await adapter.submit('Create draft');

    const cancelling = adapter.cancelAction('draft-1');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await adapter.selectActiveRole(SECOND_TEACHER_SCOPE);
    cancellation.resolve({
      data: { data: { status: 'cancelled' }, request_id: 'request-old-cancel' },
      error: null,
    });

    await expect(cancelling).rejects.toThrow('AI_SCOPE_CHANGED');
    expect(adapter.getSnapshot()).toMatchObject({ actionPreview: null, state: 'idle' });
  });

  it.each([
    ['unknown role', { preview: { ...ACTION_DRAFT.data.preview, role: 'student' } }],
    ['empty impact item', { preview: { ...ACTION_DRAFT.data.preview, impact: [''] } }],
    ['empty impact list', { preview: { ...ACTION_DRAFT.data.preview, impact: [] } }],
    ['non-string target', { preview: { ...ACTION_DRAFT.data.preview, targets: [1] } }],
    ['empty target list', { preview: { ...ACTION_DRAFT.data.preview, targets: [] } }],
    ['empty draft id', { draftId: '' }],
    ['empty session id', { sessionId: '  ' }],
    ['empty action type', { preview: { ...ACTION_DRAFT.data.preview, actionType: '' } }],
    ['empty expiry', { preview: { ...ACTION_DRAFT.data.preview, expiresAt: '' } }],
    ['empty permission scope', { preview: { ...ACTION_DRAFT.data.preview, permissionScope: '' } }],
  ])('rejects an invalid action draft DTO: %s', async (_label, override) => {
    const data = {
      ...ACTION_DRAFT.data,
      ...override,
      preview: {
        ...ACTION_DRAFT.data.preview,
        ...('preview' in override ? override.preview : {}),
      },
    };
    const invoke = vi.fn().mockResolvedValue({ data: { data }, error: null });
    const adapter = new SupabaseAiExperienceAdapter(createClient(invoke));
    await adapter.selectActiveRole(TEACHER_SCOPE);

    await adapter.submit('Create malformed draft');

    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot().state).toBe('offline');
  });

  it('prevents duplicate confirmation requests while the first is pending', async () => {
    const confirmation = deferred<{
      data: {
        data: { receipt: { operationId: string }; status: 'completed' };
        request_id: string;
      };
      error: null;
    }>();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockReturnValueOnce(confirmation.promise);
    const adapter = await selectTeacherAndCreateDraft(invoke);

    const first = adapter.confirmAction('draft-1', true);
    const duplicate = adapter.confirmAction('draft-1', true);
    expect(invoke).toHaveBeenCalledTimes(2);
    confirmation.resolve({
      data: {
        data: { receipt: { operationId: 'operation-1' }, status: 'completed' },
        request_id: 'request-confirm',
      },
      error: null,
    });
    await Promise.all([first, duplicate]);

    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot()).toMatchObject({
      auditResult: {
        receipt: { operationId: 'operation-1' },
        requestId: 'request-confirm',
      },
      state: 'success',
    });
  });

  it('rejects a stale preview id without confirming the current draft', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ data: ACTION_DRAFT, error: null });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await expect(adapter.confirmAction('draft-old', true)).rejects.toThrow(
      'AI_ACTION_PREVIEW_STALE',
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');
    expect(adapter.getSnapshot().state).toBe('error');
  });

  it.each([
    [
      'transport error',
      { data: null, error: new Error('transport failure') },
    ],
    [
      'HTTP 200 business error',
      {
        data: { error: { code: 'FORBIDDEN' }, request_id: 'request-error' },
        error: null,
      },
    ],
  ])('puts the confirmation controller in error on %s', async (_label, response) => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce(response);
    const adapter = await selectTeacherAndCreateDraft(invoke);
    const preview = adapter.getPendingAction();
    expect(preview).not.toBeNull();
    const controller = new WriteActionConfirmationController(preview!, {
      execute: async (previewId) => adapter.confirmAction(previewId, true),
    });

    await controller.confirm();

    expect(controller.getState()).toBe('error');
    expect(adapter.getSnapshot().state).toBe('error');
    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');
  });

  it.each([
    ['empty data', { data: undefined, request_id: 'request-confirm' }],
    [
      'wrong status',
      { data: { receipt: {}, status: 'executing' }, request_id: 'request-confirm' },
    ],
    [
      'malformed receipt',
      { data: { receipt: 'not-an-object', status: 'completed' }, request_id: 'request-confirm' },
    ],
    [
      'missing request id',
      { data: { receipt: {}, status: 'completed' } },
    ],
  ])('rejects a malformed confirmation response: %s', async (_label, data) => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce({ data, error: null });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await expect(adapter.confirmAction('draft-1', true)).rejects.toThrow(
      'AI_GATEWAY_INVALID_RESPONSE',
    );

    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');
    expect(adapter.getSnapshot().state).toBe('error');
  });

  it('cancels a draft only after a validated cancelled response', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce({
        data: { data: { status: 'cancelled' }, request_id: 'request-cancel' },
        error: null,
      });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await adapter.cancelAction('draft-1');

    expect(invoke.mock.calls[1]?.[1]).toEqual({
      body: {},
      headers: { 'x-ai-route': '/action-drafts/draft-1/cancel' },
    });
    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot().state).toBe('idle');
  });

  it('keeps a draft and enters error when cancellation has a business failure', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce({
        data: { error: { code: 'FORBIDDEN' }, request_id: 'request-cancel' },
        error: null,
      });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await expect(adapter.cancelAction('draft-1')).rejects.toThrow('AI_GATEWAY_ERROR');

    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');
    expect(adapter.getSnapshot()).toMatchObject({
      actionPreview: { draftId: 'draft-1' },
      state: 'error',
    });
  });

  it('returns to listening only after the server successfully cancels the draft', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce({
        data: { data: { status: 'cancelled' }, request_id: 'request-cancel' },
        error: null,
      });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await adapter.returnToModify('draft-1');

    expect(adapter.getPendingAction()).toBeNull();
    expect(adapter.getSnapshot().state).toBe('listening');
  });

  it('does not enter listening when return-to-modify cancellation fails', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: ACTION_DRAFT, error: null })
      .mockResolvedValueOnce({
        data: { data: { status: 'completed' }, request_id: 'request-cancel' },
        error: null,
      });
    const adapter = await selectTeacherAndCreateDraft(invoke);

    await expect(adapter.returnToModify('draft-1')).rejects.toThrow(
      'AI_GATEWAY_INVALID_RESPONSE',
    );

    expect(adapter.getPendingAction()?.draftId).toBe('draft-1');
    expect(adapter.getSnapshot().state).toBe('error');
  });
});
