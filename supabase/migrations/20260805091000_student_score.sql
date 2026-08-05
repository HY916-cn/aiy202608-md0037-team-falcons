-- Student score subsystem (independent from class score & wallet).
-- All changes flow through public.apply_student_score / apply_student_score_batch.
-- Direct DML is denied for authenticated users; only the RPCs (SECURITY DEFINER)
-- can insert entries, keeping the audit + idempotency invariants intact.

create type public.student_score_category_kind as enum (
  'positive',
  'negative'
);

create table public.student_score_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  kind public.student_score_category_kind not null,
  default_delta numeric(9, 2) not null check (
    default_delta = trunc(default_delta)
    and default_delta <> 0
    and default_delta >= -1000
    and default_delta <= 1000
    and (
      (kind = 'positive' and default_delta > 0)
      or (kind = 'negative' and default_delta < 0)
    )
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_student_score_categories__school_slug unique (school_id, slug)
);

create index idx_student_score_categories__school
  on public.student_score_categories (school_id, is_active);
create trigger student_score_categories__set_updated_at
before update on public.student_score_categories
for each row execute function public.set_updated_at();

create table public.student_score_entries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations (id) on delete cascade,
  student_id uuid not null references public.students (id),
  category_id uuid not null references public.student_score_categories (id),
  delta numeric(9, 2) not null check (
    delta = trunc(delta)
    and delta <> 0
    and delta >= -1000
    and delta <= 1000
  ),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  applied_at timestamptz not null default now(),
  is_reversed boolean not null default false,
  reversed_by_operation_id uuid references public.operations (id),
  original_entry_id uuid references public.student_score_entries (id),
  is_reversal_entry boolean not null default false
);
create index idx_student_score_entries__operation
  on public.student_score_entries (operation_id);

create index idx_student_score_entries__student_applied
  on public.student_score_entries (student_id, applied_at desc);
create index idx_student_score_entries__category
  on public.student_score_entries (category_id, applied_at desc);
create index idx_student_score_entries__reversal
  on public.student_score_entries (original_entry_id)
  where original_entry_id is not null;

-- Aggregate views for weekly / monthly / total rankings. security_invoker=true
-- so RLS on underlying tables (students / student_score_entries) is respected.
create or replace view public.student_score_totals
with (security_invoker = true) as
select
  student.id as student_id,
  student.class_id,
  class.school_id,
  coalesce(sum(entry.delta), 0)::numeric(12, 2) as total_score
from public.students as student
join public.classes as class on class.id = student.class_id
left join public.student_score_entries as entry on entry.student_id = student.id
group by student.id, student.class_id, class.school_id;

create or replace view public.student_score_weekly
with (security_invoker = true) as
select
  student.id as student_id,
  student.class_id,
  class.school_id,
  date_trunc('week', entry.applied_at) as period_start,
  coalesce(sum(entry.delta), 0)::numeric(12, 2) as period_score
from public.students as student
join public.classes as class on class.id = student.class_id
left join public.student_score_entries as entry on entry.student_id = student.id
group by student.id, student.class_id, class.school_id, date_trunc('week', entry.applied_at);

create or replace view public.student_score_monthly
with (security_invoker = true) as
select
  student.id as student_id,
  student.class_id,
  class.school_id,
  date_trunc('month', entry.applied_at) as period_start,
  coalesce(sum(entry.delta), 0)::numeric(12, 2) as period_score
from public.students as student
join public.classes as class on class.id = student.class_id
left join public.student_score_entries as entry on entry.student_id = student.id
group by student.id, student.class_id, class.school_id, date_trunc('month', entry.applied_at);

-- Ranking function with tie support (rank() window).
create type public.student_ranking_scope as enum ('weekly', 'monthly', 'all_time');

create or replace function public.compute_student_ranking(
  target_class_id uuid,
  ranking_scope public.student_ranking_scope,
  reference_time timestamptz default now()
)
returns table (
  student_id uuid,
  display_name text,
  class_id uuid,
  period_start timestamptz,
  score numeric,
  rank_position bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public._governance_can_view_class_score(target_class_id)
    or exists (
      select 1
      from public.students as student
      where student.class_id = target_class_id
        and public.can_access_student(student.id)
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if ranking_scope = 'weekly' then
    return query
      select
        student.id,
        case
          when public._governance_can_view_class_score(target_class_id) then student.display_name
          else null::text
        end,
        student.class_id,
        date_trunc('week', reference_time),
        coalesce(sum(entry.delta) filter (
          where entry.applied_at >= date_trunc('week', reference_time)
            and entry.applied_at < date_trunc('week', reference_time) + interval '1 week'
        ), 0)::numeric(12, 2) as score,
        rank() over (
          order by coalesce(sum(entry.delta) filter (
            where entry.applied_at >= date_trunc('week', reference_time)
              and entry.applied_at < date_trunc('week', reference_time) + interval '1 week'
          ), 0) desc
        )
      from public.students as student
      left join public.student_score_entries as entry on entry.student_id = student.id
      where student.class_id = target_class_id
      group by student.id, student.display_name, student.class_id
      having public._governance_can_view_class_score(target_class_id)
        or public.can_access_student(student.id)
      order by rank_position, student.id;
  elsif ranking_scope = 'monthly' then
    return query
      select
        student.id,
        case
          when public._governance_can_view_class_score(target_class_id) then student.display_name
          else null::text
        end,
        student.class_id,
        date_trunc('month', reference_time),
        coalesce(sum(entry.delta) filter (
          where entry.applied_at >= date_trunc('month', reference_time)
            and entry.applied_at < date_trunc('month', reference_time) + interval '1 month'
        ), 0)::numeric(12, 2) as score,
        rank() over (
          order by coalesce(sum(entry.delta) filter (
            where entry.applied_at >= date_trunc('month', reference_time)
              and entry.applied_at < date_trunc('month', reference_time) + interval '1 month'
          ), 0) desc
        )
      from public.students as student
      left join public.student_score_entries as entry on entry.student_id = student.id
      where student.class_id = target_class_id
      group by student.id, student.display_name, student.class_id
      having public._governance_can_view_class_score(target_class_id)
        or public.can_access_student(student.id)
      order by rank_position, student.id;
  else
    return query
      select
        student.id,
        case
          when public._governance_can_view_class_score(target_class_id) then student.display_name
          else null::text
        end,
        student.class_id,
        null::timestamptz,
        coalesce(sum(entry.delta), 0)::numeric(12, 2) as score,
        rank() over (
          order by coalesce(sum(entry.delta), 0) desc
        )
      from public.students as student
      left join public.student_score_entries as entry on entry.student_id = student.id
      where student.class_id = target_class_id
      group by student.id, student.display_name, student.class_id
      having public._governance_can_view_class_score(target_class_id)
        or public.can_access_student(student.id)
      order by rank_position, student.id;
  end if;
end;
$$;

-- Internal writer used by both single-entry RPC and batch RPC.
create or replace function public._governance_write_student_score_entry(
  p_operation_id uuid,
  p_target_student_id uuid,
  p_target_category_id uuid,
  p_delta numeric,
  p_reason text
)
returns public.student_score_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entry public.student_score_entries;
begin
  insert into public.student_score_entries (
    operation_id,
    student_id,
    category_id,
    delta,
    reason
  )
  values (
    p_operation_id,
    p_target_student_id,
    p_target_category_id,
    p_delta,
    p_reason
  )
  returning * into entry;
  return entry;
end;
$$;

create or replace function public.manage_student_score_category(
  idempotency_key text,
  target_school_id uuid,
  target_category_id uuid,
  slug text,
  display_name text,
  kind public.student_score_category_kind,
  default_delta numeric,
  description text,
  is_active boolean
)
returns public.student_score_categories
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  category public.student_score_categories;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if slug is null or slug !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;
  if display_name is null or char_length(btrim(display_name)) not between 1 and 60 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = 'P0001';
  end if;
  if description is null or char_length(description) > 200 then
    raise exception 'INVALID_DESCRIPTION' using errcode = 'P0001';
  end if;
  if default_delta is null
    or default_delta <> trunc(default_delta)
    or default_delta = 0
    or default_delta < -1000
    or default_delta > 1000 then
    raise exception 'INVALID_DEFAULT_DELTA' using errcode = 'P0001';
  end if;
  if (kind = 'positive' and default_delta < 0)
    or (kind = 'negative' and default_delta > 0) then
    raise exception 'CATEGORY_DELTA_SIGN_MISMATCH' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id
  into actor
  from public._governance_actor_context(target_school_id) as ctx
  where ctx.actor_role = 'teacher'
  limit 1;
  if actor.actor_role is null or not public._governance_can_teacher_manage_school(target_school_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if target_category_id is not null then
    select * into category
    from public.student_score_categories
    where id = target_category_id;
    if category.id is null or category.school_id <> target_school_id then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  canonical_payload := jsonb_build_object(
    'school_id', target_school_id,
    'category_id', target_category_id,
    'slug', slug,
    'display_name', btrim(display_name),
    'kind', kind,
    'default_delta', default_delta,
    'description', description,
    'is_active', is_active
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'student_score_category_manage',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'student_score_category',
    target_school_id,
    null,
    false
  );
  if op.is_conflict then
    raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
  end if;
  if op.is_pending then
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if op.is_replay then
    if target_category_id is not null then
      select * into category from public.student_score_categories where id = target_category_id;
    else
      select * into category
      from public.student_score_categories
      where school_id = target_school_id
        and slug = manage_student_score_category.slug;
    end if;
    return category;
  end if;

  begin
    if target_category_id is null then
      insert into public.student_score_categories (
        school_id,
        slug,
        display_name,
        description,
        kind,
        default_delta,
        is_active
      )
      values (
        target_school_id,
        slug,
        btrim(display_name),
        description,
        kind,
        default_delta,
        is_active
      )
      returning * into category;
    else
      update public.student_score_categories
      set
        slug = manage_student_score_category.slug,
        display_name = btrim(manage_student_score_category.display_name),
        description = manage_student_score_category.description,
        kind = manage_student_score_category.kind,
        default_delta = manage_student_score_category.default_delta,
        is_active = manage_student_score_category.is_active
      where id = target_category_id
      returning * into category;
    end if;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'category_id', category.id,
        'operation_id', op.operation_id
      )
    );

    perform public._governance_write_audit(
      op.operation_id,
      target_school_id,
      actor.actor_role,
      'student_score_category.manage',
      'student_score_category',
      target_school_id,
      'success',
      canonical_payload
    );

    return category;
  exception
    when unique_violation then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', 'DUPLICATE_SLUG'));
      raise exception 'DUPLICATE_SLUG' using errcode = 'P0001';
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.apply_student_score(
  idempotency_key text,
  target_student_id uuid,
  target_category_id uuid,
  delta numeric,
  reason text
)
returns public.student_score_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  category record;
  target_class_id uuid;
  target_school_id uuid;
  entry public.student_score_entries;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if delta is null or delta <> trunc(delta) or delta = 0 or delta < -1000 or delta > 1000 then
    raise exception 'INVALID_DELTA' using errcode = 'P0001';
  end if;
  if reason is null or char_length(btrim(reason)) not between 1 and 200 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select student.class_id, class.school_id
  into target_class_id, target_school_id
  from public.students as student
  join public.classes as class on class.id = student.class_id
  where student.id = target_student_id;
  if target_class_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select cat.id, cat.school_id, cat.is_active
  into category
  from public.student_score_categories as cat
  where cat.id = target_category_id;
  if category.id is null or category.school_id <> target_school_id or not category.is_active then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if (category.kind = 'positive' and delta < 0)
    or (category.kind = 'negative' and delta > 0) then
    raise exception 'CATEGORY_DELTA_SIGN_MISMATCH' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id
  into actor
  from public._governance_actor_context(target_school_id) as ctx
  where (
    ctx.actor_role = 'teacher'
    or (ctx.actor_role = 'class_terminal' and ctx.scope_type = 'class' and ctx.scope_id = target_class_id)
  )
  limit 1;
  if actor.actor_role is null
    or not public._governance_can_manage_student_score(target_student_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'student_id', target_student_id,
    'category_id', target_category_id,
    'delta', delta,
    'reason', btrim(reason)
  );

  select * into op from public._governance_begin_operation(
    idempotency_key,
    'student_score_apply',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'student',
    target_student_id,
    null,
    false
  );

  if op.is_conflict then
    raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
  end if;
  if op.is_pending then
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if op.is_replay then
    select * into entry
    from public.student_score_entries
    where operation_id = op.operation_id
    order by applied_at, id
    limit 1;
    return entry;
  end if;

  begin
    entry := public._governance_write_student_score_entry(
      op.operation_id,
      target_student_id,
      target_category_id,
      delta,
      btrim(reason)
    );

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'entry_id', entry.id,
        'operation_id', op.operation_id,
        'delta', entry.delta
      )
    );

    perform public._governance_write_audit(
      op.operation_id,
      target_school_id,
      actor.actor_role,
      'student_score.apply',
      'student',
      target_student_id,
      'success',
      canonical_payload
    );

    return entry;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.apply_student_score_batch(
  idempotency_key text,
  entries jsonb,
  batch_reason text
)
returns setof public.student_score_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor_school uuid;
  actor record;
  item jsonb;
  entry_row public.student_score_entries;
  target_student_id uuid;
  target_category_id uuid;
  student_school uuid;
  category record;
  delta_value numeric;
  entry_reason text;
  canonical_payload jsonb;
  canonical_entries jsonb;
  response_ids jsonb := '[]'::jsonb;
  entry_count int;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if batch_reason is null or char_length(btrim(batch_reason)) not between 1 and 200 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;
  if entries is null or jsonb_typeof(entries) <> 'array' then
    raise exception 'INVALID_ENTRIES' using errcode = 'P0001';
  end if;

  entry_count := jsonb_array_length(entries);
  if entry_count < 1 or entry_count > 100 then
    raise exception 'BATCH_SIZE_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  canonical_entries := '[]'::jsonb;

  for item in select value from jsonb_array_elements(entries) as value
  loop
    target_student_id := (item ->> 'student_id')::uuid;
    target_category_id := (item ->> 'category_id')::uuid;
    delta_value := (item ->> 'delta')::numeric;
    entry_reason := coalesce(item ->> 'reason', batch_reason);

    if target_student_id is null then
      raise exception 'INVALID_ENTRY_STUDENT' using errcode = 'P0001';
    end if;
    if target_category_id is null then
      raise exception 'INVALID_ENTRY_CATEGORY' using errcode = 'P0001';
    end if;
    if delta_value is null or delta_value <> trunc(delta_value) or delta_value = 0 or delta_value < -1000 or delta_value > 1000 then
      raise exception 'INVALID_ENTRY_DELTA' using errcode = 'P0001';
    end if;
    if char_length(btrim(entry_reason)) not between 1 and 200 then
      raise exception 'INVALID_ENTRY_REASON' using errcode = 'P0001';
    end if;

    select class.school_id
    into student_school
    from public.students as student
    join public.classes as class on class.id = student.class_id
    where student.id = target_student_id;
    if student_school is null then
      raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if actor_school is null then
      actor_school := student_school;
    elsif actor_school <> student_school then
      raise exception 'BATCH_MIXED_SCHOOLS' using errcode = 'P0001';
    end if;

    select cat.id, cat.school_id, cat.is_active
    into category
    from public.student_score_categories as cat
    where cat.id = target_category_id;
    if category.id is null or category.school_id <> student_school or not category.is_active then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
    end if;
    if (category.kind = 'positive' and delta_value < 0)
      or (category.kind = 'negative' and delta_value > 0) then
      raise exception 'CATEGORY_DELTA_SIGN_MISMATCH' using errcode = 'P0001';
    end if;

    if not public._governance_can_manage_student_score(target_student_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;

    canonical_entries := canonical_entries || jsonb_build_array(jsonb_build_object(
      'student_id', target_student_id,
      'category_id', target_category_id,
      'delta', delta_value,
      'reason', btrim(entry_reason)
    ));
  end loop;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id
  into actor
  from public._governance_actor_context(actor_school) as ctx
  where (
    ctx.actor_role = 'teacher'
    or (
      ctx.actor_role = 'class_terminal'
      and ctx.scope_type = 'class'
      and ctx.scope_id = (
        select student.class_id
        from public.students as student
        where student.id = (canonical_entries -> 0 ->> 'student_id')::uuid
      )
    )
  )
  limit 1;
  if actor.actor_role is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'reason', btrim(batch_reason),
    'entries', canonical_entries
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'student_score_apply_batch',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    actor_school,
    'student',
    (canonical_entries -> 0 ->> 'student_id')::uuid,
    btrim(batch_reason),
    false
  );
  if op.is_conflict then
    raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
  end if;
  if op.is_pending then
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if op.is_replay then
    return query
      select *
      from public.student_score_entries
      where operation_id = op.operation_id
      order by applied_at, id;
    return;
  end if;

  begin
    for item in select value from jsonb_array_elements(canonical_entries) as value
    loop
      entry_row := public._governance_write_student_score_entry(
        op.operation_id,
        (item ->> 'student_id')::uuid,
        (item ->> 'category_id')::uuid,
        (item ->> 'delta')::numeric,
        item ->> 'reason'
      );
      response_ids := response_ids || to_jsonb(entry_row.id::text);
    end loop;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'operation_id', op.operation_id,
        'entry_ids', response_ids,
        'count', jsonb_array_length(canonical_entries)
      )
    );

    perform public._governance_write_audit(
      op.operation_id,
      actor_school,
      actor.actor_role,
      'student_score.apply_batch',
      'student',
      (canonical_entries -> 0 ->> 'student_id')::uuid,
      'success',
      canonical_payload
    );

    return query
      select *
      from public.student_score_entries
      where operation_id = op.operation_id
      order by applied_at, id;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

alter table public.student_score_categories enable row level security;
alter table public.student_score_entries enable row level security;

revoke all on public.student_score_categories from anon, authenticated;
revoke all on public.student_score_entries from anon, authenticated;

grant select on public.student_score_categories to authenticated;
grant select on public.student_score_entries to authenticated;
grant select on public.student_score_totals to authenticated;
grant select on public.student_score_weekly to authenticated;
grant select on public.student_score_monthly to authenticated;

revoke all on function public._governance_write_student_score_entry(uuid, uuid, uuid, numeric, text) from public;
revoke all on function public.manage_student_score_category(text, uuid, uuid, text, text, public.student_score_category_kind, numeric, text, boolean) from public;
revoke all on function public.apply_student_score(text, uuid, uuid, numeric, text) from public;
revoke all on function public.apply_student_score_batch(text, jsonb, text) from public;
revoke all on function public.compute_student_ranking(uuid, public.student_ranking_scope, timestamptz) from public;

grant execute on function public.manage_student_score_category(text, uuid, uuid, text, text, public.student_score_category_kind, numeric, text, boolean) to authenticated;
grant execute on function public.apply_student_score(text, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.apply_student_score_batch(text, jsonb, text) to authenticated;
grant execute on function public.compute_student_ranking(uuid, public.student_ranking_scope, timestamptz) to authenticated;
