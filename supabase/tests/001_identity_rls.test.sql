begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

insert into public.schools (id, name)
values ('10000000-0000-0000-0000-000000000099', 'RLS 隔离测试学校');

insert into public.classes (id, school_id, grade, name)
values (
  '20000000-0000-0000-0000-000000000099',
  '10000000-0000-0000-0000-000000000099',
  '九年级',
  '隔离测试班'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.profiles where id = auth.uid()),
  1::bigint,
  '教师可以读取自己的 profile'
);
select is(
  (select count(*) from public.profiles where id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  '教师不能读取其他教师的 profile'
);
select is(
  (select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  '教师可以读取所属学校'
);
select is(
  (select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000099'),
  0::bigint,
  '教师不能读取其他学校'
);
select is(
  (select count(*) from public.classes),
  2::bigint,
  '教师只能读取授课的两个班级'
);
select is(
  (select count(*) from public.classes where id = '20000000-0000-0000-0000-000000000003'),
  0::bigint,
  '教师不能读取未授课班级'
);
select is(
  (select count(*) from public.students),
  16::bigint,
  '教师可以读取授课班级的合成学生'
);
select is(
  (select count(*) from public.students where id = '50000000-0000-0000-0000-000000000017'),
  0::bigint,
  '教师不能读取未授课班级学生'
);
select is(
  (select count(*) from public.role_assignments where user_id = auth.uid()),
  1::bigint,
  '教师可以读取自己的角色范围'
);
select is(
  (select count(*) from public.role_assignments where user_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  '教师不能读取其他用户的角色范围'
);
select is(
  (select count(*) from public.teacher_class_assignments),
  2::bigint,
  '教师可以读取自己的授课关系'
);
select is(
  (select count(*) from public.teacher_class_assignments where teacher_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  '教师不能读取其他教师的授课关系'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.classes),
  1::bigint,
  '班级端只能读取绑定班级'
);
select is(
  (select count(*) from public.classes where id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  '班级端不能读取无关班级'
);
select is(
  (select count(*) from public.class_device_bindings where device_id = auth.uid()),
  1::bigint,
  '班级端可以读取自己的设备绑定'
);
select is(
  (select count(*) from public.class_device_bindings where device_id = '30000000-0000-0000-0000-000000000012'),
  0::bigint,
  '班级端不能读取其他设备绑定'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.households),
  1::bigint,
  '家庭端可以读取绑定家庭'
);
select is(
  (select count(*) from public.households where id = '40000000-0000-0000-0000-000000000002'),
  0::bigint,
  '家庭端不能读取其他家庭'
);
select is(
  (select count(*) from public.household_students),
  1::bigint,
  '家庭端可以读取绑定学生关系'
);
select is(
  (select count(*) from public.household_students where student_id = '50000000-0000-0000-0000-000000000009'),
  0::bigint,
  '家庭端不能读取其他家庭学生关系'
);
select is(
  (select count(*) from public.household_members),
  1::bigint,
  '家庭端可以读取自己的家庭成员关系'
);
select is(
  (select count(*) from public.household_members where household_id = '40000000-0000-0000-0000-000000000002'),
  0::bigint,
  '家庭端不能读取其他家庭成员关系'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select count(*) from public.schools),
  1::bigint,
  '银行端可以读取授权学校'
);
select is(
  (select count(*) from public.students),
  0::bigint,
  '银行端不能通过身份基线读取学生档案'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (select count(*) from public.classes),
  3::bigint,
  '自治会端可以读取授权学校班级'
);
select is(
  (select count(*) from public.students),
  0::bigint,
  '自治会端不能读取个人学生档案'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (select count(*) from public.profiles),
  10::bigint,
  '管理端可以读取本校用户 profile'
);
select is(
  (select count(*) from public.students),
  24::bigint,
  '管理端可以读取本校合成学生'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '30000000-0000-0000-0000-000000000021',
    'role', 'admin'
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.classes where id = '20000000-0000-0000-0000-000000000003'),
  0::bigint,
  '伪造 JWT role 不能让家庭端读取未绑定班级'
);
select is(
  (select count(*) from public.schools where id = '10000000-0000-0000-0000-000000000099'),
  0::bigint,
  '伪造 JWT role 不能跨学校读取'
);

select throws_ok(
  $$
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (
      '30000000-0000-0000-0000-000000000021',
      'admin',
      'school',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'permission denied for table role_assignments',
  '家庭端不能通过伪造 actor 写入管理员角色'
);

reset role;
select throws_ok(
  $$
    insert into public.role_assignments (user_id, role, scope_type, scope_id)
    values (
      '30000000-0000-0000-0000-000000000011',
      'class_terminal',
      'school',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  'CLASS_TERMINAL_SCOPE_MUST_BE_CLASS',
  '数据库拒绝不合法的班级端范围'
);

select * from finish();
rollback;
