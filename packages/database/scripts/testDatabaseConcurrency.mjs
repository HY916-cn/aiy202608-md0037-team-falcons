import pg from 'pg';

const { Client } = pg;
const CONNECTION_STRING =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const USER_ID = '30000000-0000-0000-0000-000000000001';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function authenticatedClient() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, true)",
    [USER_ID],
  );
  return client;
}

async function expectBlocked(promise, label) {
  const outcome = await Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise((resolve) => setTimeout(() => resolve('blocked'), 150)),
  ]);
  assert(outcome === 'blocked', `${label} did not wait for the per-user lock`);
}

async function expectDatabaseError(promise, expectedMessage) {
  try {
    await promise;
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      `expected ${expectedMessage}, received ${String(error)}`,
    );
    return;
  }
  throw new Error(`expected ${expectedMessage}, but the query succeeded`);
}

async function withTwoAuthenticatedConnections(run) {
  const first = await authenticatedClient();
  const second = await authenticatedClient();
  const backendIds = await Promise.all([
    first.query('select pg_backend_pid() as id'),
    second.query('select pg_backend_pid() as id'),
  ]);
  assert(
    backendIds[0].rows[0].id !== backendIds[1].rows[0].id,
    'concurrency test requires two independent database connections',
  );
  try {
    await run(first, second);
  } finally {
    await Promise.allSettled([
      first.query('rollback'),
      second.query('rollback'),
    ]);
    await Promise.allSettled([first.end(), second.end()]);
  }
}

export async function testAtomicAiLimits() {
  const root = new Client({ connectionString: CONNECTION_STRING });
  await root.connect();
  const assignment = await root.query(
    `select id from public.role_assignments
     where user_id = $1 and role = 'teacher'
     order by created_at limit 1`,
    [USER_ID],
  );
  const roleAssignmentId = assignment.rows[0]?.id;
  assert(typeof roleAssignmentId === 'string', 'teacher role assignment missing');

  try {
    await root.query('delete from public.ai_sessions where user_id = $1', [USER_ID]);
    await root.query(
      `insert into public.ai_sessions (user_id, role_assignment_id)
       select $1, $2 from generate_series(1, 9)`,
      [USER_ID, roleAssignmentId],
    );

    await withTwoAuthenticatedConnections(async (first, second) => {
      await first.query('select public.create_ai_session($1)', [roleAssignmentId]);
      const competing = second.query('select public.create_ai_session($1)', [
        roleAssignmentId,
      ]);
      await expectBlocked(competing, 'session limit competitor');
      await first.query('commit');
      await expectDatabaseError(competing, 'SESSION_LIMIT');
    });
    const sessionCount = await root.query(
      `select count(*)::integer as count from public.ai_sessions
       where user_id = $1 and status = 'active'`,
      [USER_ID],
    );
    assert(sessionCount.rows[0].count === 10, 'active session cap was exceeded');

    await root.query('delete from public.ai_sessions where user_id = $1', [USER_ID]);
    const session = await root.query(
      `insert into public.ai_sessions (user_id, role_assignment_id)
       values ($1, $2) returning id`,
      [USER_ID, roleAssignmentId],
    );
    const sessionId = session.rows[0].id;
    await root.query(
      `insert into public.ai_request_events
       (id, session_id, user_id, lease_until)
       values ('93000000-0000-0000-0000-000000000001', $1, $2, now() + interval '30 seconds')`,
      [sessionId, USER_ID],
    );

    await withTwoAuthenticatedConnections(async (first, second) => {
      await first.query(
        `select public.begin_ai_request(
          $1, $2, '93000000-0000-0000-0000-000000000002', 20
        )`,
        [sessionId, roleAssignmentId],
      );
      const competing = second.query(
        `select public.begin_ai_request(
          $1, $2, '93000000-0000-0000-0000-000000000003', 20
        )`,
        [sessionId, roleAssignmentId],
      );
      await expectBlocked(competing, 'concurrency limit competitor');
      await first.query('commit');
      await expectDatabaseError(competing, 'CONCURRENCY_LIMIT');
    });
    const concurrencyCount = await root.query(
      `select count(*)::integer as count from public.ai_request_events
       where user_id = $1 and completed_at is null and lease_until > now()`,
      [USER_ID],
    );
    assert(
      concurrencyCount.rows[0].count === 2,
      'concurrent request cap was exceeded',
    );

    await root.query('delete from public.ai_request_events where user_id = $1', [USER_ID]);
    await root.query(
      `insert into public.ai_request_events
       (id, session_id, user_id, lease_until, completed_at, created_at)
       select gen_random_uuid(), $1, $2, now(), now(), now()
       from generate_series(1, 19)`,
      [sessionId, USER_ID],
    );

    await withTwoAuthenticatedConnections(async (first, second) => {
      await first.query(
        `select public.begin_ai_request(
          $1, $2, '93000000-0000-0000-0000-000000000004', 20
        )`,
        [sessionId, roleAssignmentId],
      );
      const competing = second.query(
        `select public.begin_ai_request(
          $1, $2, '93000000-0000-0000-0000-000000000005', 20
        )`,
        [sessionId, roleAssignmentId],
      );
      await expectBlocked(competing, 'rate limit competitor');
      await first.query('commit');
      await expectDatabaseError(competing, 'RATE_LIMITED');
    });
    const frequencyCount = await root.query(
      `select count(*)::integer as count from public.ai_request_events
       where user_id = $1 and created_at > now() - interval '1 minute'`,
      [USER_ID],
    );
    assert(frequencyCount.rows[0].count === 20, 'request rate cap was exceeded');
  } finally {
    await root.query('delete from public.ai_sessions where user_id = $1', [USER_ID]);
    await root.end();
  }

  console.log(
    'Atomic AI limits passed with two independent database connections: sessions, concurrency, and rate.',
  );
}
