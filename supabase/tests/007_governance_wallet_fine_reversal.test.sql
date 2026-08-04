-- Wallet, fine state machine, targeted reversal, direct-DML lockdown.
begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

set local role authenticated;

-- Bank grants coins.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select r.balance_after from public.apply_dolphin_grant(
    'coin-grant-0001',
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
    'coin-grant-0001',
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

-- Teacher cannot grant.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    select public.apply_dolphin_grant(
      'coin-teacher-0001',
      '50000000-0000-0000-0000-000000000001',
      5,
      '教师发币被禁'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '教师不能发币'
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

-- Only admin can adjust.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select throws_ok(
  $$
    select public.apply_dolphin_adjust(
      'coin-bank-adjust-0001',
      '50000000-0000-0000-0000-000000000001',
      5,
      '银行不能调整'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '银行不能调整币账'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (select r.balance_after from public.apply_dolphin_adjust(
    'coin-admin-adjust-0001',
    '50000000-0000-0000-0000-000000000001',
    -5,
    '管理员调整'
  ) as r),
  35::numeric(12, 2),
  '管理员调整后余额为 35'
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

-- Teacher cannot read wallets.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.dolphin_accounts),
  0::bigint,
  '教师不能读取 dolphin_accounts'
);

-- Family can read wallet of their student.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select ok(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000001') = 1,
  '家庭端可读取绑定学生的 dolphin_accounts'
);

-- Family cannot read wallet of another student.
select is(
  (select count(*) from public.dolphin_accounts where student_id = '50000000-0000-0000-0000-000000000009'),
  0::bigint,
  '家庭端不能读取未绑定学生的 dolphin_accounts'
);

-- Bank operator can read all wallets in school.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select ok(
  (select count(*) from public.dolphin_accounts) >= 1,
  '银行操作员可读取本校 dolphin_accounts'
);

-- Fine order lifecycle.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
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
  '银行可以创建罚款单'
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

-- Settle by bank operator.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (
    select r.status::text
    from public.settle_fine_order(
      'fine-settle-0001',
      (select id from public.fine_orders where create_operation_id = (select id from public.operations where idempotency_key = 'fine-create-0001'))
    ) as r
  ),
  'settled',
  '银行结算罚款单成功'
);

-- Cannot settle already-settled.
select throws_ok(
  format($f$
    select public.settle_fine_order(
      'fine-settle-0002',
      %L
    )
  $f$,
    (select id::text from public.fine_orders where create_operation_id = (select id from public.operations where idempotency_key = 'fine-create-0001'))
  ),
  'P0001',
  'ORDER_NOT_PENDING',
  '已结算罚款不能再次结算'
);

-- Cannot cancel already-settled.
select throws_ok(
  format($f$
    select public.cancel_fine_order(
      'fine-cancel-0001',
      %L,
      '尝试取消已结算'
    )
  $f$,
    (select id::text from public.fine_orders where create_operation_id = (select id from public.operations where idempotency_key = 'fine-create-0001'))
  ),
  'P0001',
  'ORDER_NOT_PENDING',
  '已结算罚款不能取消'
);

-- Create another and cancel it.
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
  '银行创建第二张罚款单'
);
select is(
  (
    select r.status::text
    from public.cancel_fine_order(
      'fine-cancel-0002',
      (select id from public.fine_orders where create_operation_id = (select id from public.operations where idempotency_key = 'fine-create-0002')),
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
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (
    select r.status::text from public.apply_targeted_reversal(
      'coin-reversal-0001',
      (select id from public.operations where idempotency_key = 'coin-grant-forreverse-0001'),
      '合成撤销发币测试'
    ) as r
  ),
  'succeeded',
  '管理员撤销发币操作成功'
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

-- Only admin can reverse: bank_operator forbidden.
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
  '银行操作员不能进行历史撤销'
);

-- Preview reversal returns is_reversible.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (
    select p.is_reversible from public.preview_reversal(
      (select id from public.operations where idempotency_key = 'coin-grant-forbid-reverse-0001')
    ) as p
  ),
  true,
  '预览未撤销的操作返回 is_reversible=true'
);
select is(
  (
    select p.is_reversible from public.preview_reversal(
      (select id from public.operations where idempotency_key = 'coin-grant-forreverse-0001')
    ) as p
  ),
  false,
  '预览已撤销的操作返回 is_reversible=false'
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
