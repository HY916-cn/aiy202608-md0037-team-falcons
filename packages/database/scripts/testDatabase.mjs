import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { testAtomicAiLimits } from './testDatabaseConcurrency.mjs';

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

function capture(args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(' ')} exited with ${result.status}`);
  }

  return result.stdout;
}

async function verifySeededAuthBoundary() {
  const status = JSON.parse(capture(['status', '-o', 'json']));
  const apiUrl = status.API_URL;
  const apiKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  if (typeof apiUrl !== 'string' || typeof apiKey !== 'string') {
    throw new Error('local Supabase auth endpoint is unavailable');
  }

  const headers = {
    apikey: apiKey,
    'Content-Type': 'application/json',
  };
  const login = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({
      email: 'demo_teacher_01@dolphincloud.local',
      password: 'DolphinDemoOnly!2026',
    }),
    headers,
    method: 'POST',
  });
  if (login.status !== 200) {
    throw new Error(`seeded local login failed with status ${login.status}`);
  }
  const loginPayload = await login.json();
  if (
    typeof loginPayload.access_token !== 'string' ||
    loginPayload.user?.email !== 'demo_teacher_01@dolphincloud.local'
  ) {
    throw new Error('seeded local login returned an invalid session');
  }

  const signup = await fetch(`${apiUrl}/auth/v1/signup`, {
    body: JSON.stringify({
      email: `blocked-signup-${Date.now()}@dolphincloud.local`,
      password: 'SyntheticSignupOnly!2026',
    }),
    headers,
    method: 'POST',
  });
  const signupPayload = await signup.json();
  if (signup.status !== 422 || signupPayload.error_code !== 'signup_disabled') {
    throw new Error(`public signup was not denied (status ${signup.status})`);
  }

  console.log(
    'Local auth boundary passed: seeded login=200 public signup=422 denied.',
  );
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
  await verifySeededAuthBoundary();
  await testAtomicAiLimits();
  run(['test', 'db', '--local']);
} finally {
  if (shouldStop) {
    run(['stop'], { allowFailure: true });
  }
}
