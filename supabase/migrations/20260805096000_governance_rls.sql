-- Governance RLS policies. Direct DML is denied for authenticated users; state
-- transitions must go through the SECURITY DEFINER RPCs. class_terminal must NOT be
-- able to read wallets or fine orders. admin reads audit_events, other roles cannot.

-- operations: participant or school admin can read.
create policy operations__select__participant_or_admin
on public.operations for select to authenticated
using (
  actor_id = auth.uid()
  or public.is_school_admin(school_id)
);

-- reversal_links: visible when either operation is visible via operations RLS.
create policy reversal_links__select__admin_or_participant
on public.reversal_links for select to authenticated
using (
  exists (
    select 1
    from public.operations as op
    where op.id = reversal_links.original_operation_id
      and (op.actor_id = auth.uid() or public.is_school_admin(op.school_id))
  )
  or exists (
    select 1
    from public.operations as op
    where op.id = reversal_links.reversal_operation_id
      and (op.actor_id = auth.uid() or public.is_school_admin(op.school_id))
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
using (public.can_access_class(class_id));

-- Class score appeals: appellant, class access (teacher/terminal/family/admin), council or admin.
create policy class_score_appeals__select__authorized
on public.class_score_appeals for select to authenticated
using (
  appellant_id = auth.uid()
  or exists (
    select 1
    from public.class_score_entries as entry
    join public.classes as class on class.id = entry.class_id
    where entry.id = class_score_appeals.entry_id
      and (
        public.can_access_class(entry.class_id)
        or public.has_role('council', 'school', class.school_id)
        or public.is_school_admin(class.school_id)
      )
  )
);

-- Dolphin accounts: bank_operator on school, admin on school, or family of that student.
-- class_terminal is intentionally excluded.
create policy dolphin_accounts__select__authorized
on public.dolphin_accounts for select to authenticated
using (
  public.is_school_admin(school_id)
  or public.has_role('bank_operator', 'school', school_id)
  or (
    public.has_role('family', 'household')
    and exists (
      select 1
      from public.household_students as household_student
      join public.role_assignments as assignment
        on assignment.scope_id = household_student.household_id
       and assignment.scope_type = 'household'
      where household_student.student_id = dolphin_accounts.student_id
        and assignment.user_id = auth.uid()
        and assignment.role = 'family'
    )
  )
);

create policy dolphin_transactions__select__authorized
on public.dolphin_transactions for select to authenticated
using (
  exists (
    select 1
    from public.dolphin_accounts as account
    where account.id = dolphin_transactions.account_id
      and (
        public.is_school_admin(account.school_id)
        or public.has_role('bank_operator', 'school', account.school_id)
        or (
          public.has_role('family', 'household')
          and exists (
            select 1
            from public.household_students as household_student
            join public.role_assignments as assignment
              on assignment.scope_id = household_student.household_id
             and assignment.scope_type = 'household'
            where household_student.student_id = account.student_id
              and assignment.user_id = auth.uid()
              and assignment.role = 'family'
          )
        )
      )
  )
);

-- Fine rules readable by anyone in the school.
create policy fine_rules__select__school
on public.fine_rules for select to authenticated
using (public.can_access_school(school_id));

-- Fine orders: same principals as wallet (no class_terminal).
create policy fine_orders__select__authorized
on public.fine_orders for select to authenticated
using (
  public.is_school_admin(school_id)
  or public.has_role('bank_operator', 'school', school_id)
  or (
    public.has_role('family', 'household')
    and exists (
      select 1
      from public.household_students as household_student
      join public.role_assignments as assignment
        on assignment.scope_id = household_student.household_id
       and assignment.scope_type = 'household'
      where household_student.student_id = fine_orders.student_id
        and assignment.user_id = auth.uid()
        and assignment.role = 'family'
    )
  )
);

create policy fine_order_events__select__authorized
on public.fine_order_events for select to authenticated
using (
  exists (
    select 1
    from public.fine_orders as fine_order
    where fine_order.id = fine_order_events.order_id
      and (
        public.is_school_admin(fine_order.school_id)
        or public.has_role('bank_operator', 'school', fine_order.school_id)
        or (
          public.has_role('family', 'household')
          and exists (
            select 1
            from public.household_students as household_student
            join public.role_assignments as assignment
              on assignment.scope_id = household_student.household_id
             and assignment.scope_type = 'household'
            where household_student.student_id = fine_order.student_id
              and assignment.user_id = auth.uid()
              and assignment.role = 'family'
          )
        )
      )
  )
);
