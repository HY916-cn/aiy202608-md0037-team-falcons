-- Governance RLS policies. Direct DML is denied for authenticated users; state
-- transitions must go through the SECURITY DEFINER RPCs. class_terminal must NOT be
-- able to read wallets or fine orders. admin reads audit_events, other roles cannot.

-- operations: visible by target authorization scope rather than actor/admin identity.
create policy operations__select__authorized_target
on public.operations for select to authenticated
using (
  public._governance_can_view_operation(target_type, target_id)
);

-- reversal_links: visible when either operation is visible via operations RLS.
create policy reversal_links__select__authorized_target
on public.reversal_links for select to authenticated
using (
  exists (
    select 1
    from public.operations as op
    where op.id = reversal_links.original_operation_id
      and public._governance_can_view_operation(op.target_type, op.target_id)
  )
  or exists (
    select 1
    from public.operations as op
    where op.id = reversal_links.reversal_operation_id
      and public._governance_can_view_operation(op.target_type, op.target_id)
  )
);

-- audit_events: school admin only.
create policy audit_events__select__school_admin
on public.audit_events for select to authenticated
using (public.is_school_admin(school_id));

-- Student score categories: readable by anyone in the school.
create policy student_score_categories__select__school
on public.student_score_categories for select to authenticated
using (public.can_access_school(school_id));

-- Student score entries: visible to those that can access the student.
create policy student_score_entries__select__authorized
on public.student_score_entries for select to authenticated
using (public.can_access_student(student_id));

-- Class score categories.
create policy class_score_categories__select__school
on public.class_score_categories for select to authenticated
using (public.can_access_school(school_id));

-- Class score entries readable by class access.
create policy class_score_entries__select__authorized
on public.class_score_entries for select to authenticated
using (public._governance_can_view_class_score(class_id));

-- Class score appeals: appellant, class access (teacher/terminal/family/admin), council or admin.
create policy class_score_appeals__select__authorized
on public.class_score_appeals for select to authenticated
using (
  appellant_id = auth.uid()
  or exists (
    select 1
    from public.class_score_entries as entry
    where entry.id = class_score_appeals.entry_id
      and public._governance_can_view_class_score(entry.class_id)
  )
);

-- Dolphin accounts: teacher on authorized student, bank_operator, or family.
create policy dolphin_accounts__select__authorized
on public.dolphin_accounts for select to authenticated
using (public._governance_can_view_wallet(student_id));

create policy dolphin_transactions__select__authorized
on public.dolphin_transactions for select to authenticated
using (
  exists (
    select 1
    from public.dolphin_accounts as account
    where account.id = dolphin_transactions.account_id
      and public._governance_can_view_wallet(account.student_id)
  )
);

-- Fine rules readable by anyone in the school.
create policy fine_rules__select__school
on public.fine_rules for select to authenticated
using (public.can_access_school(school_id));

-- Fine orders: bank_operator, creating teacher, or bound family.
create policy fine_orders__select__authorized
on public.fine_orders for select to authenticated
using (public._governance_can_view_fine_order(id));

create policy fine_order_events__select__authorized
on public.fine_order_events for select to authenticated
using (
  exists (
    select 1
    from public.fine_orders as fine_order
    where fine_order.id = fine_order_events.order_id
      and public._governance_can_view_fine_order(fine_order.id)
  )
);
