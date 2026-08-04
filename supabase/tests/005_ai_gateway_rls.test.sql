begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public', 'ai_sessions', '存在 AI 会话表');
select has_table('public', 'ai_action_drafts', '存在 AI 写操作草稿表');
select has_function('public', 'create_ai_session', array[]::text[], '存在受控会话创建函数');

insert into public.ai_action_drafts (
  id, user_id, action_type, role, permission_scope, parameters,
  targets, impact, is_dangerous, status, expires_at
) values
  (
    '90000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'assignment_publish', 'teacher',
    'school:10000000-0000-0000-0000-000000000001',
    '{"assignmentId":"70000000-0000-0000-0000-000000000001"}',
    '["演示一班"]', '["发布后班级与家庭可见"]', true, 'pending', now() + interval '5 minutes'
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'assessment_publish', 'teacher',
    'school:10000000-0000-0000-0000-000000000001',
    '{"assessmentId":"80000000-0000-0000-0000-000000000001"}',
    '["演示一班"]', '["发布后家庭可见"]', true, 'pending', now() + interval '5 minutes'
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'assignment_publish', 'teacher',
    'school:10000000-0000-0000-0000-000000000001',
    '{"assignmentId":"70000000-0000-0000-0000-000000000001"}',
    '[]', '[]', true, 'pending', now() - interval '1 minute'
  ),
  (
    '90000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000002',
    'assignment_publish', 'teacher',
    'school:10000000-0000-0000-0000-000000000001',
    '{"assignmentId":"70000000-0000-0000-0000-000000000004"}',
    '[]', '[]', true, 'pending', now() + interval '5 minutes'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$insert into public.ai_sessions (user_id) values (auth.uid())$$,
  '42501',
  'permission denied for table ai_sessions',
  '客户端不能直接创建会话或指定 user_id'
);

select lives_ok(
  $$select public.create_ai_session()$$,
  '登录用户可通过受控函数创建会话'
);
select is(
  (select count(*) from public.ai_sessions),
  1::bigint,
  '用户只能看到自己的会话'
);
select is(
  (select user_id from public.ai_sessions limit 1),
  auth.uid(),
  '会话 user_id 来自 auth.uid()'
);

select lives_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish',
    '{"assignmentId":"70000000-0000-0000-0000-000000000001"}',
    '["演示一班"]',
    '["发布后班级与家庭可见"]'
  )$$,
  '教师可创建受控写操作草稿'
);
select is(
  (select role from public.ai_action_drafts order by created_at desc limit 1),
  'teacher'::public.app_role,
  '草稿角色由服务端角色授权派生'
);
select is(
  (select permission_scope from public.ai_action_drafts order by created_at desc limit 1),
  'school:10000000-0000-0000-0000-000000000001',
  '草稿权限范围由服务端授权派生'
);
select ok(
  (select is_dangerous from public.ai_action_drafts order by created_at desc limit 1),
  '发布草稿由服务端标记为危险操作'
);

select throws_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish',
    '{"nested":{"actorId":"forged"}}',
    '[]', '[]'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  '递归拒绝 actor 注入'
);
select throws_ok(
  $$insert into public.ai_action_drafts (
    user_id, action_type, role, permission_scope, parameters,
    targets, impact, is_dangerous, expires_at
  ) values (
    auth.uid(), 'assignment_publish', 'teacher', 'forged', '{}',
    '[]', '[]', false, now() + interval '5 minutes'
  )$$,
  '42501', 'permission denied for table ai_action_drafts',
  '客户端不能直接写草稿绕过服务端范围派生'
);

select throws_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000004', true
  )$$,
  'P0001', 'FORBIDDEN',
  '用户不能确认其他用户的草稿'
);
select throws_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', false
  )$$,
  'P0001', 'SECOND_CONFIRMATION_REQUIRED',
  '危险操作未二次确认时拒绝执行'
);
select lives_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', true
  )$$,
  '危险操作二次确认后可原子领取'
);
select is(
  (select status from public.ai_action_drafts where id = '90000000-0000-0000-0000-000000000001'),
  'executing'::public.ai_action_draft_status,
  '领取后草稿进入 executing 防止并发重放'
);
select throws_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', true
  )$$,
  'P0001', 'DRAFT_ALREADY_USED',
  '重复确认已领取草稿失败'
);
select lives_ok(
  $$select public.finish_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', true
  )$$,
  '普通业务接口成功后可完成草稿'
);
select is(
  (select status from public.ai_action_drafts where id = '90000000-0000-0000-0000-000000000001'),
  'completed'::public.ai_action_draft_status,
  '完成后草稿不可重放'
);
select lives_ok(
  $$select public.cancel_ai_action_draft(
    '90000000-0000-0000-0000-000000000002'
  )$$,
  '用户可取消自己的待确认草稿'
);
select is(
  (select status from public.ai_action_drafts where id = '90000000-0000-0000-0000-000000000002'),
  'cancelled'::public.ai_action_draft_status,
  '取消后草稿状态不可执行'
);
select throws_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000002', true
  )$$,
  'P0001', 'DRAFT_ALREADY_USED',
  '取消后的草稿重放失败'
);
select throws_ok(
  $$select public.claim_ai_action_draft(
    '90000000-0000-0000-0000-000000000003', true
  )$$,
  'P0001', 'DRAFT_EXPIRED',
  '过期草稿禁止执行'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.ai_sessions),
  0::bigint,
  '家庭用户不能读取其他用户会话'
);
select is(
  (select count(*) from public.ai_action_drafts),
  0::bigint,
  '家庭用户不能读取其他用户草稿'
);
select throws_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish', '{}', '[]', '[]'
  )$$,
  'P0001', 'FORBIDDEN',
  '没有教师授权的家庭用户不能提出发布草稿'
);

select * from finish();
rollback;
