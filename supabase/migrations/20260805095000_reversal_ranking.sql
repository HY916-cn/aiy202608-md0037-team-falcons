-- Targeted reversal RPC + preview.
-- Rules:
--   * Only admin of the same school may perform targeted reversals.
--   * Cannot reverse an operation that is already reversed.
--   * Cannot reverse a reversal_apply operation itself.
--   * Reversal is scoped to student_score / class_score / dolphin_wallet operations.
--   * A settled fine cannot be reversed here (must be cancelled via fine RPC before settle).
--   * The reversal itself creates a new operation with kind=reversal_apply,
--     is_reversal=true, linked via public.reversal_links.

create or replace function public.preview_reversal(target_operation_id uuid)
returns table (
  operation_id uuid,
  kind public.governance_operation_kind,
  status public.governance_operation_status,
  is_reversible boolean,
  reason_code text,
  projected_delta numeric,
  target_type public.governance_target_type,
  target_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  op public.operations;
  score_entry public.student_score_entries;
  class_entry public.class_score_entries;
  tx public.dolphin_transactions;
  code text;
  reversible boolean;
  delta numeric;
begin
  select * into op from public.operations where id = target_operation_id;
  if op.id is null then
    raise exception 'OPERATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.can_access_school(op.school_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not public.is_school_admin(op.school_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  reversible := true;
  code := 'ok';
  delta := null;

  if op.is_reversal or op.kind = 'reversal_apply' then
    reversible := false;
    code := 'REVERSAL_NOT_REVERSIBLE';
  elsif op.status = 'reversed' then
    reversible := false;
    code := 'ALREADY_REVERSED';
  elsif op.kind = 'student_score_apply' then
    select * into score_entry from public.student_score_entries where operation_id = op.id;
    if score_entry.id is null then
      reversible := false;
      code := 'ENTRY_NOT_FOUND';
    else
      delta := -score_entry.delta;
    end if;
  elsif op.kind = 'student_score_apply_batch' then
    select coalesce(sum(-delta), 0) into delta
    from public.student_score_entries where operation_id = op.id;
  elsif op.kind = 'class_score_apply' then
    select * into class_entry from public.class_score_entries where operation_id = op.id;
    if class_entry.id is null then
      reversible := false;
      code := 'ENTRY_NOT_FOUND';
    else
      delta := -class_entry.delta;
    end if;
  elsif op.kind in ('dolphin_grant', 'dolphin_deduct', 'dolphin_adjust') then
    select * into tx from public.dolphin_transactions where operation_id = op.id;
    if tx.id is null then
      reversible := false;
      code := 'TRANSACTION_NOT_FOUND';
    else
      delta := -tx.delta;
    end if;
  else
    reversible := false;
    code := 'KIND_NOT_REVERSIBLE';
  end if;

  return query select op.id, op.kind, op.status, reversible, code, delta, op.target_type, op.target_id;
end;
$$;

create or replace function public.apply_targeted_reversal(
  idempotency_key text,
  target_operation_id uuid,
  reversal_reason text
)
returns public.operations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reserve record;
  actor record;
  original public.operations;
  score_entry public.student_score_entries;
  class_entry public.class_score_entries;
  tx public.dolphin_transactions;
  account public.dolphin_accounts;
  new_balance numeric(12, 2);
  op_id uuid;
  reversal_op public.operations;
  canonical_payload jsonb;
  reversal_entry_id uuid;
  reversal_tx_id uuid;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 8 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if reversal_reason is null or char_length(btrim(reversal_reason)) not between 5 and 500 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select * into original from public.operations where id = target_operation_id for update;
  if original.id is null then
    raise exception 'OPERATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if original.is_reversal or original.kind = 'reversal_apply' then
    raise exception 'CANNOT_REVERSE_REVERSAL' using errcode = 'P0001';
  end if;
  if original.status = 'reversed' then
    raise exception 'ALREADY_REVERSED' using errcode = 'P0001';
  end if;

  select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
  from public._governance_actor_context(original.school_id) as ctx;
  if actor.actor_role is null or actor.actor_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'target_operation_id', target_operation_id,
    'reason', btrim(reversal_reason)
  );

  select r.operation_id, r.is_replay, r.is_conflict, r.is_pending, r.cached_response into reserve
  from public._governance_reserve_operation(idempotency_key, 'reversal_apply', canonical_payload) as r;
  if reserve.is_conflict then
    raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
  end if;
  if reserve.is_pending then
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if reserve.is_replay then
    select * into reversal_op from public.operations where id = reserve.operation_id;
    return reversal_op;
  end if;

  op_id := gen_random_uuid();

  if original.kind = 'student_score_apply' then
    select * into score_entry from public.student_score_entries where operation_id = original.id;
    if score_entry.id is null then
      raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
    end if;
    insert into public.student_score_entries (
      operation_id, student_id, category_id, delta, reason, is_reversal_entry, original_entry_id
    )
    values (
      op_id, score_entry.student_id, score_entry.category_id, -score_entry.delta,
      'reversal:' || original.id::text, true, score_entry.id
    )
    returning id into reversal_entry_id;
    update public.student_score_entries
    set is_reversed = true, reversed_by_operation_id = op_id
    where id = score_entry.id;
  elsif original.kind = 'student_score_apply_batch' then
    for score_entry in
      select * from public.student_score_entries where operation_id = original.id
    loop
      insert into public.student_score_entries (
        operation_id, student_id, category_id, delta, reason, is_reversal_entry, original_entry_id
      )
      values (
        op_id, score_entry.student_id, score_entry.category_id, -score_entry.delta,
        'reversal:' || original.id::text, true, score_entry.id
      );
      update public.student_score_entries
      set is_reversed = true, reversed_by_operation_id = op_id
      where id = score_entry.id;
    end loop;
  elsif original.kind = 'class_score_apply' then
    select * into class_entry from public.class_score_entries where operation_id = original.id;
    if class_entry.id is null then
      raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
    end if;
    insert into public.class_score_entries (
      operation_id, class_id, category_id, delta, reason, is_reversal_entry, original_entry_id
    )
    values (
      op_id, class_entry.class_id, class_entry.category_id, -class_entry.delta,
      'reversal:' || original.id::text, true, class_entry.id
    );
    update public.class_score_entries
    set is_reversed = true, reversed_by_operation_id = op_id
    where id = class_entry.id;
  elsif original.kind in ('dolphin_grant', 'dolphin_deduct', 'dolphin_adjust') then
    select * into tx from public.dolphin_transactions where operation_id = original.id;
    if tx.id is null then
      raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0001';
    end if;
    select * into account from public.dolphin_accounts where id = tx.account_id for update;
    new_balance := account.balance - tx.delta;
    if new_balance < 0 then
      raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
    end if;
    update public.dolphin_accounts
    set balance = new_balance, version = version + 1
    where id = account.id;
    reversal_tx_id := (public._governance_write_dolphin_transaction(
      op_id, account.id, 'reversal', -tx.delta, new_balance,
      'reversal:' || original.id::text, original.id
    )).id;
    update public.dolphin_transactions
    set is_reversed = true, reversed_by_operation_id = op_id
    where id = tx.id;
  else
    raise exception 'KIND_NOT_REVERSIBLE' using errcode = 'P0001';
  end if;

  perform public._governance_persist_operation(
    op_id,
    idempotency_key,
    'reversal_apply',
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    original.school_id,
    'operation',
    original.id,
    canonical_payload,
    jsonb_build_object(
      'operation_id', op_id,
      'reversed_operation_id', original.id,
      'reversal_entry_id', reversal_entry_id,
      'reversal_transaction_id', reversal_tx_id
    ),
    btrim(reversal_reason),
    true
  );

  insert into public.reversal_links (original_operation_id, reversal_operation_id)
  values (original.id, op_id);

  update public.operations
  set status = 'reversed', reversed_at = now(), reversed_by = op_id
  where id = original.id;

  perform public._governance_write_audit(
    op_id, original.school_id, actor.actor_role, 'operation.reverse', 'operation', original.id, 'success', canonical_payload
  );

  select * into reversal_op from public.operations where id = op_id;
  return reversal_op;
end;
$$;

revoke all on function public.preview_reversal(uuid) from public;
revoke all on function public.apply_targeted_reversal(text, uuid, text) from public;

grant execute on function public.preview_reversal(uuid) to authenticated;
grant execute on function public.apply_targeted_reversal(text, uuid, text) to authenticated;
