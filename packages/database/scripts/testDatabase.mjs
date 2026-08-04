import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(
  new URL('../node_modules/supabase/dist/supabase.js', import.meta.url),
);
const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const excludedServices = [
  'studio',
  'imgproxy',
  'mailpit',
  'logflare',
  'vector',
  'supavisor',
].join(',');

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error(`supabase ${args.join(' ')} exited with ${result.status}`);
  }

  return result.status ?? 1;
}

async function smokeEdgeRuntime() {
  const endpoint = 'http://127.0.0.1:54321/functions/v1/ai-gateway';
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const options = await fetch(endpoint, { method: 'OPTIONS' });
      const post = await fetch(endpoint, {
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (options.status !== 204 || post.status !== 401) {
        throw new Error(
          `unexpected Edge status OPTIONS=${options.status} POST=${post.status}`,
        );
      }
      console.log('Edge runtime smoke passed: OPTIONS=204 POST=401.');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

let shouldStop = false;

try {
  run(['start', '--exclude', excludedServices]);
  shouldStop = true;
  await smokeEdgeRuntime();
  run(['db', 'reset', '--local']);
  run(['test', 'db', '--local']);
} finally {
  if (shouldStop) {
    run(['stop'], { allowFailure: true });
  }
}
