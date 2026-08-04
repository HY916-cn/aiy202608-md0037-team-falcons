create type public.content_status as enum (
  'draft',
  'published',
  'withdrawn',
  'expired'
);

create table public.courseware_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  original_filename text not null check (
    char_length(original_filename) between 1 and 200
    and original_filename !~ '[\\/[:cntrl:]]'
  ),
  storage_path text not null unique check (
    storage_path ~ '^courseware/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courseware_targets (
  id uuid primary key default gen_random_uuid(),
  courseware_id uuid not null references public.courseware_items (id),
  class_id uuid not null references public.classes (id),
  sent_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (courseware_id, class_id)
);

create table public.courseware_receipts (
  target_id uuid not null references public.courseware_targets (id),
  device_id uuid not null default auth.uid() references public.profiles (id),
  received_at timestamptz not null default now(),
  downloaded_at timestamptz,
  primary key (target_id, device_id)
);

create table public.courseware_returns (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id),
  teacher_id uuid not null references public.profiles (id),
  operator_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  original_filename text not null check (
    char_length(original_filename) between 1 and 200
    and original_filename !~ '[\\/[:cntrl:]]'
  ),
  storage_path text not null unique check (
    storage_path ~ '^returns/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  ),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

create index courseware_items__teacher_created_idx
  on public.courseware_items (teacher_id, created_at desc);
create index courseware_targets__class_sent_idx
  on public.courseware_targets (class_id, sent_at desc)
  where withdrawn_at is null;
create index courseware_returns__teacher_created_idx
  on public.courseware_returns (teacher_id, created_at desc);
create index courseware_returns__class_created_idx
  on public.courseware_returns (class_id, created_at desc);

create trigger courseware_items__set_updated_at
before update on public.courseware_items
for each row execute function public.set_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'courseware-private',
  'courseware-private',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_courseware_owner(target_courseware_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courseware_items as item
    where item.id = target_courseware_id
      and item.teacher_id = (select auth.uid())
      and public.has_role('teacher', 'school')
  );
$$;

create or replace function public.is_teacher_assigned_to_class(
  target_teacher_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_class_assignments as assignment
    where assignment.teacher_id = target_teacher_id
      and assignment.class_id = target_class_id
  );
$$;

create or replace function public.can_read_courseware_target(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courseware_targets as target
    join public.courseware_items as item on item.id = target.courseware_id
    join public.classes as class on class.id = target.class_id
    where target.id = target_id
      and (
        item.teacher_id = (select auth.uid())
        or public.is_school_admin(class.school_id)
        or (
          target.withdrawn_at is null
          and item.status = 'published'
          and public.has_role('class_terminal', 'class', target.class_id)
        )
      )
  );
$$;

create or replace function public.can_read_courseware_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.courseware_items as item
      where item.storage_path = object_name
        and (
          item.teacher_id = (select auth.uid())
          or exists (
            select 1
            from public.courseware_targets as target
            join public.classes as class on class.id = target.class_id
            where target.courseware_id = item.id
              and target.withdrawn_at is null
              and item.status = 'published'
              and (
                public.has_role('class_terminal', 'class', target.class_id)
                or public.is_school_admin(class.school_id)
              )
          )
        )
    )
    or exists (
      select 1
      from public.courseware_returns as return_item
      join public.classes as class on class.id = return_item.class_id
      where return_item.storage_path = object_name
        and (
          return_item.teacher_id = (select auth.uid())
          or (
            return_item.operator_id = (select auth.uid())
            and public.has_role('class_terminal', 'class', return_item.class_id)
          )
          or public.is_school_admin(class.school_id)
        )
    );
$$;

create or replace function public.send_courseware(
  target_courseware_id uuid,
  target_class_ids uuid[]
)
returns setof public.courseware_targets
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(array_length(target_class_ids, 1), 0) not between 1 and 20 then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not public.is_courseware_owner(target_courseware_id) then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from unnest(target_class_ids) as requested_class_id
    where not public.is_teacher_assigned_to_class(
      (select auth.uid()),
      requested_class_id
    )
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.courseware_items
  set status = 'published'
  where id = target_courseware_id;

  update public.courseware_targets as existing_target
  set
    sent_at = now(),
    withdrawn_at = null
  where existing_target.courseware_id = target_courseware_id
    and existing_target.class_id = any(target_class_ids);

  insert into public.courseware_targets (courseware_id, class_id)
  select target_courseware_id, requested_class_id
  from unnest(target_class_ids) as requested_class_id
  where not exists (
    select 1
    from public.courseware_targets as existing_target
    where existing_target.courseware_id = target_courseware_id
      and existing_target.class_id = requested_class_id
  );

  return query
  select target.*
  from public.courseware_targets as target
  where target.courseware_id = target_courseware_id
    and target.class_id = any(target_class_ids);
end;
$$;

create or replace function public.record_courseware_receipt(
  target_courseware_target_id uuid,
  receipt_state text
)
returns public.courseware_receipts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.courseware_receipts;
begin
  if receipt_state not in ('received', 'downloaded') then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not public.can_read_courseware_target(target_courseware_target_id)
    or not exists (
      select 1
      from public.courseware_targets as target
      where target.id = target_courseware_target_id
        and public.has_role('class_terminal', 'class', target.class_id)
    ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.courseware_receipts (
    target_id,
    received_at,
    downloaded_at
  )
  values (
    target_courseware_target_id,
    now(),
    case when receipt_state = 'downloaded' then now() else null end
  )
  on conflict (target_id, device_id) do update set
    received_at = least(
      courseware_receipts.received_at,
      excluded.received_at
    ),
    downloaded_at = case
      when receipt_state = 'downloaded'
        then coalesce(courseware_receipts.downloaded_at, now())
      else courseware_receipts.downloaded_at
    end
  returning * into result;

  return result;
end;
$$;

alter table public.courseware_items enable row level security;
alter table public.courseware_targets enable row level security;
alter table public.courseware_receipts enable row level security;
alter table public.courseware_returns enable row level security;

create policy courseware_items__select__authorized
on public.courseware_items for select to authenticated
using (
  teacher_id = (select auth.uid())
  or exists (
    select 1
    from public.courseware_targets as target
    join public.classes as class on class.id = target.class_id
    where target.courseware_id = courseware_items.id
      and target.withdrawn_at is null
      and courseware_items.status = 'published'
      and (
        public.has_role('class_terminal', 'class', target.class_id)
        or public.is_school_admin(class.school_id)
      )
  )
);

create policy courseware_items__insert__teacher
on public.courseware_items for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.has_role('teacher', 'school')
  and storage_path like 'courseware/' || (select auth.uid())::text || '/%'
);

create policy courseware_items__update__owner
on public.courseware_items for update to authenticated
using (teacher_id = (select auth.uid()))
with check (
  teacher_id = (select auth.uid())
  and public.has_role('teacher', 'school')
);

create policy courseware_targets__select__authorized
on public.courseware_targets for select to authenticated
using (public.can_read_courseware_target(id));

create policy courseware_targets__insert__owner
on public.courseware_targets for insert to authenticated
with check (
  public.is_courseware_owner(courseware_id)
  and public.is_teacher_assigned_to_class(
    (select auth.uid()),
    courseware_targets.class_id
  )
);

create policy courseware_targets__update__owner
on public.courseware_targets for update to authenticated
using (public.is_courseware_owner(courseware_id))
with check (public.is_courseware_owner(courseware_id));

create policy courseware_receipts__select__authorized
on public.courseware_receipts for select to authenticated
using (
  device_id = (select auth.uid())
  or exists (
    select 1
    from public.courseware_targets as target
    join public.courseware_items as item on item.id = target.courseware_id
    where target.id = courseware_receipts.target_id
      and item.teacher_id = (select auth.uid())
  )
);

create policy courseware_receipts__insert__class_terminal
on public.courseware_receipts for insert to authenticated
with check (
  device_id = (select auth.uid())
  and exists (
    select 1
    from public.courseware_targets as target
    where target.id = courseware_receipts.target_id
      and public.can_read_courseware_target(target.id)
      and public.has_role('class_terminal', 'class', target.class_id)
  )
);

create policy courseware_receipts__update__class_terminal
on public.courseware_receipts for update to authenticated
using (device_id = (select auth.uid()))
with check (device_id = (select auth.uid()));

create policy courseware_returns__select__authorized
on public.courseware_returns for select to authenticated
using (
  teacher_id = (select auth.uid())
  or (
    operator_id = (select auth.uid())
    and public.has_role('class_terminal', 'class', class_id)
  )
  or exists (
    select 1
    from public.classes as class
    where class.id = courseware_returns.class_id
      and public.is_school_admin(class.school_id)
  )
);

create policy courseware_returns__insert__class_terminal
on public.courseware_returns for insert to authenticated
with check (
  operator_id = (select auth.uid())
  and public.has_role('class_terminal', 'class', class_id)
  and storage_path like
    'returns/' || class_id::text || '/' || teacher_id::text || '/%'
  and public.is_teacher_assigned_to_class(
    courseware_returns.teacher_id,
    courseware_returns.class_id
  )
);

create policy objects__select__courseware_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'courseware-private'
  and (
    public.can_read_courseware_object(name)
    or (
      name like 'courseware/' || (select auth.uid())::text || '/%'
      and public.has_role('teacher', 'school')
    )
    or (
      split_part(name, '/', 1) = 'returns'
      and public.has_role(
        'class_terminal',
        'class',
        split_part(name, '/', 2)::uuid
      )
      and public.is_teacher_assigned_to_class(
        split_part(name, '/', 3)::uuid,
        split_part(name, '/', 2)::uuid
      )
    )
  )
);

create policy objects__insert__courseware_teacher
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courseware-private'
  and name like 'courseware/' || (select auth.uid())::text || '/%'
  and public.has_role('teacher', 'school')
);

create policy objects__insert__courseware_return
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courseware-private'
  and split_part(name, '/', 1) = 'returns'
  and public.has_role(
    'class_terminal',
    'class',
    split_part(name, '/', 2)::uuid
  )
  and public.is_teacher_assigned_to_class(
    split_part(name, '/', 3)::uuid,
    split_part(name, '/', 2)::uuid
  )
);

create policy objects__delete__courseware_uploader
on storage.objects for delete to authenticated
using (
  bucket_id = 'courseware-private'
  and (
    (
      name like 'courseware/' || (select auth.uid())::text || '/%'
      and public.has_role('teacher', 'school')
    )
    or (
      split_part(name, '/', 1) = 'returns'
      and public.has_role(
        'class_terminal',
        'class',
        split_part(name, '/', 2)::uuid
      )
      and public.is_teacher_assigned_to_class(
        split_part(name, '/', 3)::uuid,
        split_part(name, '/', 2)::uuid
      )
    )
  )
);

revoke all on public.courseware_items from anon;
revoke all on public.courseware_targets from anon;
revoke all on public.courseware_receipts from anon;
revoke all on public.courseware_returns from anon;

grant select, insert, update on public.courseware_items to authenticated;
grant select, insert, update on public.courseware_targets to authenticated;
grant select, insert, update on public.courseware_receipts to authenticated;
grant select, insert on public.courseware_returns to authenticated;

revoke all on function public.is_courseware_owner(uuid) from public;
revoke all on function public.is_teacher_assigned_to_class(uuid, uuid) from public;
revoke all on function public.can_read_courseware_target(uuid) from public;
revoke all on function public.can_read_courseware_object(text) from public;
revoke all on function public.send_courseware(uuid, uuid[]) from public;
revoke all on function public.record_courseware_receipt(uuid, text) from public;

grant execute on function public.is_courseware_owner(uuid) to authenticated;
grant execute on function public.is_teacher_assigned_to_class(uuid, uuid) to authenticated;
grant execute on function public.can_read_courseware_target(uuid) to authenticated;
grant execute on function public.can_read_courseware_object(text) to authenticated;
grant execute on function public.send_courseware(uuid, uuid[]) to authenticated;
grant execute on function public.record_courseware_receipt(uuid, text) to authenticated;
