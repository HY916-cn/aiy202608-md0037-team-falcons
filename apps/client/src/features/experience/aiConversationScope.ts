import type { AuthRoleScope } from '@dolphincloud/auth';

export type AiConversationMessage = {
  readonly content: string;
  readonly id: string;
  readonly role: 'assistant' | 'user';
};

export type AiConversationViewState = {
  readonly messages: readonly AiConversationMessage[];
  readonly prompt: string;
};

export function createEmptyAiConversationViewState(): AiConversationViewState {
  return { messages: [], prompt: '' };
}

export function getAiConversationScopeKey(roleScope: AuthRoleScope): string {
  return [
    roleScope.assignmentId,
    roleScope.role,
    roleScope.type,
    roleScope.id,
  ].join(':');
}

export class AiConversationScopeGuard {
  private generation = 0;

  beginScopeChange(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}
