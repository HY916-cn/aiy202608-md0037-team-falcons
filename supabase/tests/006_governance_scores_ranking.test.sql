-- Scores subsystem: student single/batch, class score + appeal, rankings.
begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

-- Bootstrap fixture for cross-school batch validation (before switching to authenticated).
insert into public.schools (id, name) values ('10000000-0000-0000-0000-000000000077', '其他学校');
insert into public.classes (id, school_id, grade, name)
values ('20000000-0000-0000-0000-000000000077', '10000000-0000-0000-0000-000000000077', '九', '其他');
insert into public.students (id, student_no, class_id, display_name)
values ('50000000-0000-0000-0000-000000000077', 'OUT-001', '20000000-0000-0000-0000-000000000077', '外校学生');
insert into public.student_score_categories (id, school_id, slug, display_name, kind, default_delta)
values ('90000000-0000-0000-0000-000000000077', '10000000-0000-0000-0000-000000000077', 'homework', '外校', 'positive', 3);

set local role authenticated;

-- Teacher can create a positive student score category with default delta.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (
    select c.default_delta
    from public.manage_student_score_category(
      'ss-category-create-0001',
      '10000000-0000-0000-0000-000000000001',
      null,
      'reading_star',
      '阅读之星',
      'positive',
      4,
      '阅读奖励',
      true
    ) as c
  ),
  4::numeric(9, 2),
  '教师可创建加分条目并保存默认分数'
);

-- Teacher can edit and disable an existing category.
select is(
  (
    select c.is_active
    from public.manage_student_score_category(
      'ss-category-disable-0001',
      '10000000-0000-0000-0000-000000000001',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      'reading_star',
      '阅读之星',
      'positive',
      4,
      '阅读奖励-停用',
      false
    ) as c
  ),
  false,
  '教师可停用学生分条目'
);
select is(
  (
    select c.kind::text
    from public.manage_student_score_category(
      'ss-category-reenable-0001',
      '10000000-0000-0000-0000-000000000001',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      'reading_star',
      '阅读之星',
      'positive',
      6,
      '阅读奖励-启用',
      true
    ) as c
  ),
  'positive',
  '教师可重新启用并更新默认分数'
);

select throws_ok(
  $$
    select public.manage_student_score_category(
      'ss-category-cross-school-0001',
      '10000000-0000-0000-0000-000000000077',
      null,
      'foreign_category',
      '外校条目',
      'positive',
      2,
      '外校',
      true
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '教师不能管理外校学生分条目'
);

select throws_ok(
  $$
    select public.manage_student_score_category(
      'ss-category-sign-0001',
      '10000000-0000-0000-0000-000000000001',
      null,
      'bad_sign',
      '错误符号',
      'positive',
      -2,
      '符号错误',
      true
    )
  $$,
  'P0001',
  'CATEGORY_DELTA_SIGN_MISMATCH',
  '默认分数与条目符号不一致会被拒绝'
);

select throws_ok(
  $$
    select public.manage_student_score_category(
      'ss-category-fraction-0001',
      '10000000-0000-0000-0000-000000000001',
      null,
      'bad_fraction',
      '错误小数',
      'negative',
      -1.5,
      '小数错误',
      true
    )
  $$,
  'P0001',
  'INVALID_DEFAULT_DELTA',
  '默认分数为小数会被拒绝'
);

-- Teacher applies a single student score.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (select r.delta from public.apply_student_score(
    'ss-single-teacher-0001',
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    8,
    '课堂积极'
  ) as r),
  8::numeric(9, 2),
  '教师应用学生分成功'
);
select is(
  (select r.delta from public.apply_student_score(
    'ss-single-negative-0001',
    '50000000-0000-0000-0000-000000000003',
    '90000000-0000-0000-0000-000000000002',
    -2,
    '课堂纪律扣分'
  ) as r),
  -2::numeric(9, 2),
  '教师可按负向类目成功扣减学生分'
);

-- Teacher applies a batch.
select is(
  (select count(*) from public.apply_student_score_batch(
    'ss-batch-teacher-0001',
    jsonb_build_array(
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000001', 'category_id', '90000000-0000-0000-0000-000000000001', 'delta', 2),
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000002', 'category_id', '90000000-0000-0000-0000-000000000001', 'delta', 3),
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000003', 'category_id', '90000000-0000-0000-0000-000000000002', 'delta', -1)
    ),
    '批量加减分'
  )),
  3::bigint,
  '教师批量加减分返回三条明细'
);

-- Batch idempotency.
select is(
  (select count(*) from public.apply_student_score_batch(
    'ss-batch-teacher-0001',
    jsonb_build_array(
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000001', 'category_id', '90000000-0000-0000-0000-000000000001', 'delta', 2),
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000002', 'category_id', '90000000-0000-0000-0000-000000000001', 'delta', 3),
      jsonb_build_object('student_id', '50000000-0000-0000-0000-000000000003', 'category_id', '90000000-0000-0000-0000-000000000002', 'delta', -1)
    ),
    '批量加减分'
  )),
  3::bigint,
  '批量重放返回原三条'
);

-- Batch size validation.
select throws_ok(
  $$
    select public.apply_student_score_batch(
      'ss-batch-empty-0001',
      '[]'::jsonb,
      '空批量'
    )
  $$,
  'P0001',
  'BATCH_SIZE_OUT_OF_RANGE',
  '空批量被拒绝'
);

-- Mixed schools batch rejected.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  format($f$
    select public.apply_student_score_batch(
      'ss-batch-mixed-0001',
      jsonb_build_array(
        jsonb_build_object('student_id', %L, 'category_id', %L, 'delta', 1),
        jsonb_build_object('student_id', %L, 'category_id', %L, 'delta', 1)
      ),
      '跨学校'
    )
  $f$,
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000077',
    '90000000-0000-0000-0000-000000000001'
  ),
  'P0001',
  'BATCH_MIXED_SCHOOLS',
  '批量跨学校会被拒绝'
);

-- Ranking with ties.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
-- Both students 1 and 2 currently have entries. Add explicit ties to a third student.
select is(
  (select r.delta from public.apply_student_score(
    'ss-tie-case-0003',
    '50000000-0000-0000-0000-000000000004',
    '90000000-0000-0000-0000-000000000001',
    10,
    '并列名次准备'
  ) as r),
  10::numeric(9, 2),
  '为学生 04 加 10 分'
);
select is(
  (select r.delta from public.apply_student_score(
    'ss-tie-case-0004',
    '50000000-0000-0000-0000-000000000005',
    '90000000-0000-0000-0000-000000000001',
    10,
    '并列名次准备'
  ) as r),
  10::numeric(9, 2),
  '为学生 05 加 10 分'
);
-- Verify rank has ties.
select ok(
  (select count(*) from (
    select rank_position, count(*) as c
    from public.compute_student_ranking(
      '20000000-0000-0000-0000-000000000001'::uuid,
      'all_time'::public.student_ranking_scope,
      now()
    )
    group by rank_position
  ) as ranks where c > 1) >= 1,
  '排行榜产生至少一个并列名次'
);

-- Runtime delta can override category default when sign remains consistent.
select is(
  (
    select r.delta
    from public.apply_student_score(
      'ss-category-override-0001',
      '50000000-0000-0000-0000-000000000006',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      9,
      '覆盖默认值'
    ) as r
  ),
  9::numeric(9, 2),
  '本次学生分可覆盖条目默认值'
);

select is(
  (
    select c.is_active
    from public.manage_student_score_category(
      'ss-category-disable-0002',
      '10000000-0000-0000-0000-000000000001',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      'reading_star',
      '阅读之星',
      'positive',
      6,
      '恢复后再次停用以验证运行时校验',
      false
    ) as c
  )::text,
  'false',
  '条目可再次停用'
);

select throws_ok(
  $$
    select public.apply_student_score(
      'ss-category-inactive-0001',
      '50000000-0000-0000-0000-000000000007',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      4,
      '停用条目'
    )
  $$,
  'P0001',
  'CATEGORY_NOT_FOUND',
  '停用条目不能用于新学生分'
);

select is(
  (
    select c.is_active
    from public.manage_student_score_category(
      'ss-category-reenable-0002',
      '10000000-0000-0000-0000-000000000001',
      (select id from public.student_score_categories where school_id = '10000000-0000-0000-0000-000000000001' and slug = 'reading_star'),
      'reading_star',
      '阅读之星',
      'positive',
      6,
      '停用校验后恢复启用',
      true
    ) as c
  )::text,
  'true',
  '停用校验后可恢复启用'
);

select throws_ok(
  $$
    select public.apply_student_score(
      'ss-category-sign-runtime-0001',
      '50000000-0000-0000-0000-000000000006',
      '90000000-0000-0000-0000-000000000001',
      -4,
      '符号冲突'
    )
  $$,
  'P0001',
  'CATEGORY_DELTA_SIGN_MISMATCH',
  '本次分值与加分条目符号不一致会被拒绝'
);

select throws_ok(
  $$
    select public.apply_student_score(
      'ss-category-fraction-runtime-0001',
      '50000000-0000-0000-0000-000000000006',
      '90000000-0000-0000-0000-000000000001',
      1.5,
      '小数分值'
    )
  $$,
  'P0001',
  'INVALID_DELTA',
  '本次学生分为小数会被拒绝'
);

-- Council cannot apply student score (only teacher can).
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select throws_ok(
  $$
    select public.apply_student_score(
      'ss-council-ok-0001',
      '50000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      2,
      '自治会尝试加分'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '自治会不能应用学生分'
);

-- Class score - council apply.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (select r.delta from public.apply_class_score(
    'cs-council-ok-0001',
    '20000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    5,
    '清洁一等奖'
  ) as r),
  5::numeric(9, 2),
  '自治会应用班级分成功'
);

-- Class score - teacher forbidden.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    select public.apply_class_score(
      'cs-teacher-forbid-0001',
      '20000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001',
      3,
      '教师不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '教师不能应用班级分'
);

-- Class score - bank forbidden.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select throws_ok(
  $$
    select public.apply_class_score(
      'cs-bank-forbid-0001',
      '20000000-0000-0000-0000-000000000001',
      '91000000-0000-0000-0000-000000000001',
      3,
      '银行不允许'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '银行操作员不能应用班级分'
);

-- Class terminal can create an appeal for their own class.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select set_config(
  'app.test.class_score_entry_id',
  (
    select id::text from public.class_score_entries
    where operation_id = (select id from public.operations where idempotency_key = 'cs-council-ok-0001')
  ),
  true
);
select is(
  (
    select cs.status::text
    from public.create_class_score_appeal(
      'appeal-terminal-0001',
      current_setting('app.test.class_score_entry_id')::uuid,
      '希望复核清洁评比结果'
    ) as cs
  ),
  'pending',
  '班级端可创建申诉'
);

-- Family cannot create an appeal.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  format($f$
    select public.create_class_score_appeal(
      'appeal-family-forbid-0001',
      %L,
      '家庭无权申诉班级分'
    )
  $f$,
    current_setting('app.test.class_score_entry_id')
  ),
  'P0001',
  'FORBIDDEN',
  '家庭端不能创建班级分申诉'
);

-- Cannot create a second pending appeal for the same entry.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  format($f$
    select public.create_class_score_appeal(
      'appeal-terminal-0002',
      %L,
      '重复申诉理由'
    )
  $f$,
    current_setting('app.test.class_score_entry_id')
  ),
  'P0001',
  'APPEAL_ALREADY_PENDING',
  '重复申诉被拒绝'
);

-- Council resolves the appeal (accept).
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (
    select r.status::text
    from public.resolve_class_score_appeal(
      'appeal-resolve-0001',
      (select id from public.class_score_appeals order by created_at desc limit 1),
      true,
      '申诉成立'
    ) as r
  ),
  'accepted',
  '自治会可以接受申诉'
);

-- The original class score entry is now marked reversed.
select is(
  (select is_reversed from public.class_score_entries
   where operation_id = (select id from public.operations where idempotency_key = 'cs-council-ok-0001')),
  true,
  '接受申诉后原班级分标记为已撤销'
);

-- Cannot appeal an already reversed entry.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select throws_ok(
  format($f$
    select public.create_class_score_appeal(
      'appeal-terminal-0003',
      %L,
      '试图对已撤销条目申诉'
    )
  $f$,
    current_setting('app.test.class_score_entry_id')
  ),
  'P0001',
  'ENTRY_NOT_APPEALABLE',
  '已被撤销的条目不能申诉'
);

-- Direct DML denied on student_score_entries.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$
    insert into public.student_score_entries (operation_id, student_id, category_id, delta, reason)
    values (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 3, '直接写')
  $$,
  '42501',
  'permission denied for table student_score_entries',
  '直接写 student_score_entries 被拒绝'
);

-- Direct DML denied on class_score_entries.
select throws_ok(
  $$
    insert into public.class_score_entries (operation_id, class_id, category_id, delta, reason)
    values (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 3, '直接写')
  $$,
  '42501',
  'permission denied for table class_score_entries',
  '直接写 class_score_entries 被拒绝'
);

-- Family from wrong household cannot see student_score_entries for other student.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select is(
  (select count(*) from public.student_score_entries where student_id = '50000000-0000-0000-0000-000000000003'),
  0::bigint,
  '家庭不能读取未绑定学生的分数条目'
);

-- Family from correct household can see their students score entries.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select ok(
  (select count(*) from public.student_score_entries where student_id = '50000000-0000-0000-0000-000000000001') >= 1,
  '家庭端可读取绑定学生的分数条目'
);

-- Class terminal can read class score entries for its class.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select ok(
  (select count(*) from public.class_score_entries where class_id = '20000000-0000-0000-0000-000000000001') >= 1,
  '班级端可读取本班班级分条目'
);

-- Class terminal cannot see other class entries.
select is(
  (select count(*) from public.class_score_entries where class_id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  '班级端不能读取其他班级分条目'
);

-- Ranking respects privacy: family only sees their bound student rows.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
create temporary table family_rank_fixture as
select *
from public.apply_student_score(
  'family-rank-fixture-0001',
  '50000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000001',
  25,
  '家庭真实名次测试基准'
);

create temporary table expected_family_ranks as
select 'weekly'::text as ranking_scope, result.rank_position
from public.compute_student_ranking(
  '20000000-0000-0000-0000-000000000001',
  'weekly',
  now()
) as result
where result.student_id = '50000000-0000-0000-0000-000000000001'
union all
select 'monthly'::text, result.rank_position
from public.compute_student_ranking(
  '20000000-0000-0000-0000-000000000001',
  'monthly',
  now()
) as result
where result.student_id = '50000000-0000-0000-0000-000000000001'
union all
select 'all_time'::text, result.rank_position
from public.compute_student_ranking(
  '20000000-0000-0000-0000-000000000001',
  'all_time',
  now()
) as result
where result.student_id = '50000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'all_time', now())),
  1::bigint,
  '家庭端排行 RPC 仅返回绑定学生本人'
);
select is(
  (
    select rank_position
    from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'weekly', now())
  ),
  (select rank_position from expected_family_ranks where ranking_scope = 'weekly'),
  '家庭端周榜仅返回本人且保留真实班内名次'
);
select is(
  (
    select rank_position
    from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'monthly', now())
  ),
  (select rank_position from expected_family_ranks where ranking_scope = 'monthly'),
  '家庭端月榜仅返回本人且保留真实班内名次'
);
select is(
  (
    select rank_position
    from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'all_time', now())
  ),
  (select rank_position from expected_family_ranks where ranking_scope = 'all_time'),
  '家庭端总榜仅返回本人且保留真实班内名次'
);
-- Ranking for unauthorized class raises FORBIDDEN.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  $$
    select public.compute_student_ranking('20000000-0000-0000-0000-000000000003', 'all_time', now())
  $$,
  'P0001',
  'FORBIDDEN',
  '未授权班级排行触发 FORBIDDEN'
);

-- Weekly ranking respects tie logic.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select ok(
  (select count(*) from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'weekly', now())) = 8,
  '周榜返回本班全部 8 名学生'
);

-- Monthly ranking totals include all entries.
select ok(
  (select sum(score) from public.compute_student_ranking('20000000-0000-0000-0000-000000000001', 'monthly', now())) > 0,
  '月榜含至少一名有分学生'
);

-- Total ranking excludes reversed entries.
-- Add and reverse an entry, ensure net score returns to zero through immutable offset entries.
select is(
  (select r.delta from public.apply_student_score(
    'ss-reversible-0001',
    '50000000-0000-0000-0000-000000000008',
    '90000000-0000-0000-0000-000000000001',
    50,
    '大幅加分'
  ) as r),
  50::numeric(9, 2),
  '为撤销测试加 50 分'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select is(
  (
    select r.kind::text from public.apply_targeted_reversal(
      'ss-reversal-0001',
      (select id from public.operations where idempotency_key = 'ss-reversible-0001'),
      '合成撤销测试'
    ) as r
  ),
  'reversal_apply',
  '教师撤销学生分成功'
);
select is(
  (
    select coalesce(sum(delta), 0)
    from public.student_score_entries
    where student_id = '50000000-0000-0000-0000-000000000008'
  ),
  0::numeric(12, 2),
  '撤销后通过反向流水抵消为零'
);

select * from finish();
rollback;
