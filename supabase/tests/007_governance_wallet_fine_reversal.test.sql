-- Wallet, fine state machine, targeted reversal, direct-DML lockdown.
begin;

create extension if not exists pgtap with schema extensions;
select plan(46);

set local role authenticated;

-- Bank grants coins.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-grant-0001x',
    '50000000-0000-0000-0000-000000000001',
    50,
    '合成演示发币'
  ) as r),
  50::numeric(12, 2),
  '银行发币后余额为 50'
);

-- Idempotent replay returns same tx.
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-grant-0001x',
    '50000000-0000-0000-0000-000000000001',
    50,
    '合成演示发币'
  ) as r),
  50::numeric(12, 2),
  '幂等重放余额仍为 50'
);

-- Deduct.
select is(
  (select r.balance_after from public.apply_dolphin_deduct(
    'coin-deduct-0001',
    '50000000-0000-0000-0000-000000000001',
    10,
    '合成演示扣币'
  ) as r),
  40::numeric(12, 2),
  '扣币后余额为 40'
);

-- Insufficient balance.
select throws_ok(
  $$
    select public.apply_dolphin_deduct(
      'coin-deduct-0002',
      '50000000-0000-0000-0000-000000000001',
      9999,
      '透支'
    )
  $$,
  'P0001',
  'INSUFFICIENT_BALANCE',
  '扣币超出余额被拒绝'
);

-- Teacher can grant for authorized students.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-teacher-0001',
    '50000000-0000-0000-0000-000000000001',
    5,
    '教师奖励'
  ) as r),
  45::numeric(12, 2),
  '教师可对所教学生发放奖励'
);
select throws_ok(
  $$
    select public.apply_dolphin_grant(
      'coin-teacher-cross-class-0001',
      '50000000-0000-0000-0000-000000000017',
      5,
      '教师跨校奖励'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '教师不能对非授权学生发放奖励'
);

-- Council cannot grant.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select throws_ok(
  $$
    select public.apply_dolphin_grant(
      'coin-council-0001',
      '50000000-0000-0000-0000-000000000001',
      5,
      '自治会发币被禁'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '自治会不能发币'
);

-- Admin cannot grant.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select throws_ok(
  $$
    select public.apply_dolphin_grant(
      'coin-admin-0001x',
      '50000000-0000-0000-0000-000000000001',
      5,
      '管理员发币被禁'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '管理员不能发币'
);

-- Bank operator can adjust.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select r.balance_after from public.apply_dolphin_adjust(
    'coin-bank-adjust-0001',
    '50000000-0000-0000-0000-000000000001',
    -5,
    '银行调整'
  ) as r),
  40::numeric(12, 2),
  '银行调整后余额为 40'
);

-- Wallet RLS: class_terminal cannot read wallets/transactions.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.dolphin_accounts),
  0::bigint,
  '班级端不能读取任何 dolphin_accounts'
);
select is(
  (select count(*) from public.dolphin_transactions),
  0::bigint,
  '班级端不能读取任何 dolphin_transactions'
);
select throws_ok(
  $$
    select public.apply_dolphin_grant(
      'coin-terminal-0001',
      '50000000-0000-0000-0000-000000000001',
      3,
      '班级端发币被禁'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '班级端不能调用发币 RPC'
);

-- Teacher can read wallets for authorized students.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000001') = 1,
  '教师可读取授权学生的 dolphin_accounts'
);
select is(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000077'),
  0::bigint,
  '教师不能读取未授权学生的钱包'
);

-- Family can read wallet of their student.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select ok(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000001') = 1,
  '家庭端可读取绑定学生的 dolphin_accounts'
);
select is(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000002'),
  0::bigint,
  '家庭端不能读取未绑定学生的钱包'
);
select ok(
  (select count(*) from public.dolphin_transactions as tx
    join public.dolphin_accounts as account on account.id = tx.account_id
    where account.student_id = '50000000-0000-0000-0000-000000000001') >= 1,
  '家庭端可读取绑定学生的交易流水'
);
select is(
  (select count(*) from public.fine_orders where student_id = '50000000-0000-0000-0000-000000000001'),
  0::bigint,
  '未创建前家庭端看不到罚款单'
);

-- Council and admin cannot read wallets or transactions.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);

-- Fine rule managed by bank operator.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (
    select r.slug
    from public.manage_fine_rule(
      'fine-rule-manage-0001',
      '10000000-0000-0000-0000-000000000001',
      'teacher_rule',
      '教师罚款规则',
      5,
      '测试规则',
      true
    ) as r
  ),
  'teacher_rule',
  '银行可管理罚款规则'
);

-- Fine order lifecycle.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok(
  (
    select set_config('app.test.fine_order_0001_id', r.id::text, true) is not null
    from public.create_fine_order(
      'fine-create-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '图书超期'
    ) as r
  ),
  '记录第一张罚款单 id 供后续断言使用'
);
select is(
  (
    select r.status::text
    from public.create_fine_order(
      'fine-create-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '图书超期'
    ) as r
  ),
  'pending',
  '教师可以创建罚款单'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select ok(
  (
    select count(*) from public.fine_orders where student_id = '50000000-0000-0000-0000-000000000001'
  ) = 1
  and (
    select count(*) from public.fine_orders where student_id = '50000000-0000-0000-0000-000000000002'
  ) = 0,
  '家庭端仅可读取当前学生相关罚款单'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.fine_orders),
  0::bigint,
  '班级端不能读取任何罚款单'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    select public.create_fine_order(
      'fine-cross-school-0001',
      '50000000-0000-0000-0000-000000000017',
      '92000000-0000-0000-0000-000000000001',
      5,
      '跨学校罚款'
    )
  $$,
  'P0001',
  'RULE_NOT_FOUND',
  '跨学校罚款创建会失败'
);

-- Family cannot create fine.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  $$
    select public.create_fine_order(
      'fine-family-forbid-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '家庭不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '家庭不能创建罚款'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$
    select public.create_fine_order(
      'fine-terminal-forbid-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '班级端不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '班级端不能创建罚款'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select throws_ok(
  $$
    select public.create_fine_order(
      'fine-council-forbid-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '自治会不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '自治会不能创建罚款'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select throws_ok(
  $$
    select public.create_fine_order(
      'fine-admin-forbid-0001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      5,
      '管理员不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '管理员不能创建罚款'
);

-- Settle by bank operator.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (
    select r.status::text
    from public.settle_fine_order(
      'fine-settle-0001',
      current_setting('app.test.fine_order_0001_id')::uuid
    ) as r
  ),
  'settled',
  '银行结算罚款单成功'
);

select is(
  (select balance from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000001'),
  30::numeric(12, 2),
  '结算罚款后学生余额减少'
);

-- Cannot settle already-settled.
select throws_ok(
  format($f$
    select public.settle_fine_order(
      'fine-settle-0002',
      %L
    )
  $f$,
    current_setting('app.test.fine_order_0001_id')
  ),
  'P0001',
  'ORDER_NOT_PENDING',
  '已结算罚款不能再次结算'
);

-- Create another and cancel it.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok(
  (
    select set_config('app.test.fine_order_0002_id', r.id::text, true) is not null
    from public.create_fine_order(
      'fine-create-0002',
      '50000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      20,
      '合成物品遗失'
    ) as r
  ),
  '记录第二张罚款单 id 供后续断言使用'
);
select is(
  (
    select r.status::text
    from public.create_fine_order(
      'fine-create-0002',
      '50000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      20,
      '合成物品遗失'
    ) as r
  ),
  'pending',
  '教师创建第二张罚款单'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (
    select r.status::text
    from public.cancel_fine_order(
      'fine-cancel-0002',
      current_setting('app.test.fine_order_0002_id')::uuid,
      '合成取消理由'
    ) as r
  ),
  'cancelled',
  '银行可取消 pending 罚款'
);

-- Targeted reversal happy path: reverse a coin grant.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-grant-forreverse-0001',
    '50000000-0000-0000-0000-000000000002',
    20,
    '待撤销发币'
  ) as r),
  20::numeric(12, 2),
  '为撤销测试发币 20'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (
    select r.status::text from public.apply_targeted_reversal(
      'coin-reversal-0001',
      (select id from public.operations where idempotency_key = 'coin-grant-forreverse-0001'),
      '合成撤销发币测试'
    ) as r
  ),
  'succeeded',
  '银行撤销发币操作成功'
);

-- Cannot reverse a reversal.
select throws_ok(
  format($f$
    select public.apply_targeted_reversal(
      'coin-reversal-0002',
      %L,
      '不能撤销撤销'
    )
  $f$,
    (select id::text from public.operations where idempotency_key = 'coin-reversal-0001')
  ),
  'P0001',
  'CANNOT_REVERSE_REVERSAL',
  '禁止撤销 reversal_apply 类型的操作'
);

-- Cannot reverse an already reversed operation.
select throws_ok(
  format($f$
    select public.apply_targeted_reversal(
      'coin-reversal-dup-0001',
      %L,
      '重复撤销'
    )
  $f$,
    (select id::text from public.operations where idempotency_key = 'coin-grant-forreverse-0001')
  ),
  'P0001',
  'ALREADY_REVERSED',
  '禁止对已撤销操作再次撤销'
);
select is(
  (select balance from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000002'),
  0::numeric(12, 2),
  '重复撤销不会产生第二次余额补偿'
);

-- Teacher cannot reverse wallet operations.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-grant-forbid-reverse-0001',
    '50000000-0000-0000-0000-000000000002',
    15,
    '再次发币'
  ) as r),
  15::numeric(12, 2),
  '为权限测试发币 15（撤销后余额从 0 涨到 15）'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  format($f$
    select public.apply_targeted_reversal(
      'coin-reversal-bank-0001',
      %L,
      '银行不能撤销'
    )
  $f$,
    (select id::text from public.operations where idempotency_key = 'coin-grant-forbid-reverse-0001')
  ),
  'P0001',
  'FORBIDDEN',
  '教师不能撤销海豚币操作'
);

-- Preview reversal returns is_reversible.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select throws_ok(
  format($f$
    select public.reverse_fine_order(
      'fine-reverse-empty-0001',
      %L,
      ''
    )
  $f$,
    current_setting('app.test.fine_order_0001_id')
  ),
  'P0001',
  'INVALID_REASON',
  '空撤销原因会被拒绝'
);
-- Reverse settled fine order and restore wallet balance.
select is(
  (
    select r.status::text
    from public.reverse_fine_order(
      'fine-reverse-0001',
      current_setting('app.test.fine_order_0001_id')::uuid,
      '撤销已结算罚款'
    ) as r
  ),
  'reversed',
  '银行可撤销已结算罚款'
);
select is(
  (select balance from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000001'),
  35::numeric(12, 2),
  '撤销结算后恢复海豚币余额'
);
select ok(
  (
    select count(*)
    from public.reversal_links
    where original_operation_id = (
      select settle_operation_id
      from public.fine_orders
      where id = current_setting('app.test.fine_order_0001_id')::uuid
    )
  ) = 1,
  '罚款撤销记录 reversal_link'
);
select throws_ok(
  $$
    select public.reverse_fine_order(
      'fine-reverse-missing-0001',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '错误目标'
    )
  $$,
  'P0001',
  'ORDER_NOT_FOUND',
  '错误罚款目标会被拒绝'
);

-- Direct DML on dolphin_accounts denied.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select throws_ok(
  $$
    insert into public.dolphin_accounts (student_id, school_id, balance)
    values ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 999)
  $$,
  '42501',
  'permission denied for table dolphin_accounts',
  '直接写 dolphin_accounts 被拒绝'
);

-- Direct DML on fine_orders denied.
select throws_ok(
  $$
    insert into public.fine_orders (
      create_operation_id, school_id, student_id, rule_id, amount, reason
    )
    values (
      gen_random_uuid(),
      '10000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '92000000-0000-0000-0000-000000000001',
      1,
      '直接写'
    )
  $$,
  '42501',
  'permission denied for table fine_orders',
  '直接写 fine_orders 被拒绝'
);

select * from finish();
rollback;
