create table public.grade_report_sheets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id),
  class_id uuid not null references public.classes (id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  source text not null check (source in ('grid', 'csv', 'xlsx')),
  status public.content_status not null default 'draft'
    check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_grade_report_sheets__published_at check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

create table public.grade_report_columns (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.grade_report_sheets (id) on delete cascade,
  column_key text not null check (
    char_length(column_key) between 1 and 64
    and column_key ~ '^[a-z][a-z0-9_]*$'
  ),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position smallint not null check (position between 0 and 49),
  max_score numeric(7, 2) check (max_score > 0),
  created_at timestamptz not null default now(),
  constraint uq_grade_report_columns__sheet_key unique (sheet_id, column_key),
  constraint uq_grade_report_columns__sheet_name unique (sheet_id, name),
  constraint uq_grade_report_columns__sheet_position unique (sheet_id, position)
);

create table public.grade_report_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.grade_report_sheets (id) on delete cascade,
  student_id uuid not null references public.students (id),
  created_at timestamptz not null default now(),
  constraint uq_grade_report_rows__sheet_student unique (sheet_id, student_id)
);

create table public.grade_report_values (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.grade_report_rows (id) on delete cascade,
  column_id uuid not null references public.grade_report_columns (id) on delete cascade,
  score numeric(7, 2) not null check (score >= 0),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_grade_report_values__row_column unique (row_id, column_id)
);

create table public.grade_report_value_revisions (
  id uuid primary key default gen_random_uuid(),
  value_id uuid not null references public.grade_report_values (id),
  old_score numeric(7, 2) not null,
  new_score numeric(7, 2) not null,
  old_comment text not null,
  new_comment text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index idx_grade_report_sheets__class_published_at
  on public.grade_report_sheets (class_id, published_at desc)
  where status = 'published';
create index idx_grade_report_rows__student_id
  on public.grade_report_rows (student_id, sheet_id);
create index idx_grade_report_value_revisions__value_created_at
  on public.grade_report_value_revisions (value_id, created_at desc);

create trigger grade_report_sheets__set_updated_at
before update on public.grade_report_sheets
for each row execute function public.set_updated_at();

create trigger grade_report_values__set_updated_at
before update on public.grade_report_values
for each row execute function public.set_updated_at();

create or replace function public.is_grade_report_sheet_owner(target_sheet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_sheets as report_sheet
    where report_sheet.id = target_sheet_id
      and report_sheet.teacher_id = (select auth.uid())
  );
$$;

create or replace function public.is_grade_report_sheet_admin(target_sheet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_sheets as report_sheet
    join public.classes as class on class.id = report_sheet.class_id
    where report_sheet.id = target_sheet_id
      and public.is_school_admin(class.school_id)
  );
$$;

create or replace function public.can_access_published_grade_report_sheet(target_sheet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_sheets as report_sheet
    join public.grade_report_rows as report_row on report_row.sheet_id = report_sheet.id
    where report_sheet.id = target_sheet_id
      and report_sheet.status = 'published'
      and public.has_role('family', 'household')
      and public.can_access_student(report_row.student_id)
  );
$$;

create or replace function public.can_access_grade_report_row(target_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_rows as report_row
    join public.grade_report_sheets as report_sheet on report_sheet.id = report_row.sheet_id
    where report_row.id = target_row_id
      and (
        report_sheet.teacher_id = (select auth.uid())
        or (
          report_sheet.status = 'published'
          and public.has_role('family', 'household')
          and public.can_access_student(report_row.student_id)
        )
      )
  );
$$;

create or replace function public.can_access_grade_report_value(target_value_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_values as report_value
    where report_value.id = target_value_id
      and public.can_access_grade_report_row(report_value.row_id)
  );
$$;

create or replace function public.is_grade_report_value_owner(target_value_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grade_report_values as report_value
    join public.grade_report_rows as report_row on report_row.id = report_value.row_id
    join public.grade_report_sheets as report_sheet on report_sheet.id = report_row.sheet_id
    where report_value.id = target_value_id
      and report_sheet.teacher_id = (select auth.uid())
  );
$$;

create or replace function public.grade_report_sheet_payload(
  target_sheet_id uuid,
  target_student_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', sheet.id,
    'teacherId', sheet.teacher_id,
    'classId', sheet.class_id,
    'title', sheet.title,
    'subject', sheet.subject,
    'source', sheet.source,
    'status', sheet.status,
    'publishedAt', sheet.published_at,
    'createdAt', sheet.created_at,
    'updatedAt', sheet.updated_at,
    'columns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', report_column.id,
          'columnKey', report_column.column_key,
          'name', report_column.name,
          'position', report_column.position,
          'maxScore', report_column.max_score
        ) order by report_column.position
      )
      from public.grade_report_columns as report_column
      where report_column.sheet_id = sheet.id
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', report_row.id,
          'studentId', report_row.student_id,
          'values', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', report_value.id,
                'columnId', report_value.column_id,
                'score', report_value.score,
                'comment', report_value.comment
              ) order by report_column.position
            )
            from public.grade_report_values as report_value
            join public.grade_report_columns as report_column
              on report_column.id = report_value.column_id
            where report_value.row_id = report_row.id
          ), '[]'::jsonb)
        ) order by report_row.created_at, report_row.id
      )
      from public.grade_report_rows as report_row
      where report_row.sheet_id = sheet.id
        and (
          target_student_id is null
          or report_row.student_id = target_student_id
        )
    ), '[]'::jsonb)
  )
  from public.grade_report_sheets as sheet
  where sheet.id = target_sheet_id;
$$;

create or replace function public.save_grade_report_sheet_draft(
  target_sheet_id uuid,
  target_class_id uuid,
  sheet_title text,
  sheet_subject text,
  sheet_source text,
  normalized_columns jsonb,
  normalized_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_sheet_id uuid;
  column_count integer;
begin
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.is_teacher_assigned_to_class(actor_id, target_class_id) then
    raise exception 'FORBIDDEN';
  end if;
  if char_length(btrim(sheet_title)) not between 1 and 120
    or char_length(btrim(sheet_subject)) not between 1 and 60
    or sheet_source not in ('grid', 'csv', 'xlsx')
    or jsonb_typeof(normalized_columns) <> 'array'
    or jsonb_typeof(normalized_rows) <> 'array'
    or jsonb_array_length(normalized_columns) not between 1 and 50
    or jsonb_array_length(normalized_rows) not between 1 and 200 then
    raise exception 'VALIDATION_ERROR';
  end if;

  column_count := jsonb_array_length(normalized_columns);

  if exists (
    select 1
    from jsonb_array_elements(normalized_columns) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'column_key', '') !~ '^[a-z][a-z0-9_]{0,63}$'
      or char_length(btrim(coalesce(item.value ->> 'name', ''))) not between 1 and 80
      or jsonb_typeof(item.value -> 'position') <> 'number'
      or (item.value ->> 'position')::integer not between 0 and 49
      or (
        item.value ? 'max_score'
        and jsonb_typeof(item.value -> 'max_score') not in ('number', 'null')
      )
      or coalesce((item.value ->> 'max_score')::numeric, 1) <= 0
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if (
    select count(distinct item.value ->> 'column_key') <> column_count
      or count(distinct item.value ->> 'name') <> column_count
      or count(distinct (item.value ->> 'position')::integer) <> column_count
    from jsonb_array_elements(normalized_columns) as item(value)
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_rows) as report_row(value)
    where jsonb_typeof(report_row.value) <> 'object'
      or coalesce(report_row.value ->> 'student_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(report_row.value -> 'values') <> 'array'
      or jsonb_array_length(report_row.value -> 'values') <> column_count
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if (
    select count(distinct report_row.value ->> 'student_id')
      <> jsonb_array_length(normalized_rows)
    from jsonb_array_elements(normalized_rows) as report_row(value)
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_rows) as report_row(value)
    where not exists (
      select 1
      from public.students as student
      where student.id = (report_row.value ->> 'student_id')::uuid
        and student.class_id = target_class_id
    )
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_rows) as report_row(value)
    cross join lateral jsonb_array_elements(report_row.value -> 'values') as report_value(value)
    where jsonb_typeof(report_value.value) <> 'object'
      or coalesce(report_value.value ->> 'column_key', '') = ''
      or jsonb_typeof(report_value.value -> 'score') <> 'number'
      or (report_value.value ->> 'score')::numeric < 0
      or jsonb_typeof(report_value.value -> 'comment') <> 'string'
      or char_length(report_value.value ->> 'comment') > 1000
      or not exists (
        select 1
        from jsonb_array_elements(normalized_columns) as report_column(value)
        where report_column.value ->> 'column_key'
          = report_value.value ->> 'column_key'
      )
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_rows) as report_row(value)
    where (
      select count(distinct report_value.value ->> 'column_key')
      from jsonb_array_elements(report_row.value -> 'values') as report_value(value)
    ) <> column_count
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_rows) as report_row(value)
    cross join lateral jsonb_array_elements(report_row.value -> 'values') as report_value(value)
    join lateral (
      select report_column.value
      from jsonb_array_elements(normalized_columns) as report_column(value)
      where report_column.value ->> 'column_key'
        = report_value.value ->> 'column_key'
    ) as matched_column on true
    where matched_column.value ->> 'max_score' is not null
      and (report_value.value ->> 'score')::numeric
        > (matched_column.value ->> 'max_score')::numeric
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  if target_sheet_id is null then
    insert into public.grade_report_sheets (
      teacher_id,
      class_id,
      title,
      subject,
      source
    )
    values (
      actor_id,
      target_class_id,
      btrim(sheet_title),
      btrim(sheet_subject),
      sheet_source
    )
    returning id into saved_sheet_id;
  else
    select sheet.id
    into saved_sheet_id
    from public.grade_report_sheets as sheet
    where sheet.id = target_sheet_id
      and sheet.teacher_id = actor_id
      and sheet.status = 'draft'
    for update;

    if saved_sheet_id is null then
      if exists (
        select 1 from public.grade_report_sheets where id = target_sheet_id
      ) then
        raise exception 'NOT_FOUND';
      end if;
      insert into public.grade_report_sheets (
        id,
        teacher_id,
        class_id,
        title,
        subject,
        source
      )
      values (
        target_sheet_id,
        actor_id,
        target_class_id,
        btrim(sheet_title),
        btrim(sheet_subject),
        sheet_source
      )
      returning id into saved_sheet_id;
    else
      update public.grade_report_sheets
      set
        class_id = target_class_id,
        title = btrim(sheet_title),
        subject = btrim(sheet_subject),
        source = sheet_source
      where id = saved_sheet_id;

      delete from public.grade_report_values as report_value
      using public.grade_report_rows as report_row
      where report_value.row_id = report_row.id
        and report_row.sheet_id = saved_sheet_id;
      delete from public.grade_report_rows where sheet_id = saved_sheet_id;
      delete from public.grade_report_columns where sheet_id = saved_sheet_id;
    end if;
  end if;

  insert into public.grade_report_columns (
    sheet_id,
    column_key,
    name,
    position,
    max_score
  )
  select
    saved_sheet_id,
    report_column.value ->> 'column_key',
    btrim(report_column.value ->> 'name'),
    (report_column.value ->> 'position')::smallint,
    (report_column.value ->> 'max_score')::numeric
  from jsonb_array_elements(normalized_columns) as report_column(value);

  insert into public.grade_report_rows (sheet_id, student_id)
  select
    saved_sheet_id,
    (report_row.value ->> 'student_id')::uuid
  from jsonb_array_elements(normalized_rows) as report_row(value);

  insert into public.grade_report_values (
    row_id,
    column_id,
    score,
    comment
  )
  select
    stored_row.id,
    stored_column.id,
    (report_value.value ->> 'score')::numeric,
    report_value.value ->> 'comment'
  from jsonb_array_elements(normalized_rows) as report_row(value)
  cross join lateral jsonb_array_elements(report_row.value -> 'values') as report_value(value)
  join public.grade_report_rows as stored_row
    on stored_row.sheet_id = saved_sheet_id
    and stored_row.student_id = (report_row.value ->> 'student_id')::uuid
  join public.grade_report_columns as stored_column
    on stored_column.sheet_id = saved_sheet_id
    and stored_column.column_key = report_value.value ->> 'column_key';

  return public.grade_report_sheet_payload(saved_sheet_id);
end;
$$;

create or replace function public.publish_grade_report_sheet(
  target_sheet_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  published_sheet_id uuid;
begin
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select sheet.id
  into published_sheet_id
  from public.grade_report_sheets as sheet
  where sheet.id = target_sheet_id
    and sheet.teacher_id = actor_id
    and sheet.status = 'draft'
    and public.is_teacher_assigned_to_class(actor_id, sheet.class_id)
  for update;

  if published_sheet_id is null then
    raise exception 'NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.grade_report_columns where sheet_id = target_sheet_id
  ) or not exists (
    select 1 from public.grade_report_rows where sheet_id = target_sheet_id
  ) or exists (
    select 1
    from public.grade_report_rows as report_row
    cross join public.grade_report_columns as report_column
    left join public.grade_report_values as report_value
      on report_value.row_id = report_row.id
      and report_value.column_id = report_column.id
    where report_row.sheet_id = target_sheet_id
      and report_column.sheet_id = target_sheet_id
      and report_value.id is null
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  update public.grade_report_sheets
  set status = 'published', published_at = now()
  where id = published_sheet_id;

  return public.grade_report_sheet_payload(published_sheet_id);
end;
$$;

create or replace function public.revise_grade_report_value(
  target_value_id uuid,
  revised_score numeric,
  revised_comment text,
  revision_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_value_id uuid;
  current_score numeric;
  current_comment text;
  report_sheet_id uuid;
  allowed_max_score numeric;
begin
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if revised_score is null
    or revised_comment is null
    or revision_reason is null
    or revised_score < 0
    or char_length(revised_comment) > 1000
    or char_length(btrim(revision_reason)) not between 1 and 500 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select
    report_value.id,
    report_value.score,
    report_value.comment,
    report_sheet.id,
    report_column.max_score
  into
    current_value_id,
    current_score,
    current_comment,
    report_sheet_id,
    allowed_max_score
  from public.grade_report_values as report_value
  join public.grade_report_rows as report_row on report_row.id = report_value.row_id
  join public.grade_report_columns as report_column on report_column.id = report_value.column_id
  join public.grade_report_sheets as report_sheet on report_sheet.id = report_row.sheet_id
  where report_value.id = target_value_id
    and report_column.sheet_id = report_sheet.id
    and report_sheet.teacher_id = actor_id
    and report_sheet.status = 'published'
  for update of report_value;

  if current_value_id is null then
    raise exception 'NOT_FOUND';
  end if;
  if allowed_max_score is not null and revised_score > allowed_max_score then
    raise exception 'VALIDATION_ERROR';
  end if;
  if (current_score, current_comment)
    is not distinct from (revised_score, revised_comment) then
    return public.grade_report_sheet_payload(report_sheet_id);
  end if;

  insert into public.grade_report_value_revisions (
    value_id,
    old_score,
    new_score,
    old_comment,
    new_comment,
    reason,
    actor_id
  )
  values (
    current_value_id,
    current_score,
    revised_score,
    current_comment,
    revised_comment,
    btrim(revision_reason),
    actor_id
  );

  update public.grade_report_values
  set score = revised_score, comment = revised_comment
  where id = current_value_id;

  return public.grade_report_sheet_payload(report_sheet_id);
end;
$$;

create or replace function public.list_published_grade_report_sheets_for_student(
  target_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.has_role('family', 'household')
    or not public.can_access_student(target_student_id) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      public.grade_report_sheet_payload(report_sheet.id, target_student_id)
      order by report_sheet.published_at desc, report_sheet.id
    ),
    '[]'::jsonb
  )
  into result
  from public.grade_report_sheets as report_sheet
  where report_sheet.status = 'published'
    and exists (
      select 1
      from public.grade_report_rows as report_row
      where report_row.sheet_id = report_sheet.id
        and report_row.student_id = target_student_id
    );

  return result;
end;
$$;

alter table public.grade_report_sheets enable row level security;
alter table public.grade_report_columns enable row level security;
alter table public.grade_report_rows enable row level security;
alter table public.grade_report_values enable row level security;
alter table public.grade_report_value_revisions enable row level security;

create policy grade_report_sheets__select__authorized
on public.grade_report_sheets for select to authenticated
using (
  public.is_grade_report_sheet_owner(id)
  or public.is_grade_report_sheet_admin(id)
  or public.can_access_published_grade_report_sheet(id)
);

create policy grade_report_columns__select__authorized_metadata
on public.grade_report_columns for select to authenticated
using (
  public.is_grade_report_sheet_owner(sheet_id)
  or public.is_grade_report_sheet_admin(sheet_id)
  or public.can_access_published_grade_report_sheet(sheet_id)
);

create policy grade_report_rows__select__teacher_or_linked_family
on public.grade_report_rows for select to authenticated
using (
  public.can_access_grade_report_row(id)
);

create policy grade_report_values__select__teacher_or_linked_family
on public.grade_report_values for select to authenticated
using (
  public.can_access_grade_report_value(id)
);

create policy grade_report_value_revisions__select__sheet_owner
on public.grade_report_value_revisions for select to authenticated
using (
  public.is_grade_report_value_owner(value_id)
);

revoke all on public.grade_report_sheets from anon;
revoke all on public.grade_report_columns from anon;
revoke all on public.grade_report_rows from anon;
revoke all on public.grade_report_values from anon;
revoke all on public.grade_report_value_revisions from anon;

revoke all on public.grade_report_sheets from authenticated;
revoke all on public.grade_report_columns from authenticated;
revoke all on public.grade_report_rows from authenticated;
revoke all on public.grade_report_values from authenticated;
revoke all on public.grade_report_value_revisions from authenticated;

grant select on public.grade_report_sheets to authenticated;
grant select on public.grade_report_columns to authenticated;
grant select on public.grade_report_rows to authenticated;
grant select on public.grade_report_values to authenticated;
grant select on public.grade_report_value_revisions to authenticated;

revoke all on function public.grade_report_sheet_payload(uuid, uuid) from public;
revoke all on function public.is_grade_report_sheet_owner(uuid) from public;
revoke all on function public.is_grade_report_sheet_admin(uuid) from public;
revoke all on function public.can_access_published_grade_report_sheet(uuid) from public;
revoke all on function public.can_access_grade_report_row(uuid) from public;
revoke all on function public.can_access_grade_report_value(uuid) from public;
revoke all on function public.is_grade_report_value_owner(uuid) from public;
revoke all on function public.save_grade_report_sheet_draft(uuid, uuid, text, text, text, jsonb, jsonb) from public;
revoke all on function public.publish_grade_report_sheet(uuid) from public;
revoke all on function public.revise_grade_report_value(uuid, numeric, text, text) from public;
revoke all on function public.list_published_grade_report_sheets_for_student(uuid) from public;

grant execute on function public.save_grade_report_sheet_draft(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.publish_grade_report_sheet(uuid) to authenticated;
grant execute on function public.revise_grade_report_value(uuid, numeric, text, text) to authenticated;
grant execute on function public.list_published_grade_report_sheets_for_student(uuid) to authenticated;
grant execute on function public.is_grade_report_sheet_owner(uuid) to authenticated;
grant execute on function public.is_grade_report_sheet_admin(uuid) to authenticated;
grant execute on function public.can_access_published_grade_report_sheet(uuid) to authenticated;
grant execute on function public.can_access_grade_report_row(uuid) to authenticated;
grant execute on function public.can_access_grade_report_value(uuid) to authenticated;
grant execute on function public.is_grade_report_value_owner(uuid) to authenticated;
