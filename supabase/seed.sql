-- All identities and records in this file are synthetic and local-only.
-- gitleaks:allow the shared credential below is intentionally non-production demo data.
with demo_users (id, email, display_name) as (
  values
    ('30000000-0000-0000-0000-000000000001'::uuid, 'demo_teacher_01@dolphincloud.local', '演示教师一号'),
    ('30000000-0000-0000-0000-000000000002'::uuid, 'demo_teacher_02@dolphincloud.local', '演示教师二号'),
    ('30000000-0000-0000-0000-000000000011'::uuid, 'demo_class_01@dolphincloud.local', '演示班级设备一号'),
    ('30000000-0000-0000-0000-000000000012'::uuid, 'demo_class_02@dolphincloud.local', '演示班级设备二号'),
    ('30000000-0000-0000-0000-000000000021'::uuid, 'demo_family_01@dolphincloud.local', '演示家庭一号'),
    ('30000000-0000-0000-0000-000000000022'::uuid, 'demo_family_02@dolphincloud.local', '演示家庭二号'),
    ('30000000-0000-0000-0000-000000000023'::uuid, 'demo_family_03@dolphincloud.local', '演示家庭三号'),
    ('30000000-0000-0000-0000-000000000031'::uuid, 'demo_bank_01@dolphincloud.local', '演示银行操作员'),
    ('30000000-0000-0000-0000-000000000041'::uuid, 'demo_council_01@dolphincloud.local', '演示自治会成员'),
    ('30000000-0000-0000-0000-000000000051'::uuid, 'demo_admin_01@dolphincloud.local', '演示管理员')
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  demo_user.id,
  'authenticated',
  'authenticated',
  demo_user.email,
  extensions.crypt('DolphinDemoOnly!2026', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'email', 'providers', array['email']),
  jsonb_build_object('display_name', demo_user.display_name, 'synthetic', true),
  now(),
  now(),
  '',
  '',
  '',
  ''
from demo_users as demo_user
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

with demo_users (id, email) as (
  values
    ('30000000-0000-0000-0000-000000000001'::uuid, 'demo_teacher_01@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000002'::uuid, 'demo_teacher_02@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000011'::uuid, 'demo_class_01@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000012'::uuid, 'demo_class_02@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000021'::uuid, 'demo_family_01@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000022'::uuid, 'demo_family_02@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000023'::uuid, 'demo_family_03@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000031'::uuid, 'demo_bank_01@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000041'::uuid, 'demo_council_01@dolphincloud.local'),
    ('30000000-0000-0000-0000-000000000051'::uuid, 'demo_admin_01@dolphincloud.local')
)
insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  demo_user.id,
  demo_user.id::text,
  demo_user.id,
  jsonb_build_object(
    'sub', demo_user.id::text,
    'email', demo_user.email,
    'email_verified', true,
    'synthetic', true
  ),
  'email',
  now(),
  now(),
  now()
from demo_users as demo_user
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data,
  updated_at = excluded.updated_at;

insert into public.schools (id, name)
values ('10000000-0000-0000-0000-000000000001', '海豚云合成演示学校')
on conflict (id) do update set name = excluded.name;

insert into public.classes (id, school_id, grade, name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '七年级', '演示一班'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '七年级', '演示二班'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '八年级', '演示三班')
on conflict (id) do update set
  school_id = excluded.school_id,
  grade = excluded.grade,
  name = excluded.name;

insert into public.profiles (id, display_name)
values
  ('30000000-0000-0000-0000-000000000001', '演示教师一号'),
  ('30000000-0000-0000-0000-000000000002', '演示教师二号'),
  ('30000000-0000-0000-0000-000000000011', '演示班级设备一号'),
  ('30000000-0000-0000-0000-000000000012', '演示班级设备二号'),
  ('30000000-0000-0000-0000-000000000021', '演示家庭一号'),
  ('30000000-0000-0000-0000-000000000022', '演示家庭二号'),
  ('30000000-0000-0000-0000-000000000023', '演示家庭三号'),
  ('30000000-0000-0000-0000-000000000031', '演示银行操作员'),
  ('30000000-0000-0000-0000-000000000041', '演示自治会成员'),
  ('30000000-0000-0000-0000-000000000051', '演示管理员')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.students (id, student_no, class_id, display_name)
select
  ('50000000-0000-0000-0000-' || lpad(student_number::text, 12, '0'))::uuid,
  'DEMO-' || lpad(student_number::text, 3, '0'),
  case
    when student_number <= 8 then '20000000-0000-0000-0000-000000000001'::uuid
    when student_number <= 16 then '20000000-0000-0000-0000-000000000002'::uuid
    else '20000000-0000-0000-0000-000000000003'::uuid
  end,
  '演示学生' || lpad(student_number::text, 2, '0')
from generate_series(1, 24) as student_number
on conflict (id) do update set
  student_no = excluded.student_no,
  class_id = excluded.class_id,
  display_name = excluded.display_name;

insert into public.households (id, name)
values
  ('40000000-0000-0000-0000-000000000001', '演示家庭一号'),
  ('40000000-0000-0000-0000-000000000002', '演示家庭二号'),
  ('40000000-0000-0000-0000-000000000003', '演示家庭三号')
on conflict (id) do update set name = excluded.name;

insert into public.household_members (household_id, user_id, member_type)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000021', 'guardian'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000022', 'guardian'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000023', 'guardian')
on conflict (household_id, user_id) do update set member_type = excluded.member_type;

insert into public.household_students (household_id, student_id)
values
  ('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000009'),
  ('40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000010')
on conflict (household_id, student_id) do nothing;

insert into public.role_assignments (user_id, role, scope_type, scope_id)
values
  ('30000000-0000-0000-0000-000000000001', 'teacher', 'school', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'teacher', 'school', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000011', 'class_terminal', 'class', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000012', 'class_terminal', 'class', '20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000021', 'family', 'household', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000022', 'family', 'household', '40000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000023', 'family', 'household', '40000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000031', 'bank_operator', 'school', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000041', 'council', 'school', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000051', 'admin', 'school', '10000000-0000-0000-0000-000000000001')
on conflict (user_id, role, scope_type, scope_id) do nothing;

insert into public.teacher_class_assignments (teacher_id, class_id, subject)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '数学'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '数学'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '语文')
on conflict (teacher_id, class_id, subject) do nothing;

insert into public.class_device_bindings (device_id, class_id, status)
values
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'active'),
  ('30000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000002', 'active')
on conflict (device_id, class_id) do update set status = excluded.status;
