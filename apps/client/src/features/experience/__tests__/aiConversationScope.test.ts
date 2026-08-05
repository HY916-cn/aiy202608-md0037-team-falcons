import { describe, expect, it } from 'vitest';

import {
  AiConversationScopeGuard,
  createEmptyAiConversationViewState,
  getAiConversationScopeKey,
} from '../aiConversationScope';

describe('AI conversation scope state', () => {
  it('clears the prompt and old conversation when role scope changes', () => {
    const previous = {
      messages: [{ content: 'Class A history', id: 'message-a', role: 'user' as const }],
      prompt: 'Class A draft prompt',
    };

    const next = createEmptyAiConversationViewState();

    expect(previous.messages).toHaveLength(1);
    expect(next).toEqual({ messages: [], prompt: '' });
  });

  it('allows only the latest scope or request generation to update the view', () => {
    const guard = new AiConversationScopeGuard();
    const classA = guard.beginScopeChange();
    const classB = guard.beginScopeChange();

    expect(guard.isCurrent(classA)).toBe(false);
    expect(guard.isCurrent(classB)).toBe(true);
  });

  it('remounts the conversation for a different assignment in the same role', () => {
    const classA = getAiConversationScopeKey({
      assignmentId: 'assignment-a',
      id: 'class-a',
      label: 'Class A',
      role: 'teacher',
      type: 'class',
    });
    const classB = getAiConversationScopeKey({
      assignmentId: 'assignment-b',
      id: 'class-b',
      label: 'Class B',
      role: 'teacher',
      type: 'class',
    });

    expect(classB).not.toBe(classA);
  });
});
