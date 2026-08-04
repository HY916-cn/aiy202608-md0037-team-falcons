create type public.ai_session_status as enum ('active', 'closed');
create type public.ai_action_draft_status as enum (
  'pending',
  'executing',
  'completed',
  'cancelled',
  'expired',
  'failed'
);

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  coze_conversation_ref text,
  status public.ai_session_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_sessions__user_created
  on public.ai_sessions (user_id, created_at desc);

create table public.ai_action_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  action_type text not null check (action_type in ('assignment_publish', 'assessment_publish')),
  role public.app_role not null,
  permission_scope text not null,
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  targets jsonb not null check (jsonb_typeof(targets) = 'array'),
  impact jsonb not null check (jsonb_typeof(impact) = 'array'),
  is_dangerous boolean not null,
  status public.ai_action_draft_status not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_action_drafts__user_status_expiry
  on public.ai_action_drafts (user_id, status, expires_at);

create or replace function public.ai_json_has_authorization_key(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(value)
    when 'object' then exists (
      select 1
      from jsonb_each(value) as entry(key, nested_value)
      where lower(regexp_replace(entry.key, '[_-]', '', 'g')) in (
        'actorid', 'actorrole', 'permissionscope', 'role', 'scope', 'userid'
      ) or public.ai_json_has_authorization_key(entry.nested_value)
    )
    when 'array' then exists (
      select 1
      from jsonb_array_elements(value) as item(nested_value)
      where public.ai_json_has_authorization_key(item.nested_value)
    )
    else false
  end
$$;

create or replace function public.create_ai_session()
returns public.ai_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_session public.ai_sessions;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  insert into public.ai_sessions (user_id)
  values (auth.uid())
  returning * into created_session;

  return created_session;
end;
$$;

create or replace function public.create_ai_action_draft(
  requested_action_type text,
  requested_parameters jsonb,
  requested_targets jsonb,
  requested_impact jsonb
)
returns public.ai_action_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_draft public.ai_action_drafts;
  derived_role public.app_role;
  derived_scope text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if requested_action_type not in ('assignment_publish', 'assessment_publish') then
    raise exception 'VALIDATION_ERROR';
  end if;
  if jsonb_typeof(requested_parameters) <> 'object'
    or jsonb_typeof(requested_targets) <> 'array'
    or jsonb_typeof(requested_impact) <> 'array'
    or public.ai_json_has_authorization_key(requested_parameters) then
    raise exception 'VALIDATION_ERROR';
  end if;

  select assignment.role,
    assignment.scope_type::text || ':' || assignment.scope_id::text
  into derived_role, derived_scope
  from public.role_assignments as assignment
  where assignment.user_id = auth.uid()
    and assignment.role = 'teacher'
  order by assignment.created_at
  limit 1;

  if derived_role is null then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.ai_action_drafts (
    user_id,
    action_type,
    role,
    permission_scope,
    parameters,
    targets,
    impact,
    is_dangerous,
    expires_at
  ) values (
    auth.uid(),
    requested_action_type,
    derived_role,
    derived_scope,
    requested_parameters,
    requested_targets,
    requested_impact,
    true,
    now() + interval '5 minutes'
  )
  returning * into created_draft;

  return created_draft;
end;
$$;

create or replace function public.claim_ai_action_draft(
  target_draft_id uuid,
  dangerous_confirmed boolean
)
returns public.ai_action_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft public.ai_action_drafts;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into target_draft
  from public.ai_action_drafts
  where id = target_draft_id
  for update;

  if target_draft.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if target_draft.user_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if target_draft.status <> 'pending' then
    raise exception 'DRAFT_ALREADY_USED';
  end if;
  if target_draft.expires_at <= now() then
    update public.ai_action_drafts
    set status = 'expired', updated_at = now()
    where id = target_draft_id;
    raise exception 'DRAFT_EXPIRED';
  end if;
  if target_draft.is_dangerous and not dangerous_confirmed then
    raise exception 'SECOND_CONFIRMATION_REQUIRED';
  end if;

  update public.ai_action_drafts
  set status = 'executing', consumed_at = now(), updated_at = now()
  where id = target_draft_id
  returning * into target_draft;

  return target_draft;
end;
$$;

create or replace function public.finish_ai_action_draft(
  target_draft_id uuid,
  succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  update public.ai_action_drafts
  set status = case when succeeded then 'completed'::public.ai_action_draft_status
                    else 'failed'::public.ai_action_draft_status end,
      updated_at = now()
  where id = target_draft_id
    and user_id = auth.uid()
    and status = 'executing';

  if not found then
    raise exception 'DRAFT_ALREADY_USED';
  end if;
end;
$$;

create or replace function public.cancel_ai_action_draft(target_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  update public.ai_action_drafts
  set status = 'cancelled', consumed_at = now(), updated_at = now()
  where id = target_draft_id
    and user_id = auth.uid()
    and status = 'pending'
    and expires_at > now();

  if not found then
    if exists (
      select 1 from public.ai_action_drafts
      where id = target_draft_id and user_id <> auth.uid()
    ) then
      raise exception 'FORBIDDEN';
    end if;
    raise exception 'DRAFT_ALREADY_USED';
  end if;
end;
$$;

alter table public.ai_sessions enable row level security;
alter table public.ai_action_drafts enable row level security;

create policy ai_sessions__select__own
on public.ai_sessions for select to authenticated
using (user_id = auth.uid());

create policy ai_action_drafts__select__own
on public.ai_action_drafts for select to authenticated
using (user_id = auth.uid());

revoke all on public.ai_sessions, public.ai_action_drafts from anon, authenticated;
grant select on public.ai_sessions, public.ai_action_drafts to authenticated;

revoke all on function public.ai_json_has_authorization_key(jsonb) from public, anon, authenticated;
revoke all on function public.create_ai_session() from public, anon;
revoke all on function public.create_ai_action_draft(text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.claim_ai_action_draft(uuid, boolean) from public, anon;
revoke all on function public.finish_ai_action_draft(uuid, boolean) from public, anon;
revoke all on function public.cancel_ai_action_draft(uuid) from public, anon;

grant execute on function public.create_ai_session() to authenticated;
grant execute on function public.create_ai_action_draft(text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.claim_ai_action_draft(uuid, boolean) to authenticated;
grant execute on function public.finish_ai_action_draft(uuid, boolean) to authenticated;
grant execute on function public.cancel_ai_action_draft(uuid) to authenticated;
