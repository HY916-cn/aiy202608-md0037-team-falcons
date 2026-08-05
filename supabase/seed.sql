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

insert into public.courseware_items (
  id,
  teacher_id,
  title,
  subject,
  original_filename,
  storage_path,
  mime_type,
  size_bytes,
  status
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '合成演示数学课件',
    '数学',
    '合成演示数学课件.pdf',
    'courseware/30000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001',
    'application/pdf',
    4096,
    'published'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '合成演示语文草稿',
    '语文',
    '合成演示语文草稿.pptx',
    'courseware/30000000-0000-0000-0000-000000000002/60000000-0000-0000-0000-000000000002',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    8192,
    'draft'
  )
on conflict (id) do update set
  teacher_id = excluded.teacher_id,
  title = excluded.title,
  subject = excluded.subject,
  original_filename = excluded.original_filename,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  status = excluded.status;

insert into public.courseware_targets (
  id,
  courseware_id,
  class_id,
  sent_at,
  withdrawn_at
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    now() - interval '1 hour',
    null
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    now() - interval '2 hours',
    now() - interval '30 minutes'
  )
on conflict (id) do update set
  courseware_id = excluded.courseware_id,
  class_id = excluded.class_id,
  sent_at = excluded.sent_at,
  withdrawn_at = excluded.withdrawn_at;

insert into public.courseware_receipts (
  target_id,
  device_id,
  received_at,
  downloaded_at
)
values (
  '61000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011',
  now() - interval '45 minutes',
  now() - interval '40 minutes'
)
on conflict (target_id, device_id) do update set
  received_at = excluded.received_at,
  downloaded_at = excluded.downloaded_at;

insert into public.courseware_returns (
  id,
  class_id,
  teacher_id,
  operator_id,
  title,
  original_filename,
  storage_path,
  mime_type,
  size_bytes
)
values (
  '62000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011',
  '合成课堂回传图片',
  '合成课堂回传图片.png',
  'returns/20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001',
  'image/png',
  2048
)
on conflict (id) do update set
  class_id = excluded.class_id,
  teacher_id = excluded.teacher_id,
  operator_id = excluded.operator_id,
  title = excluded.title,
  original_filename = excluded.original_filename,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  (
    'courseware-private',
    'courseware/30000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/pdf","size":4096,"synthetic":true}'::jsonb
  ),
  (
    'courseware-private',
    'returns/20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/62000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000011',
    '{"mimetype":"image/png","size":2048,"synthetic":true}'::jsonb
  )
on conflict (bucket_id, name) do update set
  owner_id = excluded.owner_id,
  metadata = excluded.metadata;

insert into public.assignments (
  id,
  teacher_id,
  class_id,
  subject,
  title,
  content,
  due_at,
  status,
  published_at
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '数学',
    '合成演示数学作业',
    '完成合成练习册第 1 至 3 题。',
    now() + interval '2 days',
    'published',
    now() - interval '1 hour'
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '数学',
    '合成演示未发布草稿',
    '本内容仅供 RLS 草稿隔离测试。',
    now() + interval '3 days',
    'draft',
    null
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '数学',
    '合成演示二班作业',
    '完成合成练习册第 4 至 6 题。',
    now() + interval '4 days',
    'published',
    now() - interval '2 hours'
  ),
  (
    '70000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '语文',
    '合成演示三班草稿',
    '本内容仅供另一教师草稿隔离测试。',
    now() + interval '5 days',
    'draft',
    null
  )
on conflict (id) do update set
  teacher_id = excluded.teacher_id,
  class_id = excluded.class_id,
  subject = excluded.subject,
  title = excluded.title,
  content = excluded.content,
  due_at = excluded.due_at,
  status = excluded.status,
  published_at = excluded.published_at;

insert into public.assessments (
  id,
  teacher_id,
  class_id,
  subject,
  title,
  status,
  published_at
)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '数学',
    '合成演示数学测验',
    'published',
    now() - interval '1 day'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '数学',
    '合成演示二班成绩草稿',
    'draft',
    null
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '语文',
    '合成演示语文测验',
    'published',
    now() - interval '2 days'
  )
on conflict (id) do nothing;

insert into public.grade_records (
  id,
  assessment_id,
  student_id,
  score,
  comment
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    92,
    '合成演示评语一'
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    88,
    '合成演示评语二'
  ),
  (
    '81000000-0000-0000-0000-000000000003',
    '80000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000009',
    85,
    '未发布合成评语'
  ),
  (
    '81000000-0000-0000-0000-000000000004',
    '80000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000017',
    90,
    '合成演示语文评语'
  )
on conflict (id) do nothing;

insert into public.grade_revisions (
  id,
  grade_id,
  old_score,
  new_score,
  old_comment,
  new_comment,
  reason,
  actor_id
)
values (
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  90,
  92,
  '合成演示原评语',
  '合成演示评语一',
  '合成测试：复核录入结果',
  '30000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

-- Governance seed: fixed slugs & categories used by pgTAP fixtures.
insert into public.student_score_categories (id, school_id, slug, display_name, description, kind, default_delta)
values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'homework', '作业表现', '合成演示学生分类目：作业', 'positive', 5),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'discipline', '课堂纪律', '合成演示学生分类目：纪律', 'negative', -2),
  ('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'volunteer', '志愿服务', '合成演示学生分类目：志愿', 'positive', 3)
on conflict (school_id, slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  kind = excluded.kind,
  default_delta = excluded.default_delta;

insert into public.class_score_categories (id, school_id, slug, display_name, description)
values
  ('91000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'cleanliness', '清洁评比', '合成演示班级分类目：清洁'),
  ('91000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'attendance', '到勤情况', '合成演示班级分类目：出勤')
on conflict (school_id, slug) do update set
  display_name = excluded.display_name,
  description = excluded.description;

insert into public.fine_rules (id, school_id, slug, display_name, default_amount, description)
values
  ('92000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'library_late', '图书归还超期', 5, '合成演示罚款：图书超期'),
  ('92000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'lost_property', '物品遗失', 20, '合成演示罚款：物品遗失')
on conflict (school_id, slug) do update set
  display_name = excluded.display_name,
  default_amount = excluded.default_amount,
  description = excluded.description;
