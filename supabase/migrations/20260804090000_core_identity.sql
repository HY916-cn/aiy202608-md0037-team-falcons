create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum (
  'teacher',
  'class_terminal',
  'family',
  'bank_operator',
  'council',
  'admin'
);

create type public.app_scope_type as enum ('school', 'class', 'household');
create type public.profile_status as enum ('active', 'disabled');
create type public.device_binding_status as enum ('active', 'disabled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint uq_schools__name unique (name)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete restrict,
  grade text not null check (char_length(trim(grade)) between 1 and 40),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint uq_classes__school_id_grade_name unique (school_id, grade, name)
);

create index idx_classes__school_id on public.classes (school_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  student_no text not null,
  class_id uuid not null references public.classes (id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_students__student_no unique (student_no)
);

create index idx_students__class_id on public.students (class_id);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_type text not null check (member_type in ('guardian', 'student')),
  created_at timestamptz not null default now(),
  constraint pk_household_members primary key (household_id, user_id)
);

create index idx_household_members__user_id
  on public.household_members (user_id);

create table public.household_students (
  household_id uuid not null references public.households (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pk_household_students primary key (household_id, student_id)
);

create index idx_household_students__student_id
  on public.household_students (student_id);

create table public.role_assignments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  scope_type public.app_scope_type not null,
  scope_id uuid not null,
  created_at timestamptz not null default now(),
  constraint pk_role_assignments primary key (user_id, role, scope_type, scope_id)
);

create index idx_role_assignments__scope
  on public.role_assignments (scope_type, scope_id, role);

create table public.teacher_class_assignments (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint pk_teacher_class_assignments primary key (teacher_id, class_id, subject)
);

create index idx_teacher_class_assignments__class_id
  on public.teacher_class_assignments (class_id);

create table public.class_device_bindings (
  device_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  status public.device_binding_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_class_device_bindings primary key (device_id, class_id)
);

create unique index uq_class_device_bindings__active_device
  on public.class_device_bindings (device_id)
  where status = 'active';

alter table public.profiles rename constraint profiles_pkey to pk_profiles;
alter table public.schools rename constraint schools_pkey to pk_schools;
alter table public.classes rename constraint classes_pkey to pk_classes;
alter table public.students rename constraint students_pkey to pk_students;
alter table public.households rename constraint households_pkey to pk_households;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles__set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger students__set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger class_device_bindings__set_updated_at
before update on public.class_device_bindings
for each row execute function public.set_updated_at();

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '演示用户')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_users__create_profile
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create function public.validate_role_assignment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  scope_exists boolean;
begin
  scope_exists := case new.scope_type
    when 'school' then exists (
      select 1 from public.schools where id = new.scope_id
    )
    when 'class' then exists (
      select 1 from public.classes where id = new.scope_id
    )
    when 'household' then exists (
      select 1 from public.households where id = new.scope_id
    )
  end;

  if not scope_exists then
    raise exception 'ROLE_SCOPE_NOT_FOUND' using errcode = '23503';
  end if;

  if new.role = 'class_terminal' and new.scope_type <> 'class' then
    raise exception 'CLASS_TERMINAL_SCOPE_MUST_BE_CLASS' using errcode = '23514';
  end if;

  if new.role = 'family' and new.scope_type <> 'household' then
    raise exception 'FAMILY_SCOPE_MUST_BE_HOUSEHOLD' using errcode = '23514';
  end if;

  if new.role in ('bank_operator', 'admin') and new.scope_type <> 'school' then
    raise exception 'ROLE_SCOPE_MUST_BE_SCHOOL' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger role_assignments__validate_scope
before insert or update on public.role_assignments
for each row execute function public.validate_role_assignment_scope();

create function public.has_role(
  required_role public.app_role,
  required_scope_type public.app_scope_type default null,
  required_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_assignments as assignment
    where assignment.user_id = auth.uid()
      and assignment.role = required_role
      and (required_scope_type is null or assignment.scope_type = required_scope_type)
      and (required_scope_id is null or assignment.scope_id = required_scope_id)
  );
$$;

create function public.scope_school_id(
  target_scope_type public.app_scope_type,
  target_scope_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case target_scope_type
    when 'school' then target_scope_id
    when 'class' then (
      select class.school_id
      from public.classes as class
      where class.id = target_scope_id
    )
    when 'household' then (
      select class.school_id
      from public.household_students as household_student
      join public.students as student on student.id = household_student.student_id
      join public.classes as class on class.id = student.class_id
      where household_student.household_id = target_scope_id
      order by class.school_id
      limit 1
    )
  end;
$$;

create function public.is_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin', 'school', target_school_id);
$$;

create function public.can_access_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_assignments as assignment
    where assignment.user_id = auth.uid()
      and public.scope_school_id(assignment.scope_type, assignment.scope_id) = target_school_id
  );
$$;

create function public.can_access_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.teacher_class_assignments as assignment
      where assignment.teacher_id = auth.uid()
        and assignment.class_id = target_class_id
    )
    or public.has_role('class_terminal', 'class', target_class_id)
    or exists (
      select 1
      from public.class_device_bindings as binding
      where binding.device_id = auth.uid()
        and binding.class_id = target_class_id
        and binding.status = 'active'
    )
    or exists (
      select 1
      from public.role_assignments as assignment
      join public.household_students as household_student
        on household_student.household_id = assignment.scope_id
      join public.students as student on student.id = household_student.student_id
      where assignment.user_id = auth.uid()
        and assignment.role = 'family'
        and assignment.scope_type = 'household'
        and student.class_id = target_class_id
    )
    or exists (
      select 1
      from public.classes as class
      join public.role_assignments as assignment
        on assignment.scope_type = 'school'
       and assignment.scope_id = class.school_id
      where class.id = target_class_id
        and assignment.user_id = auth.uid()
        and assignment.role in ('bank_operator', 'council', 'admin')
    )
    or public.has_role('council', 'class', target_class_id);
$$;

create function public.can_access_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students as student
    where student.id = target_student_id
      and (
        exists (
          select 1
          from public.teacher_class_assignments as assignment
          where assignment.teacher_id = auth.uid()
            and assignment.class_id = student.class_id
        )
        or public.has_role('class_terminal', 'class', student.class_id)
        or exists (
          select 1
          from public.class_device_bindings as binding
          where binding.device_id = auth.uid()
            and binding.class_id = student.class_id
            and binding.status = 'active'
        )
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
        or exists (
          select 1
          from public.classes as class
          where class.id = student.class_id
            and public.is_school_admin(class.school_id)
        )
      )
  );
$$;

create function public.can_access_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role('family', 'household', target_household_id)
    or exists (
      select 1
      from public.household_students as household_student
      join public.students as student on student.id = household_student.student_id
      join public.classes as class on class.id = student.class_id
      where household_student.household_id = target_household_id
        and public.is_school_admin(class.school_id)
    );
$$;

create function public.user_belongs_to_school(
  target_user_id uuid,
  target_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.role_assignments as assignment
      where assignment.user_id = target_user_id
        and public.scope_school_id(assignment.scope_type, assignment.scope_id) = target_school_id
    )
    or exists (
      select 1
      from public.teacher_class_assignments as assignment
      join public.classes as class on class.id = assignment.class_id
      where assignment.teacher_id = target_user_id
        and class.school_id = target_school_id
    );
$$;

create function public.can_access_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.role_assignments as administrator
      where administrator.user_id = auth.uid()
        and administrator.role = 'admin'
        and administrator.scope_type = 'school'
        and public.user_belongs_to_school(target_user_id, administrator.scope_id)
    );
$$;

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.role_assignments enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_students enable row level security;
alter table public.class_device_bindings enable row level security;

create policy profiles__select__self_or_school_admin
on public.profiles for select to authenticated
using (public.can_access_profile(id));

create policy schools__select__assigned_scope
on public.schools for select to authenticated
using (public.can_access_school(id));

create policy classes__select__assigned_scope
on public.classes for select to authenticated
using (public.can_access_class(id));

create policy students__select__authorized_scope
on public.students for select to authenticated
using (public.can_access_student(id));

create policy role_assignments__select__self_or_school_admin
on public.role_assignments for select to authenticated
using (
  user_id = auth.uid()
  or public.is_school_admin(public.scope_school_id(scope_type, scope_id))
);

create policy teacher_class_assignments__select__self_or_school_admin
on public.teacher_class_assignments for select to authenticated
using (
  teacher_id = auth.uid()
  or exists (
    select 1
    from public.classes as class
    where class.id = class_id
      and public.is_school_admin(class.school_id)
  )
);

create policy households__select__linked_family_or_school_admin
on public.households for select to authenticated
using (public.can_access_household(id));

create policy household_members__select__linked_family_or_school_admin
on public.household_members for select to authenticated
using (public.can_access_household(household_id));

create policy household_students__select__linked_family_or_school_admin
on public.household_students for select to authenticated
using (public.can_access_household(household_id));

create policy class_device_bindings__select__device_teacher_or_school_admin
on public.class_device_bindings for select to authenticated
using (
  device_id = auth.uid()
  or exists (
    select 1
    from public.teacher_class_assignments as assignment
    where assignment.teacher_id = auth.uid()
      and assignment.class_id = class_id
  )
  or exists (
    select 1
    from public.classes as class
    where class.id = class_id
      and public.is_school_admin(class.school_id)
  )
);

grant usage on type public.app_role, public.app_scope_type,
  public.profile_status, public.device_binding_status to authenticated;
grant select on public.profiles, public.schools, public.classes, public.students,
  public.role_assignments, public.teacher_class_assignments, public.households,
  public.household_members, public.household_students,
  public.class_device_bindings to authenticated;

revoke all on function public.set_updated_at() from public;
revoke all on function public.create_profile_for_auth_user() from public;
revoke all on function public.validate_role_assignment_scope() from public;
revoke all on function public.has_role(public.app_role, public.app_scope_type, uuid) from public;
revoke all on function public.scope_school_id(public.app_scope_type, uuid) from public;
revoke all on function public.is_school_admin(uuid) from public;
revoke all on function public.can_access_school(uuid) from public;
revoke all on function public.can_access_class(uuid) from public;
revoke all on function public.can_access_student(uuid) from public;
revoke all on function public.can_access_household(uuid) from public;
revoke all on function public.user_belongs_to_school(uuid, uuid) from public;
revoke all on function public.can_access_profile(uuid) from public;

grant execute on function public.has_role(public.app_role, public.app_scope_type, uuid) to authenticated;
grant execute on function public.scope_school_id(public.app_scope_type, uuid) to authenticated;
grant execute on function public.is_school_admin(uuid) to authenticated;
grant execute on function public.can_access_school(uuid) to authenticated;
grant execute on function public.can_access_class(uuid) to authenticated;
grant execute on function public.can_access_student(uuid) to authenticated;
grant execute on function public.can_access_household(uuid) to authenticated;
grant execute on function public.user_belongs_to_school(uuid, uuid) to authenticated;
grant execute on function public.can_access_profile(uuid) to authenticated;
