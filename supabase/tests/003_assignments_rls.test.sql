begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.assignments),
  3::bigint,
  '教师可以读取自己任教班级的草稿和已发布作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  '其他教师只能读取自己的作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  '一班班级端只能读取本班已发布作业'
);
select is(
  (
    select count(*)
    from public.assignments
    where id = '70000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  '班级端不能读取教师草稿'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000012', true);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  '二班班级端只能读取本班已发布作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  '家庭端可以读取绑定学生班级的已发布作业'
);
select is(
  (
    select count(*)
    from public.assignments
    where id = '70000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  '家庭端不能读取未发布草稿'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select is(
  (select count(*) from public.assignments),
  1::bigint,
  '二班绑定家庭只能读取二班已发布作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000023', true);
select is(
  (select count(*) from public.assignments),
  2::bigint,
  '绑定多个合成学生的家庭可以读取对应两个班级作业'
);
select is(
  (
    select count(*)
    from public.assignments
    where class_id = '20000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  '家庭端不能读取未绑定班级作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select count(*) from public.assignments),
  0::bigint,
  '银行端不能读取作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (select count(*) from public.assignments),
  0::bigint,
  '自治会端不能读取作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (select count(*) from public.assignments),
  4::bigint,
  '管理端可以按学校范围审计作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    insert into public.assignments (
      id,
      class_id,
      subject,
      title,
      content,
      due_at
    )
    values (
      '71000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '数学',
      'RLS 作业草稿',
      '合成测试内容',
      now() + interval '1 day'
    )
  $$,
  '教师可以为任教班级创建作业草稿'
);
select throws_ok(
  $$
    insert into public.assignments (
      class_id,
      subject,
      title,
      content,
      due_at
    )
    values (
      '20000000-0000-0000-0000-000000000003',
      '数学',
      '越权班级作业',
      '合成测试内容',
      now() + interval '1 day'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "assignments"',
  '教师不能为未任教班级创建作业'
);
select lives_ok(
  $$
    update public.assignments
    set title = 'RLS 修改后的草稿'
    where id = '70000000-0000-0000-0000-000000000002'
  $$,
  '教师可以编辑自己的作业草稿'
);
update public.assignments
set title = '不应成功的已发布修改'
where id = '70000000-0000-0000-0000-000000000001';
select is(
  (
    select title
    from public.assignments
    where id = '70000000-0000-0000-0000-000000000001'
  ),
  '合成演示数学作业',
  '已发布作业不能通过草稿编辑路径修改'
);
select lives_ok(
  $$
    select public.publish_assignment(
      '70000000-0000-0000-0000-000000000002'
    )
  $$,
  '教师可以发布自己的作业草稿'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$
    select public.publish_assignment(
      '71000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'NOT_FOUND',
  '其他教师不能发布非本人作业草稿'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$
    insert into public.assignments (
      class_id,
      subject,
      title,
      content,
      due_at
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '数学',
      '班级端伪造作业',
      '合成测试内容',
      now() + interval '1 day'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "assignments"',
  '班级端不能创建作业'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  $$
    insert into public.assignments (
      class_id,
      subject,
      title,
      content,
      due_at
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '数学',
      '家庭端伪造作业',
      '合成测试内容',
      now() + interval '1 day'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "assignments"',
  '家庭端不能创建作业'
);

select * from finish();
rollback;
