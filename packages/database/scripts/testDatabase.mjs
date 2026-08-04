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

let shouldStop = false;

try {
  run(['start', '--exclude', excludedServices]);
  shouldStop = true;
  run(['db', 'reset', '--local']);
  run(['test', 'db', '--local']);
} finally {
  if (shouldStop) {
    run(['stop'], { allowFailure: true });
  }
}
