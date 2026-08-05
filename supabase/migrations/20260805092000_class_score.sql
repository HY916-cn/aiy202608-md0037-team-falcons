-- Class score subsystem: independent from student score & wallet.
-- Class scores are applied by council members and can be appealed by class terminals.
-- Only council/admin can resolve appeals. Appeals reversing a change go through
-- apply_targeted_reversal, not through this table directly.

create table public.class_score_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_class_score_categories__school_slug unique (school_id, slug)
);

create table public.class_score_entries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.operations (id),
  class_id uuid not null references public.classes (id),
  category_id uuid not null references public.class_score_categories (id),
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
  original_entry_id uuid references public.class_score_entries (id),
  is_reversal_entry boolean not null default false
);

create index idx_class_score_entries__class_applied
  on public.class_score_entries (class_id, applied_at desc);
create index idx_class_score_entries__category
  on public.class_score_entries (category_id, applied_at desc);

create type public.class_score_appeal_status as enum (
  'pending',
  'accepted',
  'rejected'
);

create table public.class_score_appeals (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.class_score_entries (id),
  appellant_id uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status public.class_score_appeal_status not null default 'pending',
  resolver_id uuid references public.profiles (id),
  resolution_note text check (resolution_note is null or char_length(btrim(resolution_note)) between 1 and 500),
  reversal_operation_id uuid references public.operations (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  create_operation_id uuid not null unique references public.operations (id),
  resolve_operation_id uuid unique references public.operations (id),
  constraint chk_class_score_appeals__resolved
    check (
      (status = 'pending' and resolver_id is null and resolved_at is null and resolve_operation_id is null)
      or (status <> 'pending' and resolver_id is not null and resolved_at is not null and resolve_operation_id is not null)
    )
);

create index idx_class_score_appeals__entry on public.class_score_appeals (entry_id);
create index idx_class_score_appeals__status on public.class_score_appeals (status, created_at desc);

create or replace view public.class_score_totals
with (security_invoker = true) as
select
  class.id as class_id,
  class.school_id,
  coalesce(sum(entry.delta), 0)::numeric(12, 2) as total_score
from public.classes as class
left join public.class_score_entries as entry on entry.class_id = class.id
group by class.id, class.school_id;

create or replace function public._governance_write_class_score_entry(
  p_operation_id uuid,
  p_target_class_id uuid,
  p_target_category_id uuid,
  p_delta numeric,
  p_reason text
)
returns public.class_score_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  entry public.class_score_entries;
begin
  insert into public.class_score_entries (
    operation_id,
    class_id,
    category_id,
    delta,
    reason
  )
  values (
    p_operation_id,
    p_target_class_id,
    p_target_category_id,
    p_delta,
    p_reason
  )
  returning * into entry;
  return entry;
end;
$$;

create or replace function public.apply_class_score(
  idempotency_key text,
  target_class_id uuid,
  target_category_id uuid,
  delta numeric,
  reason text
)
returns public.class_score_entries
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  category record;
  target_school_id uuid;
  entry public.class_score_entries;
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

  select school_id into target_school_id
  from public.classes where id = target_class_id;
  if target_school_id is null then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select cat.id, cat.school_id, cat.is_active into category
  from public.class_score_categories as cat
  where cat.id = target_category_id;
  if category.id is null or category.school_id <> target_school_id or not category.is_active then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx
  where ctx.actor_role = 'council'
    and ctx.scope_type = 'school'
    and ctx.scope_id = target_school_id
  limit 1;
  if actor.actor_role is null or not public._governance_can_manage_class_score(target_class_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'class_id', target_class_id,
    'category_id', target_category_id,
    'delta', delta,
    'reason', btrim(reason)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'class_score_apply',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'class',
    target_class_id,
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
    select * into entry from public.class_score_entries where operation_id = op.operation_id;
    return entry;
  end if;

  begin
    entry := public._governance_write_class_score_entry(
      op.operation_id, target_class_id, target_category_id, delta, btrim(reason)
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
      op.operation_id, target_school_id, actor.actor_role, 'class_score.apply', 'class', target_class_id, 'success', canonical_payload
    );

    return entry;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.create_class_score_appeal(
  idempotency_key text,
  target_entry_id uuid,
  appeal_reason text
)
returns public.class_score_appeals
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  entry public.class_score_entries;
  target_school_id uuid;
  appeal public.class_score_appeals;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if appeal_reason is null or char_length(btrim(appeal_reason)) not between 5 and 500 then
    raise exception 'INVALID_APPEAL_REASON' using errcode = 'P0001';
  end if;

  select * into entry from public.class_score_entries where id = target_entry_id;
  if entry.id is null then
    raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if entry.is_reversed or entry.is_reversal_entry then
    raise exception 'ENTRY_NOT_APPEALABLE' using errcode = 'P0001';
  end if;

  select school_id into target_school_id from public.classes where id = entry.class_id;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx
  where (
    ctx.actor_role = 'teacher'
    or (ctx.actor_role = 'class_terminal' and ctx.scope_type = 'class' and ctx.scope_id = entry.class_id)
  )
  limit 1;
  if actor.actor_role is null
    or not (
      public._governance_can_manage_student_score(
        (
          select student.id
          from public.students as student
          where student.class_id = entry.class_id
          order by student.id
          limit 1
        )
      )
      or exists (
        select 1
        from public.teacher_class_assignments as assignment
        where assignment.teacher_id = auth.uid()
          and assignment.class_id = entry.class_id
      )
      or public.has_role('class_terminal', 'class', entry.class_id)
    ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.class_score_appeals
    where entry_id = target_entry_id and status = 'pending'
  ) then
    raise exception 'APPEAL_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'entry_id', target_entry_id,
    'reason', btrim(appeal_reason)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'class_score_appeal_create',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'class',
    entry.class_id,
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
    select * into appeal from public.class_score_appeals where create_operation_id = op.operation_id;
    return appeal;
  end if;

  begin
    insert into public.class_score_appeals (
      entry_id, appellant_id, reason, create_operation_id
    )
    values (
      target_entry_id, auth.uid(), btrim(appeal_reason), op.operation_id
    )
    returning * into appeal;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object('appeal_id', appeal.id, 'operation_id', op.operation_id)
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'class_score.appeal_create', 'class', entry.class_id, 'success', canonical_payload
    );

    return appeal;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.resolve_class_score_appeal(
  idempotency_key text,
  target_appeal_id uuid,
  accept boolean,
  p_resolution_note text
)
returns public.class_score_appeals
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  reversal_op record;
  actor record;
  appeal public.class_score_appeals;
  entry public.class_score_entries;
  target_school_id uuid;
  reversal_op_id uuid;
  reversal_payload jsonb;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if p_resolution_note is not null and char_length(btrim(p_resolution_note)) not between 1 and 500 then
    raise exception 'INVALID_RESOLUTION_NOTE' using errcode = 'P0001';
  end if;

  select * into appeal from public.class_score_appeals where id = target_appeal_id for update;
  if appeal.id is null then
    raise exception 'APPEAL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if appeal.status <> 'pending' then
    raise exception 'APPEAL_ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  select * into entry from public.class_score_entries where id = appeal.entry_id;
  select school_id into target_school_id from public.classes where id = entry.class_id;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx
  where ctx.actor_role = 'council'
    and ctx.scope_type = 'school'
    and ctx.scope_id = target_school_id
  limit 1;
  if actor.actor_role is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'appeal_id', target_appeal_id,
    'accept', accept,
    'note', coalesce(btrim(p_resolution_note), '')
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'class_score_appeal_resolve',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'class',
    entry.class_id,
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
    select * into appeal from public.class_score_appeals where resolve_operation_id = op.operation_id;
    return appeal;
  end if;

  begin
    if accept then
      reversal_payload := jsonb_build_object('appeal_id', target_appeal_id, 'entry_id', entry.id);

      select * into reversal_op
      from public._governance_begin_operation(
        idempotency_key || ':reversal',
        'reversal_apply',
        reversal_payload,
        actor.actor_role,
        actor.scope_type,
        actor.scope_id,
        target_school_id,
        'operation',
        entry.operation_id,
        'appeal accepted',
        true
      );
      if reversal_op.is_conflict then
        raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
      end if;
      if reversal_op.is_pending then
        raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
      end if;
      reversal_op_id := reversal_op.operation_id;

      insert into public.class_score_entries (
        operation_id, class_id, category_id, delta, reason, is_reversal_entry, original_entry_id
      )
      values (
        reversal_op_id, entry.class_id, entry.category_id, -entry.delta,
        'appeal:' || target_appeal_id::text, true, entry.id
      );

      perform public._governance_succeed_operation(
        reversal_op_id,
        jsonb_build_object('reversal_operation_id', reversal_op_id)
      );

      insert into public.reversal_links (original_operation_id, reversal_operation_id)
      values (entry.operation_id, reversal_op_id);

      update public.operations
      set status = 'reversed', reversed_at = now(), reversed_by = reversal_op_id
      where id = entry.operation_id;

      update public.class_score_entries
      set is_reversed = true, reversed_by_operation_id = reversal_op_id
      where id = entry.id;
    end if;

    update public.class_score_appeals
    set
      status = case when accept then 'accepted'::public.class_score_appeal_status else 'rejected'::public.class_score_appeal_status end,
      resolver_id = auth.uid(),
      resolution_note = nullif(btrim(p_resolution_note), ''),
      resolve_operation_id = op.operation_id,
      reversal_operation_id = reversal_op_id,
      resolved_at = now()
    where id = target_appeal_id
    returning * into appeal;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'appeal_id', appeal.id,
        'operation_id', op.operation_id,
        'reversal_operation_id', reversal_op_id,
        'status', appeal.status::text
      )
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'class_score.appeal_resolve', 'class', entry.class_id, 'success', canonical_payload
    );

    return appeal;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      if reversal_op_id is not null then
        perform public._governance_fail_operation(reversal_op_id, jsonb_build_object('error', SQLERRM));
      end if;
      raise;
  end;
end;
$$;

alter table public.class_score_categories enable row level security;
alter table public.class_score_entries enable row level security;
alter table public.class_score_appeals enable row level security;

revoke all on public.class_score_categories from anon, authenticated;
revoke all on public.class_score_entries from anon, authenticated;
revoke all on public.class_score_appeals from anon, authenticated;

grant select on public.class_score_categories to authenticated;
grant select on public.class_score_entries to authenticated;
grant select on public.class_score_appeals to authenticated;
grant select on public.class_score_totals to authenticated;

revoke all on function public._governance_write_class_score_entry(uuid, uuid, uuid, numeric, text) from public;
revoke all on function public.apply_class_score(text, uuid, uuid, numeric, text) from public;
revoke all on function public.create_class_score_appeal(text, uuid, text) from public;
revoke all on function public.resolve_class_score_appeal(text, uuid, boolean, text) from public;

grant execute on function public.apply_class_score(text, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.create_class_score_appeal(text, uuid, text) to authenticated;
grant execute on function public.resolve_class_score_appeal(text, uuid, boolean, text) to authenticated;
