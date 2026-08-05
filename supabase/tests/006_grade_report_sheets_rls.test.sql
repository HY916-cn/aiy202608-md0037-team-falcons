begin;

create extension if not exists pgtap with schema extensions;
select plan(69);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$
    select public.save_grade_report_sheet_draft(
      '85000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '单项目合成成绩单',
      '数学',
      'grid',
      '[{"column_key":"written","name":"笔试","position":0,"max_score":100}]'::jsonb,
      '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":"合成评语"}]},{"student_id":"50000000-0000-0000-0000-000000000002","values":[{"column_key":"written","score":88,"comment":""}]}]'::jsonb
    )
  $$,
  '教师可以保存单成绩项、多学生的成绩单草稿'
);

select lives_ok(
  $$
    select public.save_grade_report_sheet_draft(
      '85000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '三项目合成成绩单',
      '数学',
      'csv',
      '[{"column_key":"written","name":"笔试","position":0,"max_score":100},{"column_key":"practice","name":"实践","position":1,"max_score":20},{"column_key":"reading","name":"阅读","position":2,"max_score":null}]'::jsonb,
      '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":92,"comment":""},{"column_key":"practice","score":18,"comment":"合成实践评语"},{"column_key":"reading","score":95,"comment":""}]},{"student_id":"50000000-0000-0000-0000-000000000002","values":[{"column_key":"written","score":89,"comment":""},{"column_key":"practice","score":17,"comment":""},{"column_key":"reading","score":90,"comment":""}]}]'::jsonb
    )
  $$,
  '教师可以原子保存三成绩项、多学生的规范化导入 DTO'
);

select is((select count(*) from public.grade_report_sheets), 2::bigint, '教师可读取自己的两张成绩单');
select is((select count(*) from public.grade_report_columns), 4::bigint, '单项目和三项目列均已保存');
select is((select count(*) from public.grade_report_rows), 4::bigint, '两张成绩单均保存多个学生行');
select is((select count(*) from public.grade_report_values), 8::bigint, '每个学生和成绩项均保存一个值');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '家庭端看不到成绩单草稿');
select is((select count(*) from public.grade_report_rows), 0::bigint, '家庭端看不到草稿学生行');
select is((select count(*) from public.grade_report_values), 0::bigint, '家庭端看不到草稿成绩值');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.publish_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  '教师通过安全 RPC 一次发布整张成绩单'
);
select is(
  (select status::text from public.grade_report_sheets where id = '85000000-0000-0000-0000-000000000002'),
  'published',
  '整张成绩单发布状态一次生效'
);
select ok(
  (select published_at is not null from public.grade_report_sheets where id = '85000000-0000-0000-0000-000000000002'),
  '整张成绩单记录发布时间'
);
select is(
  jsonb_array_length(public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001')),
  2,
  '当前教师可以按班级列出草稿和已发布成绩单'
);
select is(
  public.get_grade_report_sheet('85000000-0000-0000-0000-000000000001') ->> 'status',
  'draft',
  '当前教师可以重新打开指定草稿成绩单'
);
select is(
  public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') ->> 'status',
  'published',
  '当前教师可以重新打开指定已发布成绩单'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is((select count(*) from public.grade_report_sheets), 1::bigint, '家庭端只看到已发布成绩单');
select is((select count(*) from public.grade_report_rows), 1::bigint, '家庭端只看到绑定学生本人行');
select is(
  (select count(*) from public.grade_report_rows where student_id = '50000000-0000-0000-0000-000000000002'),
  0::bigint,
  '家庭端看不到同班其他学生行'
);
select is((select count(*) from public.grade_report_values), 3::bigint, '家庭端看到本人三个成绩项值');
select is((select count(*) from public.grade_report_value_revisions), 0::bigint, '家庭端不能读取内部修订历史');
select is(
  jsonb_array_length(public.list_published_grade_report_sheets_for_student('50000000-0000-0000-0000-000000000001')),
  1,
  '家庭读取 RPC 只返回本人已发布成绩单'
);
select is(
  jsonb_array_length(public.list_published_grade_report_sheets_for_student('50000000-0000-0000-0000-000000000001') -> 0 -> 'rows'),
  1,
  '家庭读取 RPC 的成绩单只包含一个学生行'
);
select is(
  public.list_published_grade_report_sheets_for_student('50000000-0000-0000-0000-000000000001') -> 0 -> 'rows' -> 0 ->> 'studentId',
  '50000000-0000-0000-0000-000000000001',
  '家庭读取 RPC 返回当前绑定学生'
);
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '家庭端不能调用教师班级成绩单列表'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'NOT_FOUND',
  '家庭端不能调用教师成绩单详情'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000023', true);
select is((select count(*) from public.grade_report_sheets), 1::bigint, '多学生家庭看到已绑定学生的已发布成绩单');
select is((select count(*) from public.grade_report_rows), 1::bigint, '多学生家庭只看到成绩单中已绑定的学生行');
select is((select count(*) from public.grade_report_values), 3::bigint, '多学生家庭只看到绑定学生成绩值');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '未绑定该班学生的家庭看不到成绩单');
select is((select count(*) from public.grade_report_rows), 0::bigint, '未绑定家庭看不到学生行');
select is((select count(*) from public.grade_report_values), 0::bigint, '未绑定家庭看不到成绩值');
select throws_ok(
  $$ select public.list_published_grade_report_sheets_for_student('50000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '家庭不能请求其他学生的成绩单'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '班级端不读取成绩单');
select is((select count(*) from public.grade_report_rows), 0::bigint, '班级端不读取个人成绩行');
select is((select count(*) from public.grade_report_values), 0::bigint, '班级端个人成绩值读取结果为零');
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '班级端不能调用教师班级成绩单列表'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'NOT_FOUND',
  '班级端不能调用教师成绩单详情'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '银行端不读取成绩单');
select is((select count(*) from public.grade_report_values), 0::bigint, '银行端不读取个人成绩值');
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '银行端不能调用教师班级成绩单列表'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'NOT_FOUND',
  '银行端不能调用教师成绩单详情'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '自治会端不读取成绩单');
select is((select count(*) from public.grade_report_values), 0::bigint, '自治会端不读取个人成绩值');
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '自治会端不能调用教师班级成绩单列表'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'NOT_FOUND',
  '自治会端不能调用教师成绩单详情'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is((select count(*) from public.grade_report_sheets), 2::bigint, '管理端只审计两张成绩单元数据');
select is((select count(*) from public.grade_report_columns), 4::bigint, '管理端可审计成绩项元数据');
select is((select count(*) from public.grade_report_rows), 0::bigint, '管理端默认不读取学生行');
select is((select count(*) from public.grade_report_values), 0::bigint, '管理端默认不读取个人成绩值');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '其他教师不能调用未任教班级成绩单列表'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'NOT_FOUND',
  '其他教师不能读取非本人成绩单详情'
);
select throws_ok(
  $$ select public.publish_grade_report_sheet('85000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'NOT_FOUND',
  '其他教师不能发布非本人成绩单'
);
select throws_ok(
  $$
    insert into public.grade_report_sheets (class_id, title, subject, source)
    values ('20000000-0000-0000-0000-000000000003', '绕过 RPC', '语文', 'grid')
  $$,
  '42501',
  'permission denied for table grade_report_sheets',
  '教师不能绕过安全 RPC 直接写成绩单'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format(
    'select public.revise_grade_report_value(%L, 95, %L, %L)',
    (
      select report_value.id
      from public.grade_report_values as report_value
      join public.grade_report_rows as report_row on report_row.id = report_value.row_id
      join public.grade_report_columns as report_column on report_column.id = report_value.column_id
      where report_row.sheet_id = '85000000-0000-0000-0000-000000000002'
        and report_row.student_id = '50000000-0000-0000-0000-000000000001'
        and report_column.column_key = 'written'
    ),
    '复核后的合成评语',
    '合成测试：教师复核'
  ),
  '教师可修订已发布成绩单中的一个值'
);
select is(
  (
    select report_value.score
    from public.grade_report_values as report_value
    join public.grade_report_rows as report_row on report_row.id = report_value.row_id
    join public.grade_report_columns as report_column on report_column.id = report_value.column_id
    where report_row.sheet_id = '85000000-0000-0000-0000-000000000002'
      and report_row.student_id = '50000000-0000-0000-0000-000000000001'
      and report_column.column_key = 'written'
  ),
  95.00::numeric,
  '修订保存新值'
);
select is((select count(*) from public.grade_report_value_revisions), 1::bigint, '发布后修订追加一条历史');
select is((select old_score from public.grade_report_value_revisions), 92.00::numeric, '修订历史保存旧值');
select is((select new_score from public.grade_report_value_revisions), 95.00::numeric, '修订历史保存新值');
select is((select reason from public.grade_report_value_revisions), '合成测试：教师复核', '修订历史保存原因');
select is(
  (select actor_id from public.grade_report_value_revisions),
  '30000000-0000-0000-0000-000000000001'::uuid,
  '修订历史操作者来自 JWT'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select max(score) from public.grade_report_values),
  95.00::numeric,
  '家庭端读取到本人修订后的成绩值'
);
select is((select count(*) from public.grade_report_value_revisions), 0::bigint, '家庭端修订历史仍不可见');
select is(
  (select count(*) from public.grade_report_sheets where id = '85000000-0000-0000-0000-000000000001'),
  0::bigint,
  '家庭端始终看不到未发布的单项目草稿'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config(
  'app.grade_report_revoked_value_id',
  (
    select report_value.id::text
    from public.grade_report_values as report_value
    join public.grade_report_rows as report_row on report_row.id = report_value.row_id
    join public.grade_report_columns as report_column on report_column.id = report_value.column_id
    where report_row.sheet_id = '85000000-0000-0000-0000-000000000002'
      and report_row.student_id = '50000000-0000-0000-0000-000000000001'
      and report_column.column_key = 'written'
  ),
  true
);
reset role;
delete from public.teacher_class_assignments
where teacher_id = '30000000-0000-0000-0000-000000000001'
  and class_id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '撤销任教关系后教师不能 select 历史成绩单');
select is((select count(*) from public.grade_report_rows), 0::bigint, '撤销任教关系后教师不能 select 历史学生行');
select is((select count(*) from public.grade_report_value_revisions), 0::bigint, '撤销任教关系后教师不能 select 历史修订');
select throws_ok(
  $$ select public.list_grade_report_sheets_for_class('20000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'FORBIDDEN',
  '撤销任教关系后教师不能列出班级成绩单'
);
select throws_ok(
  $$ select public.get_grade_report_sheet('85000000-0000-0000-0000-000000000002') $$,
  'P0001',
  'FORBIDDEN',
  '撤销任教关系后教师不能重新打开历史成绩单'
);
select throws_ok(
  format(
    'select public.revise_grade_report_value(%L::uuid, 96, %L, %L)',
    current_setting('app.grade_report_revoked_value_id'),
    '越权修订',
    '任教关系已撤销'
  ),
  'P0001',
  'NOT_FOUND',
  '撤销任教关系后教师不能修订已发布成绩'
);

select * from finish();
rollback;
