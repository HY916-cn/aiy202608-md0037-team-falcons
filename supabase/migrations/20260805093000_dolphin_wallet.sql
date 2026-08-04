-- Dolphin coin wallet subsystem. Independent from student score & class score.
-- All wallet mutations are atomic and produce a paired public.dolphin_transactions row.
-- class_terminal must NOT be granted read on wallets/transactions.

create table public.dolphin_accounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students (id) on delete restrict,
  school_id uuid not null references public.schools (id) on delete restrict,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_dolphin_accounts__school
  on public.dolphin_accounts (school_id);

create trigger dolphin_accounts__set_updated_at
before update on public.dolphin_accounts
for each row execute function public.set_updated_at();

create type public.dolphin_transaction_kind as enum (
  'grant',
  'deduct',
  'adjust',
  'fine_settle',
  'reversal'
);

create table public.dolphin_transactions (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.operations (id),
  account_id uuid not null references public.dolphin_accounts (id),
  kind public.dolphin_transaction_kind not null,
  delta numeric(12, 2) not null check (delta <> 0),
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  reference_operation_id uuid references public.operations (id),
  is_reversed boolean not null default false,
  reversed_by_operation_id uuid references public.operations (id),
  created_at timestamptz not null default now()
);

create index idx_dolphin_transactions__account_created
  on public.dolphin_transactions (account_id, created_at desc);
create index idx_dolphin_transactions__reference
  on public.dolphin_transactions (reference_operation_id)
  where reference_operation_id is not null;

create or replace function public._governance_get_or_create_account(
  target_student_id uuid,
  target_school_id uuid
)
returns public.dolphin_accounts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  account public.dolphin_accounts;
begin
  select * into account from public.dolphin_accounts where student_id = target_student_id for update;
  if account.id is null then
    insert into public.dolphin_accounts (student_id, school_id)
    values (target_student_id, target_school_id)
    returning * into account;
    select * into account from public.dolphin_accounts where id = account.id for update;
  end if;
  return account;
end;
$$;

create or replace function public._governance_write_dolphin_transaction(
  operation_id uuid,
  account_id uuid,
  kind public.dolphin_transaction_kind,
  delta numeric,
  balance_after numeric,
  reason text,
  reference_operation_id uuid
)
returns public.dolphin_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tx public.dolphin_transactions;
begin
  insert into public.dolphin_transactions (
    operation_id, account_id, kind, delta, balance_after, reason, reference_operation_id
  )
  values (
    operation_id, account_id, kind, delta, balance_after, reason, reference_operation_id
  )
  returning * into tx;
  return tx;
end;
$$;

create or replace function public._governance_apply_dolphin_delta(
  kind public.governance_operation_kind,
  tx_kind public.dolphin_transaction_kind,
  action_name text,
  required_role public.app_role,
  idempotency_key text,
  target_student_id uuid,
  delta numeric,
  reason text
)
returns public.dolphin_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op record;
  actor record;
  account public.dolphin_accounts;
  target_school_id uuid;
  new_balance numeric(12, 2);
  tx public.dolphin_transactions;
  canonical_payload jsonb;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if delta is null or delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = 'P0001';
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

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(target_school_id) as ctx;
  if actor.actor_role is null or actor.actor_role <> required_role then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'student_id', target_student_id,
    'delta', delta,
    'reason', btrim(reason)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    kind,
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    target_school_id,
    'wallet',
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
    select * into tx from public.dolphin_transactions where operation_id = op.operation_id;
    return tx;
  end if;

  begin
    account := public._governance_get_or_create_account(target_student_id, target_school_id);
    new_balance := account.balance + delta;
    if new_balance < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;

    update public.dolphin_accounts
    set balance = new_balance, version = version + 1
    where id = account.id;

    tx := public._governance_write_dolphin_transaction(
      op.operation_id, account.id, tx_kind, delta, new_balance, btrim(reason), null
    );

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'operation_id', op.operation_id,
        'transaction_id', tx.id,
        'balance_after', new_balance
      )
    );

    perform public._governance_write_audit(
      op.operation_id, target_school_id, actor.actor_role, action_name, 'wallet', account.id, 'success', canonical_payload
    );

    return tx;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

create or replace function public.apply_dolphin_grant(
  idempotency_key text,
  target_student_id uuid,
  amount numeric,
  reason text
)
returns public.dolphin_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if amount is null or amount <= 0 or amount > 100000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  return public._governance_apply_dolphin_delta(
    'dolphin_grant',
    'grant',
    'dolphin.grant',
    'bank_operator',
    idempotency_key,
    target_student_id,
    amount,
    reason
  );
end;
$$;

create or replace function public.apply_dolphin_deduct(
  idempotency_key text,
  target_student_id uuid,
  amount numeric,
  reason text
)
returns public.dolphin_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if amount is null or amount <= 0 or amount > 100000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  return public._governance_apply_dolphin_delta(
    'dolphin_deduct',
    'deduct',
    'dolphin.deduct',
    'bank_operator',
    idempotency_key,
    target_student_id,
    -amount,
    reason
  );
end;
$$;

create or replace function public.apply_dolphin_adjust(
  idempotency_key text,
  target_student_id uuid,
  delta numeric,
  reason text
)
returns public.dolphin_transactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if delta is null or delta = 0 or delta < -100000 or delta > 100000 then
    raise exception 'INVALID_DELTA' using errcode = 'P0001';
  end if;
  return public._governance_apply_dolphin_delta(
    'dolphin_adjust',
    'adjust',
    'dolphin.adjust',
    'admin',
    idempotency_key,
    target_student_id,
    delta,
    reason
  );
end;
$$;

alter table public.dolphin_accounts enable row level security;
alter table public.dolphin_transactions enable row level security;

revoke all on public.dolphin_accounts from anon, authenticated;
revoke all on public.dolphin_transactions from anon, authenticated;

grant select on public.dolphin_accounts to authenticated;
grant select on public.dolphin_transactions to authenticated;

revoke all on function public._governance_get_or_create_account(uuid, uuid) from public;
revoke all on function public._governance_write_dolphin_transaction(uuid, uuid, public.dolphin_transaction_kind, numeric, numeric, text, uuid) from public;
revoke all on function public._governance_apply_dolphin_delta(public.governance_operation_kind, public.dolphin_transaction_kind, text, public.app_role, text, uuid, numeric, text) from public;
revoke all on function public.apply_dolphin_grant(text, uuid, numeric, text) from public;
revoke all on function public.apply_dolphin_deduct(text, uuid, numeric, text) from public;
revoke all on function public.apply_dolphin_adjust(text, uuid, numeric, text) from public;

grant execute on function public.apply_dolphin_grant(text, uuid, numeric, text) to authenticated;
grant execute on function public.apply_dolphin_deduct(text, uuid, numeric, text) to authenticated;
grant execute on function public.apply_dolphin_adjust(text, uuid, numeric, text) to authenticated;
