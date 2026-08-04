import { AiServiceError } from './errors';

const FORBIDDEN_INPUT_KEYS = new Set([
  'actorid',
  'actorrole',
  'permissionscope',
  'role',
  'scope',
  'userid',
]);

function canonicalizeKey(key: string): string {
  return key.replaceAll('_', '').replaceAll('-', '').toLowerCase();
}

export function assertNoAuthorizationInjection(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoAuthorizationInjection);
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  Object.entries(value).forEach(([key, nestedValue]) => {
    if (FORBIDDEN_INPUT_KEYS.has(canonicalizeKey(key))) {
      throw new AiServiceError('VALIDATION_ERROR', 422);
    }
    assertNoAuthorizationInjection(nestedValue);
  });
}

export function parseGatewayRequest(value: unknown): {
  readonly message: string;
  readonly sessionId?: string;
} {
  assertNoAuthorizationInjection(value);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  const input = value as Record<string, unknown>;
  if (typeof input.message !== 'string' || input.message.trim().length === 0) {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  if (input.sessionId !== undefined && typeof input.sessionId !== 'string') {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  if (Object.keys(input).some((key) => key !== 'message' && key !== 'sessionId')) {
    throw new AiServiceError('VALIDATION_ERROR', 422);
  }
  return input.sessionId === undefined
    ? { message: input.message.trim() }
    : { message: input.message.trim(), sessionId: input.sessionId };
}
