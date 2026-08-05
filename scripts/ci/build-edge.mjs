import { build } from 'esbuild';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

await build({
  alias: {
    '@dolphincloud/ai-service': resolve('packages/ai-service/src/index.ts'),
    '@dolphincloud/api-client': resolve('packages/api-client/src/index.ts'),
    '@dolphincloud/auth': resolve('packages/auth/src/index.ts'),
    '@dolphincloud/domain': resolve('packages/domain/src/index.ts'),
    '@dolphincloud/experience': resolve('packages/experience/src/index.ts'),
    '@dolphincloud/validation': resolve('packages/validation/src/index.ts'),
  },
  bundle: true,
  entryPoints: ['supabase/functions-src/ai-gateway.ts'],
  external: ['@supabase/supabase-js'],
  format: 'esm',
  legalComments: 'none',
  outfile: 'supabase/functions/ai-gateway/index.ts',
  platform: 'neutral',
  target: 'es2022',
});

const bundlePath = 'supabase/functions/ai-gateway/index.ts';
const bundle = (await readFile(bundlePath, 'utf8')).replaceAll(
  'from "@supabase/supabase-js"',
  'from "npm:@supabase/supabase-js@2.110.8"',
);
if (bundle.includes('@dolphincloud/') || bundle.includes('../../packages/')) {
  throw new Error('Edge bundle contains a workspace source import');
}
if (bundle.includes('from "@supabase/supabase-js"')) {
  throw new Error('Edge bundle contains a Deno-incompatible bare npm import');
}
await writeFile(bundlePath, bundle.replace(/[\t ]+$/gm, ''), 'utf8');
