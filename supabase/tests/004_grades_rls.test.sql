begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.assessments), 2::bigint, '教师可以读取自己的测验');
select is((select count(*) from public.grade_records), 3::bigint, '教师可以读取自己的成绩草稿和已发布成绩');
select is((select count(*) from public.grade_revisions), 1::bigint, '教师可以读取自己成绩的修订历史');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.assessments), 1::bigint, '其他教师只能读取自己的测验');
select is((select count(*) from public.grade_records), 1::bigint, '其他教师只能读取自己的成绩');
select is((select count(*) from public.grade_revisions), 0::bigint, '其他教师不能读取非本人修订历史');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is((select count(*) from public.assessments), 1::bigint, '班级端只可见本班已发布测验元数据');
select is((select count(*) from public.grade_records), 0::bigint, '班级端绝对不能读取个人成绩');
select is((select count(*) from public.grade_revisions), 0::bigint, '班级端不能读取成绩修订日志');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is((select count(*) from public.assessments), 1::bigint, '家庭端可见绑定学生班级已发布测验');
select is((select count(*) from public.grade_records), 1::bigint, '家庭端只能读取绑定学生已发布成绩');
select is((select count(*) from public.grade_revisions), 0::bigint, '家庭端不读取内部成绩修订日志');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select is((select count(*) from public.grade_records), 0::bigint, '家庭端不能读取未发布成绩草稿');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000023', true);
select is((select count(*) from public.grade_records), 1::bigint, '多学生家庭只读取已发布且已绑定学生成绩');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is((select count(*) from public.assessments), 3::bigint, '管理端可按学校审计测验元数据');
select is((select count(*) from public.grade_records), 0::bigint, '管理端默认不读取个人成绩值');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is((select count(*) from public.grade_records), 0::bigint, '银行端不能读取个人成绩');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is((select count(*) from public.grade_records), 0::bigint, '自治会端不能读取个人成绩');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    insert into public.assessments (id, class_id, subject, title)
    values (
      '83000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '数学',
      'RLS 测验草稿'
    )
  $$,
  '教师可以为任教班级创建测验草稿'
);
select throws_ok(
  $$
    select public.publish_assessment(
      '83000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'VALIDATION_ERROR',
  '没有成绩的测验不能通过发布 RPC 发布'
);
select throws_ok(
  $$
    update public.assessments
    set
      status = 'published',
      published_at = now()
    where id = '83000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'new row violates row-level security policy for table "assessments"',
  '教师不能绕过发布 RPC 直接发布测验'
);
select throws_ok(
  $$
    insert into public.assessments (class_id, subject, title)
    values (
      '20000000-0000-0000-0000-000000000003',
      '数学',
      '越权测验草稿'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "assessments"',
  '教师不能为未任教班级创建测验'
);
select lives_ok(
  $$
    insert into public.grade_records (
      id,
      assessment_id,
      student_id,
      score,
      comment
    )
    values (
      '84000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000003',
      91,
      '合成草稿评语'
    )
  $$,
  '教师可以录入本班学生成绩草稿'
);
select throws_ok(
  $$
    insert into public.grade_records (
      assessment_id,
      student_id,
      score
    )
    values (
      '83000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000009',
      91
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "grade_records"',
  '教师不能把其他班学生写入测验'
);
select lives_ok(
  $$
    select public.publish_assessment(
      '80000000-0000-0000-0000-000000000002'
    )
  $$,
  '教师可以发布已有成绩草稿的测验'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select is((select count(*) from public.grade_records), 1::bigint, '发布后绑定家庭可以读取对应学生成绩');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    select public.revise_grade(
      '81000000-0000-0000-0000-000000000001',
      95,
      '复核后的合成评语',
      '合成测试：教师复核'
    )
  $$,
  '教师可以修订已发布成绩并提供原因'
);
select is(
  (select score from public.grade_records where id = '81000000-0000-0000-0000-000000000001'),
  95.00::numeric,
  '成绩修订保存新值'
);
select is(
  (select count(*) from public.grade_revisions where grade_id = '81000000-0000-0000-0000-000000000001'),
  2::bigint,
  '成绩修订自动追加不可变历史'
);
select throws_ok(
  $$
    update public.grade_records
    set score = 96
    where id = '81000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'MISSING_REVISION_REASON',
  '已发布成绩不能绕过修订原因直接修改'
);
select throws_ok(
  $$
    update public.grade_records
    set id = '81000000-0000-0000-0000-000000000099'
    where id = '81000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table grade_records',
  '成绩记录 id 不可修改'
);
select throws_ok(
  $$
    update public.grade_records
    set student_id = '50000000-0000-0000-0000-000000000004'
    where id = '81000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table grade_records',
  '已发布成绩不能换学生'
);
select throws_ok(
  $$
    update public.grade_records
    set assessment_id = '80000000-0000-0000-0000-000000000002'
    where id = '81000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table grade_records',
  '已发布成绩不能跨测验移动'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$
    select public.revise_grade(
      '81000000-0000-0000-0000-000000000001',
      99,
      '越权修订',
      '越权尝试'
    )
  $$,
  'P0001',
  'NOT_FOUND',
  '其他教师不能修订非本人学生成绩'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$
    insert into public.grade_records (assessment_id, student_id, score)
    values (
      '80000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000004',
      100
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "grade_records"',
  '班级端不能写入个人成绩'
);

select * from finish();
rollback;
