begin;

create extension if not exists pgtap with schema extensions;
select plan(41);

select is(
  (select public from storage.buckets where id = 'courseware-private'),
  false,
  '课件存储桶保持私有'
);
select is(
  (select file_size_limit from storage.buckets where id = 'courseware-private'),
  52428800::bigint,
  '课件存储桶限制单文件为 50 MiB'
);
select ok(
  (
    select allowed_mime_types @> array['application/pdf', 'image/png']
    from storage.buckets
    where id = 'courseware-private'
  ),
  '课件存储桶限制 MIME 白名单'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.courseware_items),
  1::bigint,
  '教师只能读取自己的课件'
);
select is(
  (select count(*) from public.courseware_targets),
  2::bigint,
  '教师可以读取自己课件的发送与撤回记录'
);
select is(
  (select count(*) from public.courseware_receipts),
  1::bigint,
  '教师可以读取自己课件的班级接收状态'
);
select is(
  (select count(*) from public.courseware_returns),
  1::bigint,
  '教师可以读取回传给自己的资料'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'courseware-private'),
  2::bigint,
  '教师可以读取自己的课件对象和回传对象'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)
    from public.courseware_items
    where id = '60000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  '其他教师不能读取非本人课件'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.courseware_items),
  1::bigint,
  '目标班级端可以读取已发布课件'
);
select is(
  (select count(*) from public.courseware_targets),
  1::bigint,
  '目标班级端可以读取自己的发送目标'
);
select is(
  (select count(*) from public.courseware_receipts),
  1::bigint,
  '目标班级端可以读取自己的接收记录'
);
select is(
  (select count(*) from public.courseware_returns),
  1::bigint,
  '班级端可以读取自己回传的资料'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'courseware-private'),
  2::bigint,
  '目标班级端可以读取已发送课件和自己的回传对象'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000012', true);
select is(
  (select count(*) from public.courseware_items),
  0::bigint,
  '已撤回目标的班级端不能继续读取课件'
);
select is(
  (
    select count(*)
    from public.courseware_targets
    where id = '61000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  '无关班级端不能读取其他班级发送目标'
);
select is(
  (select count(*) from public.courseware_returns),
  0::bigint,
  '无关班级端不能读取其他班级回传资料'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'courseware-private'),
  0::bigint,
  '无关班级端不能读取私有课件对象'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select is(
  (select count(*) from public.courseware_items),
  0::bigint,
  '家庭端不能读取课件记录'
);
select is(
  (select count(*) from public.courseware_targets),
  0::bigint,
  '家庭端不能读取课件发送目标'
);
select is(
  (select count(*) from public.courseware_returns),
  0::bigint,
  '家庭端不能读取课堂回传资料'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'courseware-private'),
  0::bigint,
  '家庭端不能读取私有课件对象'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000031', true);
select is(
  (select count(*) from public.courseware_items),
  0::bigint,
  '银行端不能读取课件'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000041', true);
select is(
  (select count(*) from public.courseware_items),
  0::bigint,
  '自治会端不能读取课件'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000051', true);
select is(
  (select count(*) from public.courseware_items),
  1::bigint,
  '管理端只按学校范围审计已发送课件'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    insert into public.courseware_items (
      title,
      subject,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      'RLS 写入测试课件',
      '数学',
      'RLS 写入测试课件.pdf',
      'courseware/30000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-000000000001',
      'application/pdf',
      1024
    )
  $$,
  '教师可以创建属于自己的课件记录'
);
select lives_ok(
  $$
    insert into public.courseware_items (
      title,
      subject,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      '50 MiB 边界课件',
      '数学',
      '50 MiB 边界课件.pdf',
      'courseware/30000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-000000000005',
      'application/pdf',
      52428800
    )
  $$,
  '数据库接受恰好 50 MiB 的课件记录'
);
select throws_ok(
  $$
    insert into public.courseware_items (
      title,
      subject,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      '超限课件',
      '数学',
      '超限课件.pdf',
      'courseware/30000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-000000000006',
      'application/pdf',
      52428801
    )
  $$,
  '23514',
  null,
  '数据库拒绝超过 50 MiB 的课件记录'
);
select throws_ok(
  $$
    insert into public.courseware_items (
      teacher_id,
      title,
      subject,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      '30000000-0000-0000-0000-000000000002',
      '伪造教师课件',
      '数学',
      '伪造教师课件.pdf',
      'courseware/30000000-0000-0000-0000-000000000001/63000000-0000-0000-0000-000000000002',
      'application/pdf',
      1024
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "courseware_items"',
  '教师不能伪造其他教师身份创建课件'
);
select lives_ok(
  $$
    select public.send_courseware(
      '60000000-0000-0000-0000-000000000001',
      array['20000000-0000-0000-0000-000000000002'::uuid]
    )
  $$,
  '教师可以把自己的课件发送到任教班级'
);
select throws_ok(
  $$
    select public.send_courseware(
      '60000000-0000-0000-0000-000000000001',
      array['20000000-0000-0000-0000-000000000003'::uuid]
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '教师不能把课件发送到未任教班级'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select lives_ok(
  $$
    select public.record_courseware_receipt(
      '61000000-0000-0000-0000-000000000001',
      'downloaded'
    )
  $$,
  '目标班级端可以回报已下载'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000012', true);
select throws_ok(
  $$
    select public.record_courseware_receipt(
      '61000000-0000-0000-0000-000000000001',
      'downloaded'
    )
  $$,
  'P0001',
  'FORBIDDEN',
  '无关班级端不能伪造课件下载回执'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select lives_ok(
  $$
    insert into public.courseware_returns (
      class_id,
      teacher_id,
      title,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'RLS 回传测试',
      'RLS 回传测试.png',
      'returns/20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/64000000-0000-0000-0000-000000000001',
      'image/png',
      1024
    )
  $$,
  '班级端可以向本班任课教师回传资料'
);
select throws_ok(
  $$
    insert into public.courseware_returns (
      class_id,
      teacher_id,
      title,
      original_filename,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      '20000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001',
      '伪造班级回传',
      '伪造班级回传.png',
      'returns/20000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000001/64000000-0000-0000-0000-000000000002',
      'image/png',
      1024
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "courseware_returns"',
  '班级端不能伪造其他班级回传'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'courseware-private',
      'courseware/30000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  '教师可以向自己的 UUID 对象路径上传'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'courseware-private',
      'courseware/30000000-0000-0000-0000-000000000002/65000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  '教师不能向其他教师对象路径上传'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'objects__delete__courseware_uploader'
  ),
  'DELETE',
  '课件对象补偿清理由专用 DELETE RLS 策略控制'
);
select ok(
  (
    select
      'authenticated' = any(roles)
      and qual like '%courseware-private%'
      and qual like '%has_role%'
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'objects__delete__courseware_uploader'
  ),
  '补偿删除策略只授权 authenticated 且校验私有桶与角色路径'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000011', true);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'courseware-private',
      'returns/20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000011'
    )
  $$,
  '班级端可以向本班任课教师的回传路径上传'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'courseware-private',
      'courseware/30000000-0000-0000-0000-000000000021/65000000-0000-0000-0000-000000000004',
      '30000000-0000-0000-0000-000000000021'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  '家庭端不能上传课件对象'
);

select * from finish();
rollback;
