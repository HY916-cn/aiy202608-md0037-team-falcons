import { AiServiceError } from './errors';

export type AiPrincipal = {
  readonly userId: string;
};

export type AiSession = {
  readonly conversationReference: string | null;
  readonly id: string;
  readonly roleAssignmentId: string;
  readonly status: 'active' | 'closed';
  readonly userId: string;
};

export interface AiSessionRepository {
  create(userId: string, roleAssignmentId: string): Promise<AiSession>;
  findById(sessionId: string): Promise<AiSession | null>;
  updateConversationReference(
    sessionId: string,
    conversationReference: string,
  ): Promise<void>;
}

export class AiSessionService {
  constructor(private readonly repository: AiSessionRepository) {}

  async resolve(
    principal: AiPrincipal | null,
    roleAssignmentId: string,
    sessionId?: string,
  ): Promise<AiSession> {
    if (principal === null) {
      throw new AiServiceError('UNAUTHENTICATED', 401);
    }
    if (sessionId === undefined) {
      return this.repository.create(principal.userId, roleAssignmentId);
    }
    const session = await this.repository.findById(sessionId);
    if (session === null) {
      throw new AiServiceError('NOT_FOUND', 404);
    }
    if (session.userId !== principal.userId) {
      throw new AiServiceError('FORBIDDEN', 403);
    }
    if (session.roleAssignmentId !== roleAssignmentId) {
      throw new AiServiceError('FORBIDDEN', 403);
    }
    if (session.status !== 'active') {
      throw new AiServiceError('CONFLICT', 409);
    }
    return session;
  }

  async updateConversationReference(
    sessionId: string,
    conversationReference: string,
  ): Promise<void> {
    await this.repository.updateConversationReference(
      sessionId,
      conversationReference,
    );
  }
}
