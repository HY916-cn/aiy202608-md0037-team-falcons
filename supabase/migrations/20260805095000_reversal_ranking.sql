-- Targeted reversal RPC + preview.
-- Rules:
--   * Student score reversals are allowed for the same teacher/class_terminal scope.
--   * Class score reversals are allowed for council in the same school.
--   * Wallet reversals are allowed for bank_operator in the same school.
--   * Cannot reverse an operation that is already reversed.
--   * Cannot reverse a reversal_apply operation itself.
--   * Reversal is scoped to student_score / class_score / dolphin_wallet operations.
--   * Fine reversal goes through public.reverse_fine_order().
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
    if not public._governance_can_manage_student_score(op.target_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    select * into score_entry from public.student_score_entries where operation_id = op.id;
    if score_entry.id is null then
      reversible := false;
      code := 'ENTRY_NOT_FOUND';
    else
      delta := -score_entry.delta;
    end if;
  elsif op.kind = 'student_score_apply_batch' then
    if not public._governance_can_manage_student_score(op.target_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    select sum(-delta) into delta
    from public.student_score_entries
    where operation_id = op.id;
    if delta is null then
      reversible := false;
      code := 'ENTRY_NOT_FOUND';
    end if;
  elsif op.kind in ('class_score_apply', 'class_score_appeal_resolve') then
    if not public._governance_can_manage_class_score(op.target_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
    if op.kind = 'class_score_apply' then
      select * into class_entry from public.class_score_entries where operation_id = op.id;
    else
      select reversal_entry.*
      into class_entry
      from public.class_score_appeals as appeal
      join public.class_score_entries as reversal_entry
        on reversal_entry.operation_id = appeal.reversal_operation_id
      where appeal.resolve_operation_id = op.id;
    end if;
    if class_entry.id is null then
      reversible := false;
      code := 'ENTRY_NOT_FOUND';
    else
      delta := -class_entry.delta;
    end if;
  elsif op.kind in ('dolphin_grant', 'dolphin_deduct', 'dolphin_adjust') then
    if not public.has_role('bank_operator', 'school', op.school_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
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
  op record;
  actor record;
  original public.operations;
  score_entry public.student_score_entries;
  class_entry public.class_score_entries;
  tx public.dolphin_transactions;
  account public.dolphin_accounts;
  new_balance numeric(12, 2);
  reversal_op public.operations;
  canonical_payload jsonb;
  reversal_entry_id uuid;
  reversal_tx_id uuid;
begin
  if idempotency_key is null or char_length(btrim(idempotency_key)) not between 16 and 128 then
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

  if exists (
    select 1
    from public.reversal_links as link
    where link.original_operation_id = original.id
  ) then
    raise exception 'ALREADY_REVERSED' using errcode = 'P0001';
  end if;

  if original.kind in ('student_score_apply', 'student_score_apply_batch') then
    select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
    from public._governance_actor_context(original.school_id) as ctx
    where ctx.actor_role = 'teacher'
       or (ctx.actor_role = 'class_terminal' and ctx.scope_type = 'class')
    limit 1;
    if actor.actor_role is null or not public._governance_can_manage_student_score(original.target_id) then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  elsif original.kind in ('class_score_apply', 'class_score_appeal_resolve') then
    select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
    from public._governance_actor_context(original.school_id) as ctx
    where ctx.actor_role = 'council'
      and ctx.scope_type = 'school'
      and ctx.scope_id = original.school_id
    limit 1;
    if actor.actor_role is null then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  elsif original.kind in ('dolphin_grant', 'dolphin_deduct', 'dolphin_adjust') then
    select ctx.actor_role, ctx.scope_type, ctx.scope_id into actor
    from public._governance_actor_context(original.school_id) as ctx
    where ctx.actor_role = 'bank_operator'
      and ctx.scope_type = 'school'
      and ctx.scope_id = original.school_id
    limit 1;
    if actor.actor_role is null then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  else
    raise exception 'KIND_NOT_REVERSIBLE' using errcode = 'P0001';
  end if;

  canonical_payload := jsonb_build_object(
    'target_operation_id', target_operation_id,
    'reason', btrim(reversal_reason)
  );

  select * into op
  from public._governance_begin_operation(
    idempotency_key,
    'reversal_apply',
    canonical_payload,
    actor.actor_role,
    actor.scope_type,
    actor.scope_id,
    original.school_id,
    'operation',
    original.id,
    btrim(reversal_reason),
    true
  );
  if op.is_conflict then
    raise exception 'IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = 'P0001';
  end if;
  if op.is_pending then
    raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if op.is_replay then
    select * into reversal_op from public.operations where id = op.operation_id;
    return reversal_op;
  end if;

  begin
    if original.kind = 'student_score_apply' then
      select * into score_entry from public.student_score_entries where operation_id = original.id;
      if score_entry.id is null then
        raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
      end if;
      insert into public.student_score_entries (
        operation_id, student_id, category_id, delta, reason, is_reversal_entry, original_entry_id
      )
      values (
        op.operation_id, score_entry.student_id, score_entry.category_id, -score_entry.delta,
        'reversal:' || original.id::text, true, score_entry.id
      )
      returning id into reversal_entry_id;
    elsif original.kind = 'student_score_apply_batch' then
      if not exists (
        select 1 from public.student_score_entries where operation_id = original.id
      ) then
        raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
      end if;
      for score_entry in
        select * from public.student_score_entries where operation_id = original.id
      loop
        insert into public.student_score_entries (
          operation_id, student_id, category_id, delta, reason, is_reversal_entry, original_entry_id
        )
        values (
          op.operation_id, score_entry.student_id, score_entry.category_id, -score_entry.delta,
          'reversal:' || original.id::text, true, score_entry.id
        );
      end loop;
    elsif original.kind in ('class_score_apply', 'class_score_appeal_resolve') then
      if original.kind = 'class_score_apply' then
        select * into class_entry from public.class_score_entries where operation_id = original.id;
      else
        select reversal_entry.*
        into class_entry
        from public.class_score_appeals as appeal
        join public.class_score_entries as reversal_entry
          on reversal_entry.operation_id = appeal.reversal_operation_id
        where appeal.resolve_operation_id = original.id;
      end if;
      if class_entry.id is null then
        raise exception 'ENTRY_NOT_FOUND' using errcode = 'P0001';
      end if;
      insert into public.class_score_entries (
        operation_id, class_id, category_id, delta, reason, is_reversal_entry, original_entry_id
      )
      values (
        op.operation_id, class_entry.class_id, class_entry.category_id, -class_entry.delta,
        'reversal:' || original.id::text, true, class_entry.id
      );
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
        op.operation_id, account.id, 'reversal', -tx.delta, new_balance,
        'reversal:' || original.id::text, original.id
      )).id;
    else
      raise exception 'KIND_NOT_REVERSIBLE' using errcode = 'P0001';
    end if;

    perform public._governance_succeed_operation(
      op.operation_id,
      jsonb_build_object(
        'operation_id', op.operation_id,
        'reversed_operation_id', original.id,
        'reversal_entry_id', reversal_entry_id,
        'reversal_transaction_id', reversal_tx_id
      )
    );

    insert into public.reversal_links (original_operation_id, reversal_operation_id)
    values (original.id, op.operation_id);

    update public.operations
    set status = 'reversed', reversed_at = now(), reversed_by = op.operation_id
    where id = original.id;

    perform public._governance_write_audit(
      op.operation_id, original.school_id, actor.actor_role, 'operation.reverse', 'operation', original.id, 'success', canonical_payload
    );

    select * into reversal_op from public.operations where id = op.operation_id;
    return reversal_op;
  exception
    when others then
      perform public._governance_fail_operation(op.operation_id, jsonb_build_object('error', SQLERRM));
      raise;
  end;
end;
$$;

revoke all on function public.preview_reversal(uuid) from public;
revoke all on function public.apply_targeted_reversal(text, uuid, text) from public;

grant execute on function public.preview_reversal(uuid) to authenticated;
grant execute on function public.apply_targeted_reversal(text, uuid, text) to authenticated;
