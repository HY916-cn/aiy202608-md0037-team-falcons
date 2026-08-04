-- Fine subsystem: rules, orders, event log, state machine.
-- Orders flow: pending -> settled | cancelled. Settling deducts from wallet
-- atomically; cancellation is only allowed while pending. State transitions
-- happen exclusively through the SECURITY DEFINER RPCs; direct DML is forbidden.

create table public.fine_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  default_amount numeric(10, 2) not null check (default_amount > 0 and default_amount <= 100000),
  description text not null default '' check (char_length(description) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_fine_rules__school_slug unique (school_id, slug)
);

create index idx_fine_rules__school on public.fine_rules (school_id, is_active);
create trigger fine_rules__set_updated_at
before update on public.fine_rules
for each row execute function public.set_updated_at();

create type public.fine_order_status as enum (
  'pending',
  'settled',
  'cancelled'
);

create table public.fine_orders (
  id uuid primary key default gen_random_uuid(),
  create_operation_id uuid not null unique references public.operations (id),
  settle_operation_id uuid unique references public.operations (id),
  cancel_operation_id uuid unique references public.operations (id),
  school_id uuid not null references public.schools (id),
  student_id uuid not null references public.students (id),
  rule_id uuid not null references public.fine_rules (id),
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  status public.fine_order_status not null default 'pending',
  settlement_transaction_id uuid references public.dolphin_transactions (id),
  cancellation_note text check (cancellation_note is null or char_length(btrim(cancellation_note)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  cancelled_at timestamptz,
  constraint chk_fine_orders__terminal
    check (
      (status = 'pending' and settled_at is null and cancelled_at is null and settle_operation_id is null and cancel_operation_id is null)
      or (status = 'settled' and settled_at is not null and cancel_operation_id is null and settle_operation_id is not null)
      or (status = 'cancelled' and cancelled_at is not null and settle_operation_id is null and cancel_operation_id is not null)
    )
);

create index idx_fine_orders__student_status on public.fine_orders (student_id, status);
create index idx_fine_orders__school_status on public.fine_orders (school_id, status);
create trigger fine_orders__set_updated_at
before update on public.fine_orders
for each row execute function public.set_updated_at();

create table public.fine_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fine_orders (id),
  operation_id uuid not null references public.operations (id),
  from_status public.fine_order_status,
  to_status public.fine_order_status not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_fine_order_events__order_created
  on public.fine_order_events (order_id, created_at desc);

-- Manage fine rules (admin only). Handles create + update via the same RPC.
create or replace function public.manage_fine_rule(
  idempotency_key text,
  target_school_id uuid,
  slug text,
  display_name text,
  default_amount numeric,
  description text,
  is_active boolean
)
returns public.fine_rules
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  rule public.fine_rules;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if slug is null or slug !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'INVALID_SLUG' using errcode = 'P0001';
  end if;
  if display_name is null or char_length(btrim(display_name)) not between 1 and 60 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = 'P0001';
  end if;
  if default_amount is null or default_amount <= 0 or default_amount > 100000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if description is null or char_length(description) > 300 then
    raise exception 'INVALID_DESCRIPTION' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx;
  if actor.actor_role is null or actor.actor_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'school_id', target_school_id,
    'slug', slug,
    'display_name', btrim(display_name),
    'default_amount', default_amount,
    'description', description,
    'is_active', is_active
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'fine_rule_manage',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'fine_rule',
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
    select * into rule from public.fine_rules
    where school_id = target_school_id and slug = manage_fine_rule.slug;
    return rule;
  end if;

  begin
    insert into public.fine_rules (school_id, slug, display_name, default_amount, description, is_active)
    values (target_school_id, slug, btrim(display_name), default_amount, description, is_active)
    on conflict (school_id, slug) do update set
      display_name = excluded.display_name,
      default_amount = excluded.default_amount,
      description = excluded.description,
      is_active = excluded.is_active
    returning * into rule;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object('rule_id', rule.id, 'operation_id', op.operation_id)
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'fine_rule.manage', 'fine_rule', rule.id, 'success', canonical_payload
    );

    return rule;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.create_fine_order(
  idempotency_key text,
  target_student_id uuid,
  target_rule_id uuid,
  amount numeric,
  reason text
)
returns public.fine_orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  target_school_id uuid;
  rule public.fine_rules;
  order_row public.fine_orders;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if amount is null or amount <= 0 or amount > 100000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if reason is null or char_length(btrim(reason)) not between 1 and 200 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select class.school_id into target_school_id
  from public.students as student
  join public.classes as class on class.id = student.class_id
  where student.id = target_student_id;
  if target_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into rule from public.fine_rules where id = target_rule_id;
  if rule.id is null or rule.school_id <> target_school_id or not rule.is_active then
    raise exception 'RULE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx;
  if actor.actor_role is null or actor.actor_role <> 'bank_operator' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'student_id', target_student_id,
    'rule_id', target_rule_id,
    'amount', amount,
    'reason', btrim(reason)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'fine_create',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'fine_order',
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
    select * into order_row from public.fine_orders where create_operation_id = op.operation_id;
    return order_row;
  end if;

  begin
    insert into public.fine_orders (
      create_operation_id, school_id, student_id, rule_id, amount, reason
    )
    values (op.operation_id, target_school_id, target_student_id, target_rule_id, amount, btrim(reason))
    returning * into order_row;

    insert into public.fine_order_events (order_id, operation_id, from_status, to_status, detail)
    values (order_row.id, op.operation_id, null, 'pending', canonical_payload);

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object('order_id', order_row.id, 'operation_id', op.operation_id)
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'fine.create', 'fine_order', order_row.id, 'success', canonical_payload
    );

    return order_row;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.settle_fine_order(
  idempotency_key text,
  target_order_id uuid
)
returns public.fine_orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  order_row public.fine_orders;
  target_school_id uuid;
  account public.dolphin_accounts;
  new_balance numeric(12, 2);
  tx public.dolphin_transactions;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;

  select * into order_row from public.fine_orders where id = target_order_id for update;
  if order_row.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if order_row.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;

  target_school_id := order_row.school_id;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx;
  if actor.actor_role is null or actor.actor_role <> 'bank_operator' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object('order_id', target_order_id);

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'fine_settle',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'fine_order',
    target_order_id,
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
    select * into order_row from public.fine_orders where settle_operation_id = op.operation_id;
    return order_row;
  end if;

  begin
    account := public._governance_get_or_create_account(order_row.student_id, target_school_id);
    new_balance := account.balance - order_row.amount;
    if new_balance < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.dolphin_accounts
    set balance = new_balance, version = version + 1
    where id = account.id;

    tx := public._governance_write_dolphin_transaction(
      op.operation_id, account.id, 'fine_settle', -order_row.amount, new_balance,
      'fine:' || order_row.id::text, order_row.create_operation_id
    );

    update public.fine_orders
    set
      status = 'settled',
      settle_operation_id = op.operation_id,
      settlement_transaction_id = tx.id,
      settled_at = now()
    where id = target_order_id
    returning * into order_row;

    insert into public.fine_order_events (order_id, operation_id, from_status, to_status, detail)
    values (order_row.id, op.operation_id, 'pending', 'settled', jsonb_build_object('transaction_id', tx.id, 'balance_after', new_balance));

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'order_id', order_row.id,
        'transaction_id', tx.id,
        'operation_id', op.operation_id,
        'balance_after', new_balance
      )
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'fine.settle', 'fine_order', order_row.id, 'success', canonical_payload
    );

    return order_row;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.cancel_fine_order(
  idempotency_key text,
  target_order_id uuid,
  cancellation_note text
)
returns public.fine_orders
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  order_row public.fine_orders;
  target_school_id uuid;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if cancellation_note is null or char_length(btrim(cancellation_note)) not between 1 and 200 then
    raise exception 'INVALID_NOTE' using errcode = 'P0001';
  end if;

  select * into order_row from public.fine_orders where id = target_order_id for update;
  if order_row.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if order_row.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;

  target_school_id := order_row.school_id;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx;
  if actor.actor_role is null or actor.actor_role not in ('bank_operator', 'admin') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'order_id', target_order_id,
    'note', btrim(cancellation_note)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'fine_cancel',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'fine_order',
    target_order_id,
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
    select * into order_row from public.fine_orders where cancel_operation_id = op.operation_id;
    return order_row;
  end if;

  begin
    update public.fine_orders
    set
      status = 'cancelled',
      cancel_operation_id = op.operation_id,
      cancellation_note = btrim(cancellation_note),
      cancelled_at = now()
    where id = target_order_id
    returning * into order_row;

    insert into public.fine_order_events (order_id, operation_id, from_status, to_status, detail)
    values (order_row.id, op.operation_id, 'pending', 'cancelled', canonical_payload);

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object('order_id', order_row.id, 'operation_id', op.operation_id)
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, 'fine.cancel', 'fine_order', order_row.id, 'success', canonical_payload
    );

    return order_row;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

alter table public.fine_rules enable row level security;
alter table public.fine_orders enable row level security;
alter table public.fine_order_events enable row level security;

revoke all on public.fine_rules from anon, authenticated;
revoke all on public.fine_orders from anon, authenticated;
revoke all on public.fine_order_events from anon, authenticated;

grant select on public.fine_rules to authenticated;
grant select on public.fine_orders to authenticated;
grant select on public.fine_order_events to authenticated;

revoke all on function public.manage_fine_rule(text, uuid, text, text, numeric, text, boolean) from public;
revoke all on function public.create_fine_order(text, uuid, uuid, numeric, text) from public;
revoke all on function public.settle_fine_order(text, uuid) from public;
revoke all on function public.cancel_fine_order(text, uuid, text) from public;

grant execute on function public.manage_fine_rule(text, uuid, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.create_fine_order(text, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.settle_fine_order(text, uuid) to authenticated;
grant execute on function public.cancel_fine_order(text, uuid, text) to authenticated;
