import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve('supabase/functions/ai-gateway/index.ts');
const before = await readFile(bundlePath, 'utf8');

await import('./build-edge.mjs');

const after = await readFile(bundlePath, 'utf8');
if (before !== after) {
  throw new Error(
    'Edge bundle was stale and has been regenerated. Commit the updated bundle, then rerun verification.',
  );
}

console.log('Edge bundle matches its source.');
