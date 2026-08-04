import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKIPPED_DIRECTORIES = new Set([
  '.expo',
  'dist',
  'node_modules',
  'web-build',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (SKIPPED_DIRECTORIES.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|json)$/.test(name) ? [path] : [];
  });
}

describe('客户端密钥边界', () => {
  it('客户端源码不包含服务端 Coze 或 service-role 环境变量', () => {
    const roots = [
      join(process.cwd(), 'apps', 'client'),
      join(process.cwd(), 'packages', 'api-client'),
    ];
    const forbidden = [
      'COZE_API_TOKEN',
      'COZE_BOT_ID',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_JWT_SECRET',
      'AI_CONTEXT_SIGNING_SECRET',
    ];

    for (const path of roots.flatMap(sourceFiles)) {
      const source = readFileSync(path, 'utf8');
      for (const variableName of forbidden) {
        expect(source, `${path} contains ${variableName}`).not.toContain(
          variableName,
        );
      }
    }
  });
});
