create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id),
  class_id uuid not null references public.classes (id),
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  due_at timestamptz not null,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and published_at is null)
    or (status <> 'draft' and published_at is not null)
  )
);

create index assignments__class_due_idx
  on public.assignments (class_id, due_at desc)
  where status = 'published';
create index assignments__teacher_updated_idx
  on public.assignments (teacher_id, updated_at desc);

create trigger assignments__set_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

create or replace function public.publish_assignment(target_assignment_id uuid)
returns public.assignments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.assignments;
begin
  update public.assignments
  set
    status = 'published',
    published_at = now()
  where id = target_assignment_id
    and teacher_id = (select auth.uid())
    and status = 'draft'
  returning * into result;

  if result.id is null then
    raise exception 'NOT_FOUND';
  end if;

  return result;
end;
$$;

alter table public.assignments enable row level security;

create policy assignments__select__authorized
on public.assignments for select to authenticated
using (
  teacher_id = (select auth.uid())
  or exists (
    select 1
    from public.classes as class
    where class.id = assignments.class_id
      and public.is_school_admin(class.school_id)
  )
  or (
    status = 'published'
    and (
      public.has_role('class_terminal', 'class', class_id)
      or (
        public.has_role('family', 'household')
        and public.can_access_class(class_id)
      )
    )
  )
);

create policy assignments__insert__teacher
on public.assignments for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and status = 'draft'
  and published_at is null
  and public.is_teacher_assigned_to_class((select auth.uid()), class_id)
);

create policy assignments__update__draft_owner
on public.assignments for update to authenticated
using (
  teacher_id = (select auth.uid())
  and status = 'draft'
)
with check (
  teacher_id = (select auth.uid())
  and public.is_teacher_assigned_to_class((select auth.uid()), class_id)
  and (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

revoke all on public.assignments from anon;
grant select, insert, update on public.assignments to authenticated;

revoke all on function public.publish_assignment(uuid) from public;
grant execute on function public.publish_assignment(uuid) to authenticated;
