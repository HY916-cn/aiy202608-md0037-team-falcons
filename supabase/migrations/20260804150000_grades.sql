create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.profiles (id),
  class_id uuid not null references public.classes (id),
  subject text not null check (char_length(btrim(subject)) between 1 and 60),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and published_at is null)
    or (status <> 'draft' and published_at is not null)
  )
);

create table public.grade_records (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id),
  student_id uuid not null references public.students (id),
  score numeric(7, 2) not null check (score >= 0),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create table public.grade_revisions (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grade_records (id),
  old_score numeric(7, 2) not null,
  new_score numeric(7, 2) not null,
  old_comment text not null,
  new_comment text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_id uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index assessments__class_published_idx
  on public.assessments (class_id, published_at desc)
  where status = 'published';
create index grade_records__student_idx
  on public.grade_records (student_id, updated_at desc);
create index grade_revisions__grade_created_idx
  on public.grade_revisions (grade_id, created_at desc);

create trigger assessments__set_updated_at
before update on public.assessments
for each row execute function public.set_updated_at();

create or replace function public.is_assessment_owner(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments as assessment
    where assessment.id = target_assessment_id
      and assessment.teacher_id = (select auth.uid())
      and public.has_role('teacher', 'school')
  );
$$;

create or replace function public.capture_grade_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assessment_status public.content_status;
  revision_reason text;
begin
  if old.id is distinct from new.id
    or old.assessment_id is distinct from new.assessment_id
    or old.student_id is distinct from new.student_id then
    raise exception 'IMMUTABLE_GRADE_IDENTITY';
  end if;

  select assessment.status
  into assessment_status
  from public.assessments as assessment
  where assessment.id = old.assessment_id;

  if assessment_status = 'published'
    and (old.score, old.comment) is distinct from (new.score, new.comment) then
    revision_reason := nullif(
      btrim(current_setting('app.grade_revision_reason', true)),
      ''
    );

    if revision_reason is null then
      raise exception 'MISSING_REVISION_REASON';
    end if;

    insert into public.grade_revisions (
      grade_id,
      old_score,
      new_score,
      old_comment,
      new_comment,
      reason,
      actor_id
    )
    values (
      old.id,
      old.score,
      new.score,
      old.comment,
      new.comment,
      revision_reason,
      (select auth.uid())
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger grade_records__capture_revision
before update on public.grade_records
for each row execute function public.capture_grade_revision();

create or replace function public.publish_assessment(target_assessment_id uuid)
returns public.assessments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.assessments;
begin
  if not exists (
    select 1
    from public.grade_records as grade
    where grade.assessment_id = target_assessment_id
  ) then
    raise exception 'VALIDATION_ERROR';
  end if;

  perform set_config(
    'app.assessment_publish_id',
    target_assessment_id::text,
    true
  );

  update public.assessments
  set
    status = 'published',
    published_at = now()
  where id = target_assessment_id
    and teacher_id = (select auth.uid())
    and status = 'draft'
  returning * into result;

  if result.id is null then
    raise exception 'NOT_FOUND';
  end if;

  perform set_config('app.assessment_publish_id', '', true);
  return result;
end;
$$;

create or replace function public.revise_grade(
  target_grade_id uuid,
  revised_score numeric,
  revised_comment text,
  revision_reason text
)
returns public.grade_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.grade_records;
begin
  if revised_score < 0
    or char_length(revised_comment) > 1000
    or char_length(btrim(revision_reason)) not between 1 and 500 then
    raise exception 'VALIDATION_ERROR';
  end if;

  perform set_config('app.grade_revision_reason', revision_reason, true);

  update public.grade_records as grade
  set
    score = revised_score,
    comment = revised_comment
  from public.assessments as assessment
  where grade.id = target_grade_id
    and assessment.id = grade.assessment_id
    and assessment.teacher_id = (select auth.uid())
    and assessment.status = 'published'
  returning grade.* into result;

  if result.id is null then
    raise exception 'NOT_FOUND';
  end if;

  perform set_config('app.grade_revision_reason', '', true);
  return result;
end;
$$;

alter table public.assessments enable row level security;
alter table public.grade_records enable row level security;
alter table public.grade_revisions enable row level security;

create policy assessments__select__authorized
on public.assessments for select to authenticated
using (
  teacher_id = (select auth.uid())
  or exists (
    select 1
    from public.classes as class
    where class.id = assessments.class_id
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

create policy assessments__insert__teacher
on public.assessments for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and status = 'draft'
  and published_at is null
  and public.is_teacher_assigned_to_class((select auth.uid()), class_id)
);

create policy assessments__update__draft_owner
on public.assessments for update to authenticated
using (
  teacher_id = (select auth.uid())
  and status = 'draft'
)
with check (
  teacher_id = (select auth.uid())
  and public.is_teacher_assigned_to_class((select auth.uid()), class_id)
  and (
    (status = 'draft' and published_at is null)
    or (
      status = 'published'
      and published_at is not null
      and current_setting('app.assessment_publish_id', true) = id::text
    )
  )
);

create policy grade_records__select__teacher_or_linked_family
on public.grade_records for select to authenticated
using (
  exists (
    select 1
    from public.assessments as assessment
    where assessment.id = grade_records.assessment_id
      and assessment.teacher_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.assessments as assessment
    where assessment.id = grade_records.assessment_id
      and assessment.status = 'published'
      and public.has_role('family', 'household')
      and public.can_access_student(grade_records.student_id)
  )
);

create policy grade_records__insert__assessment_owner
on public.grade_records for insert to authenticated
with check (
  public.is_assessment_owner(assessment_id)
  and exists (
    select 1
    from public.assessments as assessment
    join public.students as student on student.id = grade_records.student_id
    where assessment.id = grade_records.assessment_id
      and assessment.status = 'draft'
      and student.class_id = assessment.class_id
  )
);

create policy grade_records__update__assessment_owner
on public.grade_records for update to authenticated
using (public.is_assessment_owner(assessment_id))
with check (public.is_assessment_owner(assessment_id));

create policy grade_revisions__select__assessment_owner
on public.grade_revisions for select to authenticated
using (
  exists (
    select 1
    from public.grade_records as grade
    join public.assessments as assessment on assessment.id = grade.assessment_id
    where grade.id = grade_revisions.grade_id
      and assessment.teacher_id = (select auth.uid())
  )
);

revoke all on public.assessments from anon;
revoke all on public.grade_records from anon;
revoke all on public.grade_revisions from anon;

grant select, insert, update on public.assessments to authenticated;
grant select, insert on public.grade_records to authenticated;
grant update (score, comment) on public.grade_records to authenticated;
grant select on public.grade_revisions to authenticated;

revoke all on function public.is_assessment_owner(uuid) from public;
revoke all on function public.capture_grade_revision() from public;
revoke all on function public.publish_assessment(uuid) from public;
revoke all on function public.revise_grade(uuid, numeric, text, text) from public;

grant execute on function public.is_assessment_owner(uuid) to authenticated;
grant execute on function public.publish_assessment(uuid) to authenticated;
grant execute on function public.revise_grade(uuid, numeric, text, text) to authenticated;
