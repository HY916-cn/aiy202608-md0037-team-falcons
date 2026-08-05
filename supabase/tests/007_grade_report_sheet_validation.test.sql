begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', 'Invalid columns', 'Math', 'grid', '{}'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'columns object returns stable VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', 'Invalid values', 'Math', 'grid', '[{"column_key":"written","name":"Written","position":0,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":{}}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'row values object returns stable VALIDATION_ERROR'
);

select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误位置', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":"0","max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'position 字符串稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误位置', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0.5,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', '非整数 position 稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误满分', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":"100"}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'max_score 字符串稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误满分', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":{"value":100}}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'max_score 对象稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '越界满分', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":100000}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', '越界 max_score 稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '精度错误满分', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":90.999}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', '三位小数 max_score 稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误成绩', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":"90","comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'score 字符串稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '错误成绩', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":{"value":90},"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', 'score 对象稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '越界成绩', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":null}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":100000,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', '越界 score 稳定返回 VALIDATION_ERROR'
);
select throws_ok(
  $$ select public.save_grade_report_sheet_draft(null, '20000000-0000-0000-0000-000000000001', '精度错误成绩', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90.999,"comment":""}]}]'::jsonb) $$,
  'P0001', 'VALIDATION_ERROR', '三位小数 score 稳定返回 VALIDATION_ERROR'
);
select is((select count(*) from public.grade_report_sheets), 0::bigint, '所有错误 DTO 均原子失败且未创建成绩单');

select lives_ok(
  $$ select public.save_grade_report_sheet_draft('85000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', '修订精度测试', '数学', 'grid', '[{"column_key":"written","name":"笔试","position":0,"max_score":100}]'::jsonb, '[{"student_id":"50000000-0000-0000-0000-000000000001","values":[{"column_key":"written","score":90,"comment":""}]}]'::jsonb) $$,
  '合法两位小数成绩单可以保存'
);
select lives_ok(
  $$ select public.publish_grade_report_sheet('85000000-0000-0000-0000-000000000007') $$,
  '合法成绩单可以发布'
);
select throws_ok(
  format(
    'select public.revise_grade_report_value(%L::uuid, 90.999, %L, %L)',
    (
      select report_value.id
      from public.grade_report_values as report_value
      join public.grade_report_rows as report_row on report_row.id = report_value.row_id
      where report_row.sheet_id = '85000000-0000-0000-0000-000000000007'
    ),
    '非法精度',
    '三位小数'
  ),
  'P0001',
  'VALIDATION_ERROR',
  '修订 RPC 拒绝三位小数且不静默四舍五入'
);
select is((select count(*) from public.grade_report_value_revisions), 0::bigint, '非法精度修订不产生历史');

select * from finish();
rollback;
