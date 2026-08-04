-- Governance operations, idempotency, audit + advisory-lock semantics.
begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

-- 1. Reserve returns "fresh" for a brand-new key.
select is(
  (select r.is_replay from public._governance_reserve_operation(
    'idem-op-test-fresh-0001',
    'student_score_apply',
    jsonb_build_object('a', 1, 'b', 2)
  ) as r),
  false,
  '幂等预留 - 全新 key 返回非重放'
);
select is(
  (select r.is_pending from public._governance_reserve_operation(
    'idem-op-test-fresh-0001b',
    'student_score_apply',
    jsonb_build_object('a', 1)
  ) as r),
  false,
  '幂等预留 - 全新 key 返回非 pending'
);

-- 2. Fingerprint stability: same payload with different key order -> same hash.
select is(
  encode(public._governance_fingerprint('student_score_apply', jsonb_build_object('a', 1, 'b', 2)), 'hex'),
  encode(public._governance_fingerprint('student_score_apply', jsonb_build_object('b', 2, 'a', 1)), 'hex'),
  '指纹计算对键顺序不敏感'
);
select isnt(
  encode(public._governance_fingerprint('student_score_apply', jsonb_build_object('a', 1)), 'hex'),
  encode(public._governance_fingerprint('student_score_apply', jsonb_build_object('a', 2)), 'hex'),
  '指纹计算对值敏感'
);
select isnt(
  encode(public._governance_fingerprint('student_score_apply', jsonb_build_object('a', 1)), 'hex'),
  encode(public._governance_fingerprint('class_score_apply', jsonb_build_object('a', 1)), 'hex'),
  '指纹计算区分不同 kind'
);

-- 3. Canonicalize object keys are ordered.
select is(
  public._governance_canonicalize_jsonb(jsonb_build_object('z', 1, 'a', 2, 'm', 3))::text,
  '{"a": 2, "m": 3, "z": 1}',
  'jsonb 规范化 - 键按字典序排序'
);

-- 4. Advisory lock is non-blocking (true, then true again within same tx via reentrant lock).
select is(public._governance_try_lock_key('idem-op-test-lock-0001'), true, '同一事务内相同 key 可重入');

-- 5. Apply a real student score, then replay: same operation returned, no duplicate insert.
select is(
  (select entry_delta.delta from public.apply_student_score(
    'idem-student-score-0001',
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    5,
    '首次录入'
  ) as entry_delta),
  5::numeric(9, 2),
  '学生分 RPC 首次调用成功'
);
select is(
  (select count(*) from public.operations where idempotency_key = 'idem-student-score-0001'),
  1::bigint,
  '首次调用后 operations 只有一条'
);
select is(
  (select count(*) from public.student_score_entries where reason = '首次录入'),
  1::bigint,
  '首次调用后 student_score_entries 只有一条'
);
select is(
  (select entry_delta.delta from public.apply_student_score(
    'idem-student-score-0001',
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    5,
    '首次录入'
  ) as entry_delta),
  5::numeric(9, 2),
  '相同 key + payload 幂等重放返回原结果'
);
select is(
  (select count(*) from public.operations where idempotency_key = 'idem-student-score-0001'),
  1::bigint,
  '幂等重放不产生新 operations'
);
select is(
  (select count(*) from public.student_score_entries where reason = '首次录入'),
  1::bigint,
  '幂等重放不产生新 entries'
);

-- 6. Fingerprint mismatch -> conflict.
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-student-score-0001',
      '50000000-0000-0000-0000-000000000002',
      '90000000-0000-0000-0000-000000000001',
      7,
      '不同 payload'
    )
  $$,
  'P0001',
  'IDEMPOTENCY_FINGERPRINT_MISMATCH',
  '同 key 不同 payload 触发指纹冲突'
);

-- 7. Idempotency key length validation.
select throws_ok(
  $$
    select public.apply_student_score(
      'short',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      5,
      '不通过'
    )
  $$,
  'P0001',
  'INVALID_IDEMPOTENCY_KEY',
  '过短的 idempotency key 会被拒绝'
);

-- 8. Invalid delta.
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-invalid-delta-0001',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      0,
      'delta 不能为 0'
    )
  $$,
  'P0001',
  'INVALID_DELTA',
  'delta 为 0 触发校验错误'
);

-- 9. Invalid reason.
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-invalid-reason-0001',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      3,
      ''
    )
  $$,
  'P0001',
  'INVALID_REASON',
  '空理由触发校验错误'
);

-- 10. Category out of school rejected.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-unknown-cat-0001',
      '50000000-0000-0000-0000-000000000001',
      '99999999-9999-9999-9999-999999999999',
      3,
      '未知类目'
    )
  $$,
  'P0001',
  'CATEGORY_NOT_FOUND',
  '未知类目触发 CATEGORY_NOT_FOUND'
);

-- 11. Forbidden actor (family cannot apply student score).
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-family-forbidden-0001',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      3,
      '家庭不能加分'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '家庭端不能应用学生分'
);

-- 12. class_terminal cannot apply student score.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$
    select public.apply_student_score(
      'idem-terminal-forbidden-0001',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      3,
      '班级端不能加分'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '班级端不能应用学生分'
);

-- 13. Direct DML on operations denied.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    insert into public.operations (
      kind, actor_id, actor_role, scope_type, scope_id, school_id,
      target_type, target_id, idempotency_key, fingerprint, payload
    )
    values (
      'student_score_apply', auth.uid(), 'teacher', 'school',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'student', '50000000-0000-0000-0000-000000000001',
      'idem-direct-op-0001', decode('00', 'hex'), '{}'::jsonb
    )
  $$,
  '42501',
  'permission denied for table operations',
  '直接写 operations 表被拒绝'
);

-- 14. Direct DML on idempotency_keys denied.
select throws_ok(
  $$
    insert into public.idempotency_keys (key, fingerprint)
    values ('direct-key-0001', decode('00', 'hex'))
  $$,
  '42501',
  'permission denied for table idempotency_keys',
  '直接写 idempotency_keys 被拒绝'
);

-- 15. Direct DML on audit_events denied.
select throws_ok(
  $$
    insert into public.audit_events (
      actor_id, actor_role, school_id, action, target_type, target_id, result
    )
    values (
      auth.uid(), 'teacher', '10000000-0000-0000-0000-000000000001',
      'direct.write', 'student', '50000000-0000-0000-0000-000000000001', 'success'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  '直接写 audit_events 被拒绝'
);

-- 16. audit_events readable only by admin.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.audit_events),
  0::bigint,
  '教师不能读 audit_events'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select count(*) from public.audit_events),
  0::bigint,
  '银行操作员不能读 audit_events'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (select count(*) from public.audit_events),
  0::bigint,
  '自治会不能读 audit_events'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select ok(
  (select count(*) from public.audit_events) >= 1,
  '管理员可读 audit_events 且至少含一条'
);

-- 17. operations readable by actor.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok(
  (select count(*) from public.operations where actor_id = auth.uid()) >= 1,
  '教师可读取自己的 operations'
);

-- 18. operations not readable by unrelated bank_operator.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select count(*) from public.operations where actor_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  '银行操作员不能读其他人 operations'
);

-- 19. admin can read all school operations.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select ok(
  (select count(*) from public.operations) >= 1,
  '管理员可读本校所有 operations'
);

select * from finish();
rollback;
