-- Governance core (B-BUNDLE-02): operations / idempotency / audit / reversal_links
-- All operations are recorded in public.operations. Idempotency uses a non-blocking
-- advisory lock keyed on the idempotency key hash; fingerprints are sha256 over a
-- canonicalized jsonb payload. All governance RPCs must be security definer, live in
-- public schema, derive actor/role from auth.uid(), and route through these helpers.

create type public.governance_operation_kind as enum (
  'student_score_apply',
  'student_score_apply_batch',
  'class_score_apply',
  'class_score_appeal_create',
  'class_score_appeal_resolve',
  'dolphin_grant',
  'dolphin_deduct',
  'dolphin_adjust',
  'fine_create',
  'fine_settle',
  'fine_cancel',
  'fine_rule_manage',
  'reversal_apply'
);

create type public.governance_operation_status as enum (
  'pending',
  'succeeded',
  'reversed',
  'failed'
);

create type public.governance_target_type as enum (
  'student',
  'class',
  'household',
  'wallet',
  'fine_order',
  'fine_rule',
  'operation'
);

create type public.governance_idempotency_status as enum (
  'reserved',
  'succeeded',
  'failed'
);

create type public.governance_audit_result as enum (
  'success',
  'denied',
  'failed'
);

create type public.governance_ledger_kind as enum (
  'student_score',
  'class_score',
  'dolphin_wallet',
  'fine'
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  kind public.governance_operation_kind not null,
  status public.governance_operation_status not null default 'pending',
  is_reversal boolean not null default false,
  actor_id uuid not null references public.profiles (id),
  actor_role public.app_role not null,
  scope_type public.app_scope_type not null,
  scope_id uuid not null,
  school_id uuid not null references public.schools (id),
  target_type public.governance_target_type not null,
  target_id uuid not null,
  idempotency_key text not null,
  fingerprint bytea not null,
  payload jsonb not null,
  response jsonb,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.operations (id),
  constraint uq_operations__idempotency_key unique (idempotency_key),
  constraint chk_operations__reason_len check (
    reason is null or char_length(btrim(reason)) between 1 and 500
  )
);

create index idx_operations__actor_created
  on public.operations (actor_id, created_at desc);
create index idx_operations__scope_created
  on public.operations (scope_type, scope_id, created_at desc);
create index idx_operations__target
  on public.operations (target_type, target_id, created_at desc);
create index idx_operations__kind_status
  on public.operations (kind, status);
create index idx_operations__school_created
  on public.operations (school_id, created_at desc);

create trigger operations__set_updated_at
before update on public.operations
for each row execute function public.set_updated_at();

create table public.idempotency_keys (
  key text primary key,
  fingerprint bytea not null,
  operation_id uuid references public.operations (id) on delete cascade,
  status public.governance_idempotency_status not null default 'reserved',
  response_snapshot jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_idempotency_keys__operation
  on public.idempotency_keys (operation_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references public.operations (id),
  actor_id uuid not null references public.profiles (id),
  actor_role public.app_role not null,
  school_id uuid not null references public.schools (id),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  target_type public.governance_target_type not null,
  target_id uuid not null,
  result public.governance_audit_result not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_events__school_created
  on public.audit_events (school_id, created_at desc);
create index idx_audit_events__actor_created
  on public.audit_events (actor_id, created_at desc);
create index idx_audit_events__target
  on public.audit_events (target_type, target_id, created_at desc);

create table public.reversal_links (
  original_operation_id uuid not null unique references public.operations (id),
  reversal_operation_id uuid not null unique references public.operations (id),
  created_at timestamptz not null default now(),
  primary key (original_operation_id, reversal_operation_id)
);

create index idx_reversal_links__reversal
  on public.reversal_links (reversal_operation_id);

-- Canonicalize jsonb to produce a deterministic key/order representation.
create or replace function public._governance_canonicalize_jsonb(input jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  value jsonb;
  result jsonb;
  element jsonb;
  array_result jsonb;
begin
  if input is null then
    return 'null'::jsonb;
  end if;

  if jsonb_typeof(input) = 'object' then
    result := '{}'::jsonb;
    for key in
      select k
      from jsonb_object_keys(input) as k
      order by k
    loop
      value := input -> key;
      result := result || jsonb_build_object(
        key,
        public._governance_canonicalize_jsonb(value)
      );
    end loop;
    return result;
  elsif jsonb_typeof(input) = 'array' then
    array_result := '[]'::jsonb;
    for element in
      select v
      from jsonb_array_elements(input) as v
    loop
      array_result := array_result
        || jsonb_build_array(public._governance_canonicalize_jsonb(element));
    end loop;
    return array_result;
  else
    return input;
  end if;
end;
$$;

create or replace function public._governance_fingerprint(
  kind public.governance_operation_kind,
  canonical_payload jsonb
)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(
    kind::text || '|' || (public._governance_canonicalize_jsonb(canonical_payload))::text,
    'sha256'
  );
$$;

create or replace function public._governance_try_lock_key(idempotency_key text)
returns boolean
language sql
volatile
set search_path = ''
as $$
  select pg_try_advisory_xact_lock(
    ('x' || substr(md5(idempotency_key), 1, 15))::bit(60)::bigint
  );
$$;

-- Resolve the governance role and school for the current auth.uid().
-- This must be called by each RPC to determine the actor's permissions.
create or replace function public._governance_actor_context(target_school_id uuid)
returns table (actor_role public.app_role, scope_type public.app_scope_type, scope_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select assignment.role, assignment.scope_type, assignment.scope_id
  from public.role_assignments as assignment
  where assignment.user_id = auth.uid()
    and public.scope_school_id(assignment.scope_type, assignment.scope_id) = target_school_id
  order by case assignment.role
    when 'admin' then 1
    when 'bank_operator' then 2
    when 'council' then 3
    when 'teacher' then 4
    when 'class_terminal' then 5
    when 'family' then 6
  end;
$$;

create or replace function public._governance_write_audit(
  target_operation_id uuid,
  target_school_id uuid,
  actor_role public.app_role,
  action text,
  target_type public.governance_target_type,
  target_id uuid,
  result public.governance_audit_result,
  detail jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_events (
    operation_id,
    actor_id,
    actor_role,
    school_id,
    action,
    target_type,
    target_id,
    result,
    detail
  )
  values (
    target_operation_id,
    auth.uid(),
    actor_role,
    target_school_id,
    action,
    target_type,
    target_id,
    result,
    coalesce(detail, '{}'::jsonb)
  );
$$;

-- New state machine helpers

-- Begins an operation, handling idempotency and creating a pending record.
create or replace function public._governance_begin_operation(
  p_idempotency_key text,
  p_kind public.governance_operation_kind,
  p_payload jsonb,
  p_actor_role public.app_role,
  p_actor_scope_type public.app_scope_type,
  p_actor_scope_id uuid,
  p_school_id uuid,
  p_target_type public.governance_target_type,
  p_target_id uuid,
  p_reason text,
  p_is_reversal boolean
)
returns table (
  operation_id uuid,
  is_replay boolean,
  is_conflict boolean,
  is_pending boolean,
  cached_response jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing record;
  new_fingerprint bytea;
  new_op_id uuid;
  canonical_payload jsonb;
begin
  if not public._governance_try_lock_key(p_idempotency_key) then
    return query select null::uuid, false, false, true, null::jsonb;
    return;
  end if;

  canonical_payload := public._governance_canonicalize_jsonb(p_payload);
  new_fingerprint := public._governance_fingerprint(p_kind, canonical_payload);

  select ik.key, ik.fingerprint, ik.operation_id, ik.status, ik.response_snapshot
  into existing
  from public.idempotency_keys as ik
  where ik.key = p_idempotency_key;

  if found then
    if existing.fingerprint is distinct from new_fingerprint then
      return query select existing.operation_id, false, true, false, null::jsonb;
      return;
    end if;

    if existing.status = 'succeeded' then
      return query select existing.operation_id, true, false, false, existing.response_snapshot;
      return;
    end if;

    if existing.status = 'failed' then
      -- Allow retry by deleting the old failed key and operation
      delete from public.operations where id = existing.operation_id;
      delete from public.idempotency_keys where key = p_idempotency_key;
    else -- 'reserved', another process is likely busy
      return query select existing.operation_id, false, false, true, null::jsonb;
      return;
    end if;
  end if;

  -- No existing non-failed key, proceed to create a pending operation
  insert into public.operations (
    id, kind, status, is_reversal, actor_id, actor_role, scope_type, scope_id,
    school_id, target_type, target_id, idempotency_key, fingerprint, payload, reason
  ) values (
    gen_random_uuid(), p_kind, 'pending', p_is_reversal, auth.uid(), p_actor_role, p_actor_scope_type, p_actor_scope_id,
    p_school_id, p_target_type, p_target_id, p_idempotency_key, new_fingerprint, canonical_payload, p_reason
  ) returning id into new_op_id;

  insert into public.idempotency_keys (key, fingerprint, operation_id, status)
  values (p_idempotency_key, new_fingerprint, new_op_id, 'reserved');

  return query select new_op_id, false, false, false, null::jsonb;
end;
$$;

create or replace function public._governance_succeed_operation(
  p_op_id uuid,
  p_response_snapshot jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op_key text;
begin
  update public.operations as op
  set status = 'succeeded', response = p_response_snapshot, updated_at = now()
  where op.id = p_op_id
  returning idempotency_key into op_key;

  if op_key is not null then
    update public.idempotency_keys as ik
    set status = 'succeeded', response_snapshot = p_response_snapshot, completed_at = now()
    where ik.key = op_key;
  end if;
end;
$$;

create or replace function public._governance_fail_operation(
  p_op_id uuid,
  p_error_details jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op_key text;
begin
  if p_op_id is not null then
    update public.operations as op
    set status = 'failed', response = p_error_details, updated_at = now()
    where op.id = p_op_id
    returning idempotency_key into op_key;

    if op_key is not null then
        update public.idempotency_keys as ik
        set status = 'failed', response_snapshot = p_error_details, completed_at = now()
        where ik.key = op_key;
    end if;
  end if;
end;
$$;

create or replace function public._governance_can_manage_student_score(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students as student
    where student.id = p_student_id
      and (
        exists (
          select 1
          from public.teacher_class_assignments as assignment
          where assignment.teacher_id = auth.uid()
            and assignment.class_id = student.class_id
        )
        or public.has_role('class_terminal', 'class', student.class_id)
      )
  );
$$;

create or replace function public._governance_can_view_student_governance(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._governance_can_manage_student_score(p_student_id)
    or exists (
      select 1
      from public.role_assignments as assignment
      join public.household_students as household_student
        on household_student.household_id = assignment.scope_id
      where assignment.user_id = auth.uid()
        and assignment.role = 'family'
        and assignment.scope_type = 'household'
        and household_student.student_id = p_student_id
    );
$$;

create or replace function public._governance_can_manage_class_score(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes as class
    where class.id = p_class_id
      and public.has_role('council', 'school', class.school_id)
  );
$$;

create or replace function public._governance_can_view_class_score(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classes as class
    where class.id = p_class_id
      and (
        exists (
          select 1
          from public.teacher_class_assignments as assignment
          where assignment.teacher_id = auth.uid()
            and assignment.class_id = class.id
        )
        or public.has_role('class_terminal', 'class', class.id)
        or public.has_role('council', 'school', class.school_id)
      )
  );
$$;

create or replace function public._governance_can_view_wallet(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students as student
    join public.classes as class on class.id = student.class_id
    where student.id = p_student_id
      and (
        public._governance_can_manage_student_score(student.id)
        or public.has_role('bank_operator', 'school', class.school_id)
        or exists (
          select 1
          from public.role_assignments as assignment
          join public.household_students as household_student
            on household_student.household_id = assignment.scope_id
          where assignment.user_id = auth.uid()
            and assignment.role = 'family'
            and assignment.scope_type = 'household'
            and household_student.student_id = student.id
        )
      )
  );
$$;

create or replace function public._governance_can_view_fine_order(
  p_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fine_orders as fine_order
    join public.operations as create_op on create_op.id = fine_order.create_operation_id
    where fine_order.id = p_order_id
      and (
        public.has_role('bank_operator', 'school', fine_order.school_id)
        or create_op.actor_id = auth.uid()
        or exists (
          select 1
          from public.role_assignments as assignment
          join public.household_students as household_student
            on household_student.household_id = assignment.scope_id
          where assignment.user_id = auth.uid()
            and assignment.role = 'family'
            and assignment.scope_type = 'household'
            and household_student.student_id = fine_order.student_id
        )
      )
  );
$$;

create or replace function public._governance_can_view_operation(
  p_target_type public.governance_target_type,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_target_type = 'student' then public._governance_can_view_student_governance(p_target_id)
    when p_target_type = 'class' then public._governance_can_view_class_score(p_target_id)
    when p_target_type = 'household' then public.can_access_household(p_target_id)
    when p_target_type = 'wallet' then public._governance_can_view_wallet(p_target_id)
    when p_target_type = 'fine_order' then public._governance_can_view_fine_order(p_target_id)
    when p_target_type = 'fine_rule' then public.has_role('bank_operator', 'school', p_target_id)
    when p_target_type = 'operation' then exists (
      select 1
      from public.operations as op
      where op.id = p_target_id
        and public._governance_can_view_operation(op.target_type, op.target_id)
    )
    else false
  end;
$$;


alter table public.operations enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_events enable row level security;
alter table public.reversal_links enable row level security;

revoke all on public.operations from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;
revoke all on public.reversal_links from anon, authenticated;

grant select on public.operations to authenticated;
grant select on public.reversal_links to authenticated;
grant select on public.audit_events to authenticated;

revoke all on function public._governance_canonicalize_jsonb(jsonb) from public;
revoke all on function public._governance_fingerprint(public.governance_operation_kind, jsonb) from public;
revoke all on function public._governance_try_lock_key(text) from public;
revoke all on function public._governance_actor_context(uuid) from public;
revoke all on function public._governance_write_audit(uuid, uuid, public.app_role, text, public.governance_target_type, uuid, public.governance_audit_result, jsonb) from public;
revoke all on function public._governance_begin_operation(text, public.governance_operation_kind, jsonb, public.app_role, public.app_scope_type, uuid, uuid, public.governance_target_type, uuid, text, boolean) from public;
revoke all on function public._governance_succeed_operation(uuid, jsonb) from public;
revoke all on function public._governance_fail_operation(uuid, jsonb) from public;
revoke all on function public._governance_can_manage_student_score(uuid) from public;
revoke all on function public._governance_can_view_student_governance(uuid) from public;
revoke all on function public._governance_can_manage_class_score(uuid) from public;
revoke all on function public._governance_can_view_class_score(uuid) from public;
revoke all on function public._governance_can_view_wallet(uuid) from public;
revoke all on function public._governance_can_view_fine_order(uuid) from public;
revoke all on function public._governance_can_view_operation(public.governance_target_type, uuid) from public;
