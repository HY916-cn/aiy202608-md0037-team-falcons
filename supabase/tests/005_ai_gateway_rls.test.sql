begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'ai_sessions', '存在 AI 会话表');
select has_table('public', 'ai_action_drafts', '存在 AI 写操作草稿表');
select has_table('public', 'ai_skill_context_tokens', '存在单用途 Skill token 表');
select has_function('public', 'create_ai_session', array['uuid'], '会话要求 active context');

insert into public.role_assignments (user_id, role, scope_type, scope_id)
values (
  '30000000-0000-0000-0000-000000000001',
  'class_terminal', 'class', '20000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$insert into public.ai_sessions (user_id, role_assignment_id)
    select auth.uid(), id from public.role_assignments where user_id = auth.uid() limit 1$$,
  '42501', 'permission denied for table ai_sessions',
  '客户端不能直接创建会话或指定 user_id'
);

select lives_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments
    where user_id = auth.uid() and role = 'teacher'
  ))$$,
  '登录用户可用选中的 teacher context 创建会话'
);
select is(
  (select role from public.role_assignments where id = (
    select role_assignment_id from public.ai_sessions
    where role_assignment_id = (
      select id from public.role_assignments
      where user_id = auth.uid() and role = 'teacher'
    ) limit 1
  )),
  'teacher'::public.app_role,
  '会话绑定客户端选中且服务端验证的 teacher assignment'
);
select lives_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments
    where user_id = auth.uid() and role = 'class_terminal'
  ))$$,
  '多角色用户可明确选择 class_terminal context'
);
select is(
  (select role from public.role_assignments where id = (
    select role_assignment_id from public.ai_sessions
    where role_assignment_id = (
      select id from public.role_assignments
      where user_id = auth.uid() and role = 'class_terminal'
    ) limit 1
  )),
  'class_terminal'::public.app_role,
  '服务端没有固定取第一条角色记录'
);
select throws_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments
    where user_id = '30000000-0000-0000-0000-000000000002' limit 1
  ))$$,
  'P0001', 'FORBIDDEN', '不能选择其他用户 context'
);

select lives_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish',
    '{"assignmentId":"70000000-0000-0000-0000-000000000002"}',
    (select id from public.role_assignments where user_id = auth.uid() and role = 'teacher')
  )$$,
  '教师可提出发布作业草稿'
);
select is(
  (select targets ->> 0 from public.ai_action_drafts order by created_at desc limit 1),
  '演示一班 · 合成演示未发布草稿',
  '预览目标由服务端真实业务对象派生'
);
select is(
  (select target_version from public.ai_action_drafts order by created_at desc limit 1),
  (select updated_at::text from public.assignments where id = '70000000-0000-0000-0000-000000000002'),
  '草稿保存目标版本'
);
select throws_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish',
    '{"assignmentId":"70000000-0000-0000-0000-000000000002","targets":["伪造目标"]}',
    (select id from public.role_assignments where user_id = auth.uid() and role = 'teacher')
  )$$,
  'P0001', 'VALIDATION_ERROR', '拒绝预览目标或额外参数篡改'
);
select throws_ok(
  $$select public.create_ai_action_draft(
    'assignment_publish',
    '{"assignmentId":"70000000-0000-0000-0000-000000000004"}',
    (select id from public.role_assignments where user_id = auth.uid() and role = 'teacher')
  )$$,
  'P0001', 'FORBIDDEN', '不能为其他教师目标创建草稿'
);
select throws_ok(
  $$insert into public.ai_action_drafts (
    user_id, role_assignment_id, action_type, role, permission_scope,
    parameters, targets, impact, target_type, target_id, target_version, expires_at
  ) select auth.uid(), id, 'assignment_publish', 'teacher', 'forged', '{}',
    '[]', '[]', 'assignment', gen_random_uuid(), 'forged', now() + interval '5 minutes'
    from public.role_assignments where user_id = auth.uid() and role = 'teacher'$$,
  '42501', 'permission denied for table ai_action_drafts',
  '客户端不能直接写草稿绕过派生'
);

select throws_ok(
  $$select public.claim_ai_action_draft(
    (select id from public.ai_action_drafts order by created_at desc limit 1), false
  )$$,
  'P0001', 'SECOND_CONFIRMATION_REQUIRED', '危险操作必须二次确认'
);

update public.assignments set title = title || '（版本变化）'
where id = '70000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select public.claim_ai_action_draft(
    (select id from public.ai_action_drafts order by created_at desc limit 1), true
  )$$,
  'P0001', 'TARGET_VERSION_CHANGED', '目标版本变化时重新鉴权并拒绝'
);

reset role;
insert into public.ai_action_drafts (
  id, user_id, role_assignment_id, action_type, role, permission_scope,
  parameters, targets, impact, target_type, target_id, target_version,
  is_dangerous, status, expires_at
) select
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', id,
  'assessment_publish', 'teacher', 'school:10000000-0000-0000-0000-000000000001',
  '{"assessmentId":"80000000-0000-0000-0000-000000000002"}',
  '["合成演示二班 · 合成演示二班成绩草稿"]', '["发布后仅绑定家庭端可见个人成绩"]',
  'assessment', '80000000-0000-0000-0000-000000000002',
  (select updated_at::text from public.assessments where id = '80000000-0000-0000-0000-000000000002'),
  true, 'pending', now() + interval '5 minutes'
from public.role_assignments
where user_id = '30000000-0000-0000-0000-000000000001' and role = 'teacher';
insert into public.ai_action_drafts (
  id, user_id, role_assignment_id, action_type, role, permission_scope,
  parameters, targets, impact, target_type, target_id, target_version,
  is_dangerous, status, expires_at
) select
  '90000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001', id,
  'assignment_publish', 'teacher', 'school:10000000-0000-0000-0000-000000000001',
  '{}', '[]', '[]', 'assignment', '70000000-0000-0000-0000-000000000002', 'old',
  true, 'pending', now() - interval '1 minute'
from public.role_assignments
where user_id = '30000000-0000-0000-0000-000000000001' and role = 'teacher';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.claim_ai_action_draft('90000000-0000-0000-0000-000000000002', true)$$,
  '过期 claim 返回受控状态而不回滚'
);
select is(
  (select status from public.ai_action_drafts where id = '90000000-0000-0000-0000-000000000002'),
  'expired'::public.ai_action_draft_status,
  '过期状态被持久化'
);
select lives_ok(
  $$select public.claim_ai_action_draft('90000000-0000-0000-0000-000000000001', true)$$,
  '首次确认获得 executing lease'
);
select throws_ok(
  $$select public.claim_ai_action_draft('90000000-0000-0000-0000-000000000001', true)$$,
  'P0001', 'DRAFT_IN_PROGRESS', '有效 lease 期间拒绝并发确认'
);
reset role;
update public.ai_action_drafts set execution_lease_until = now() - interval '1 second'
where id = '90000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.claim_ai_action_draft('90000000-0000-0000-0000-000000000001', true)$$,
  '过期 executing lease 可恢复'
);
select is(
  (select execution_attempt from public.ai_action_drafts where id = '90000000-0000-0000-0000-000000000001'),
  2, '恢复后执行尝试次数递增'
);
select is(
  public.finish_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', true, '{"operationId":"op-1"}'
  ),
  '{"operationId":"op-1"}'::jsonb,
  '完成返回幂等回执'
);
select is(
  public.finish_ai_action_draft(
    '90000000-0000-0000-0000-000000000001', true, '{"operationId":"forged"}'
  ),
  '{"operationId":"op-1"}'::jsonb,
  '重复完成返回原始回执'
);
select lives_ok(
  $$select public.claim_ai_action_draft('90000000-0000-0000-0000-000000000001', true)$$,
  '重复确认已完成草稿不再触发新执行'
);

select lives_ok(
  $$select public.register_ai_skill_context_token(
    '91000000-0000-0000-0000-000000000001',
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    array['get_grades']
  )$$,
  '可登记短期 Skill context token'
);
select lives_ok(
  $$select public.consume_ai_skill_context_token(
    '91000000-0000-0000-0000-000000000001', 'get_grades'
  )$$,
  'Skill token 可按允许工具消费一次'
);
select throws_ok(
  $$select public.consume_ai_skill_context_token(
    '91000000-0000-0000-0000-000000000001', 'get_grades'
  )$$,
  'P0001', 'TOKEN_INVALID_OR_USED', 'Skill token 不可重放'
);

select lives_ok(
  $$select public.begin_ai_request(
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    (select role_assignment_id from public.ai_sessions where user_id = auth.uid() limit 1),
    '92000000-0000-0000-0000-000000000001', 20
  )$$,
  '首个 AI 请求获得并发 lease'
);
select lives_ok(
  $$select public.begin_ai_request(
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    (select role_assignment_id from public.ai_sessions where user_id = auth.uid() limit 1),
    '92000000-0000-0000-0000-000000000002', 20
  )$$,
  '第二个并发请求允许'
);
select throws_ok(
  $$select public.begin_ai_request(
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    (select role_assignment_id from public.ai_sessions where user_id = auth.uid() limit 1),
    '92000000-0000-0000-0000-000000000003', 20
  )$$,
  'P0001', 'CONCURRENCY_LIMIT', '第三个并发请求被拒绝'
);
select throws_ok(
  $$select public.begin_ai_request(
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    (select role_assignment_id from public.ai_sessions where user_id = auth.uid() limit 1),
    '92000000-0000-0000-0000-000000000004', 2001
  )$$,
  'P0001', 'MESSAGE_LENGTH', '服务端拒绝超长消息'
);

reset role;
update public.ai_request_events set completed_at = now();
insert into public.ai_request_events (
  id, session_id, user_id, lease_until, completed_at, created_at
)
select gen_random_uuid(),
  (select id from public.ai_sessions where user_id = '30000000-0000-0000-0000-000000000001' limit 1),
  '30000000-0000-0000-0000-000000000001', now() + interval '30 seconds', now(), now()
from generate_series(1, 18);
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.begin_ai_request(
    (select id from public.ai_sessions where user_id = auth.uid() limit 1),
    (select role_assignment_id from public.ai_sessions where user_id = auth.uid() limit 1),
    '92000000-0000-0000-0000-000000000005', 20
  )$$,
  'P0001', 'RATE_LIMITED', '一分钟频率达到上限后拒绝请求'
);
select lives_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments where user_id = auth.uid() and role = 'teacher'
  )) from generate_series(1, 8)$$,
  '允许最多十个活动会话'
);
select throws_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments where user_id = auth.uid() and role = 'teacher'
  ))$$,
  'P0001', 'SESSION_LIMIT', '超过活动会话上限被拒绝'
);

reset role;
update public.ai_sessions set status = 'closed'
where user_id = '30000000-0000-0000-0000-000000000001';
insert into public.role_assignments (user_id, role, scope_type, scope_id)
values
  ('30000000-0000-0000-0000-000000000001', 'teacher', 'class', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', 'teacher', 'class', '20000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.create_ai_session((
    select id from public.role_assignments
    where user_id = auth.uid() and role = 'teacher'
      and scope_type = 'class'
      and scope_id = '20000000-0000-0000-0000-000000000002'
  ))$$,
  '同一教师拥有两个班级范围时可选择第二个 active context'
);
select is(
  (select assignment.scope_id
   from public.ai_sessions as session
   join public.role_assignments as assignment on assignment.id = session.role_assignment_id
   where session.user_id = auth.uid() and session.status = 'active'
   order by session.created_at desc limit 1),
  '20000000-0000-0000-0000-000000000002'::uuid,
  'AI 会话精确绑定当前选择的第二个班级范围'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is((select count(*) from public.ai_sessions), 0::bigint, '家庭用户不能读取其他用户会话');
select is((select count(*) from public.ai_action_drafts), 0::bigint, '家庭用户不能读取其他用户草稿');

select * from finish();
rollback;
