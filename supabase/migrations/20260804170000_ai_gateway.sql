alter table public.role_assignments
  add column id uuid not null default gen_random_uuid();
create unique index uq_role_assignments__id on public.role_assignments (id);

create type public.ai_session_status as enum ('active', 'closed');
create type public.ai_action_draft_status as enum (
  'pending', 'executing', 'completed', 'cancelled', 'expired', 'failed'
);

create table public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  role_assignment_id uuid not null references public.role_assignments (id),
  coze_conversation_ref text,
  status public.ai_session_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_sessions__user_created
  on public.ai_sessions (user_id, created_at desc);

create table public.ai_request_events (
  id uuid primary key,
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  lease_until timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_ai_request_events__user_created
  on public.ai_request_events (user_id, created_at desc);

create table public.ai_action_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  role_assignment_id uuid not null references public.role_assignments (id),
  action_type text not null check (action_type in ('assignment_publish', 'assessment_publish')),
  role public.app_role not null,
  permission_scope text not null,
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  targets jsonb not null check (jsonb_typeof(targets) = 'array'),
  impact jsonb not null check (jsonb_typeof(impact) = 'array'),
  target_type text not null check (target_type in ('assignment', 'assessment')),
  target_id uuid not null,
  target_version text not null,
  is_dangerous boolean not null default true,
  status public.ai_action_draft_status not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  execution_lease_until timestamptz,
  execution_attempt integer not null default 0,
  receipt jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_action_drafts__user_status_expiry
  on public.ai_action_drafts (user_id, status, expires_at);

create table public.ai_skill_context_tokens (
  id uuid primary key,
  user_id uuid not null references public.profiles (id),
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  role_assignment_id uuid not null references public.role_assignments (id),
  allowed_skills text[] not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.ai_json_has_authorization_key(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case jsonb_typeof(value)
    when 'object' then exists (
      select 1 from jsonb_each(value) as entry(key, nested_value)
      where lower(regexp_replace(entry.key, '[_-]', '', 'g')) in (
        'actorid', 'actorrole', 'permissionscope', 'role', 'scope', 'userid'
      ) or public.ai_json_has_authorization_key(entry.nested_value)
    )
    when 'array' then exists (
      select 1 from jsonb_array_elements(value) as item(nested_value)
      where public.ai_json_has_authorization_key(item.nested_value)
    )
    else false
  end
$$;

create or replace function public.create_ai_session(selected_role_assignment_id uuid)
returns public.ai_sessions language plpgsql security definer set search_path = '' as $$
declare created_session public.ai_sessions;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.role_assignments
    where id = selected_role_assignment_id and user_id = auth.uid()
  ) then raise exception 'FORBIDDEN'; end if;
  if (select count(*) from public.ai_sessions
      where user_id = auth.uid() and status = 'active') >= 10 then
    raise exception 'SESSION_LIMIT';
  end if;
  insert into public.ai_sessions (user_id, role_assignment_id)
  values (auth.uid(), selected_role_assignment_id)
  returning * into created_session;
  return created_session;
end;
$$;

create or replace function public.update_ai_session_conversation(
  target_session_id uuid, conversation_reference text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.ai_sessions set
    coze_conversation_ref = conversation_reference, updated_at = now()
  where id = target_session_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'FORBIDDEN'; end if;
end;
$$;

create or replace function public.begin_ai_request(
  target_session_id uuid,
  selected_role_assignment_id uuid,
  request_id uuid,
  message_length integer
)
returns public.ai_sessions language plpgsql security definer set search_path = '' as $$
declare target_session public.ai_sessions;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if message_length < 1 or message_length > 2000 then raise exception 'MESSAGE_LENGTH'; end if;
  select * into target_session from public.ai_sessions
  where id = target_session_id and user_id = auth.uid() and status = 'active'
    and role_assignment_id = selected_role_assignment_id;
  if target_session.id is null then raise exception 'FORBIDDEN'; end if;
  delete from public.ai_request_events
  where user_id = auth.uid() and completed_at is null and lease_until <= now();
  if (select count(*) from public.ai_request_events
      where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;
  if (select count(*) from public.ai_request_events
      where user_id = auth.uid() and completed_at is null and lease_until > now()) >= 2 then
    raise exception 'CONCURRENCY_LIMIT';
  end if;
  insert into public.ai_request_events (id, session_id, user_id, lease_until)
  values (request_id, target_session_id, auth.uid(), now() + interval '30 seconds');
  return target_session;
end;
$$;

create or replace function public.finish_ai_request(
  request_id uuid, target_session_id uuid, conversation_reference text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.ai_request_events set completed_at = coalesce(completed_at, now())
  where id = request_id and session_id = target_session_id and user_id = auth.uid();
  update public.ai_sessions set
    coze_conversation_ref = coalesce(conversation_reference, coze_conversation_ref),
    updated_at = now()
  where id = target_session_id and user_id = auth.uid();
end;
$$;

create or replace function public.create_ai_action_draft(
  requested_action_type text,
  requested_parameters jsonb,
  selected_role_assignment_id uuid
)
returns public.ai_action_drafts language plpgsql security definer set search_path = '' as $$
declare
  created_draft public.ai_action_drafts;
  derived_role public.app_role;
  derived_scope text;
  target_id_value uuid;
  target_title text;
  target_class_name text;
  target_updated_at timestamptz;
  target_class_id uuid;
  target_school_id uuid;
  assignment_scope_type public.app_scope_type;
  assignment_scope_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if requested_action_type not in ('assignment_publish', 'assessment_publish')
    or jsonb_typeof(requested_parameters) <> 'object'
    or public.ai_json_has_authorization_key(requested_parameters) then
    raise exception 'VALIDATION_ERROR';
  end if;
  select role, scope_type, scope_id,
    scope_type::text || ':' || scope_id::text
  into derived_role, assignment_scope_type, assignment_scope_id, derived_scope
  from public.role_assignments
  where id = selected_role_assignment_id and user_id = auth.uid();
  if derived_role is distinct from 'teacher' then raise exception 'FORBIDDEN'; end if;

  if requested_action_type = 'assignment_publish' then
    if requested_parameters ? 'assignmentId' = false
      or (select count(*) from jsonb_object_keys(requested_parameters)) <> 1
      then raise exception 'VALIDATION_ERROR'; end if;
    target_id_value := (requested_parameters ->> 'assignmentId')::uuid;
    select item.title, item.class_id, item.updated_at, class.name, class.school_id
    into target_title, target_class_id, target_updated_at, target_class_name, target_school_id
    from public.assignments item join public.classes class on class.id = item.class_id
    where item.id = target_id_value and item.teacher_id = auth.uid() and item.status = 'draft';
  else
    if requested_parameters ? 'assessmentId' = false
      or (select count(*) from jsonb_object_keys(requested_parameters)) <> 1
      then raise exception 'VALIDATION_ERROR'; end if;
    target_id_value := (requested_parameters ->> 'assessmentId')::uuid;
    select item.title, item.class_id, item.updated_at, class.name, class.school_id
    into target_title, target_class_id, target_updated_at, target_class_name, target_school_id
    from public.assessments item join public.classes class on class.id = item.class_id
    where item.id = target_id_value and item.teacher_id = auth.uid() and item.status = 'draft';
  end if;
  if target_updated_at is null then raise exception 'FORBIDDEN'; end if;
  if not ((assignment_scope_type = 'school' and assignment_scope_id = target_school_id)
      or (assignment_scope_type = 'class' and assignment_scope_id = target_class_id)) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.ai_action_drafts (
    user_id, role_assignment_id, action_type, role, permission_scope,
    parameters, targets, impact, target_type, target_id, target_version,
    is_dangerous, expires_at
  ) values (
    auth.uid(), selected_role_assignment_id, requested_action_type, derived_role, derived_scope,
    requested_parameters, jsonb_build_array(target_class_name || ' · ' || target_title),
    case when requested_action_type = 'assignment_publish'
      then jsonb_build_array('发布后班级端和绑定家庭端可见')
      else jsonb_build_array('发布后仅绑定家庭端可见个人成绩') end,
    case when requested_action_type = 'assignment_publish' then 'assignment' else 'assessment' end,
    target_id_value, target_updated_at::text, true, now() + interval '5 minutes'
  ) returning * into created_draft;
  return created_draft;
end;
$$;

create or replace function public.claim_ai_action_draft(
  target_draft_id uuid, dangerous_confirmed boolean
)
returns public.ai_action_drafts language plpgsql security definer set search_path = '' as $$
declare target_draft public.ai_action_drafts; current_version text; current_status public.content_status; is_recovery boolean := false;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into target_draft from public.ai_action_drafts where id = target_draft_id for update;
  if target_draft.id is null then raise exception 'NOT_FOUND'; end if;
  if target_draft.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if target_draft.status = 'completed' then return target_draft; end if;
  if target_draft.status = 'executing' and target_draft.execution_lease_until > now() then
    raise exception 'DRAFT_IN_PROGRESS';
  end if;
  is_recovery := target_draft.status = 'executing';
  if target_draft.status not in ('pending', 'executing') then raise exception 'DRAFT_ALREADY_USED'; end if;
  if target_draft.expires_at <= now() then
    update public.ai_action_drafts set status = 'expired', updated_at = now()
    where id = target_draft_id returning * into target_draft;
    return target_draft;
  end if;
  if target_draft.is_dangerous and not dangerous_confirmed then
    raise exception 'SECOND_CONFIRMATION_REQUIRED';
  end if;
  if not exists (select 1 from public.role_assignments
    where id = target_draft.role_assignment_id and user_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  if target_draft.target_type = 'assignment' then
    select updated_at::text, status into current_version, current_status
    from public.assignments where id = target_draft.target_id and teacher_id = auth.uid();
  else
    select updated_at::text, status into current_version, current_status
    from public.assessments where id = target_draft.target_id and teacher_id = auth.uid();
  end if;
  if not (is_recovery and current_status = 'published')
    and (current_version is distinct from target_draft.target_version or current_status <> 'draft') then
    raise exception 'TARGET_VERSION_CHANGED';
  end if;
  update public.ai_action_drafts set status = 'executing', consumed_at = now(),
    execution_lease_until = now() + interval '30 seconds',
    execution_attempt = execution_attempt + 1, updated_at = now()
  where id = target_draft_id returning * into target_draft;
  return target_draft;
end;
$$;

create or replace function public.finish_ai_action_draft(
  target_draft_id uuid, succeeded boolean, execution_receipt jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing_status public.ai_action_draft_status; existing_receipt jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select status, receipt into existing_status, existing_receipt from public.ai_action_drafts
  where id = target_draft_id and user_id = auth.uid() for update;
  if existing_status = 'completed' then return existing_receipt; end if;
  if existing_status <> 'executing' then raise exception 'DRAFT_ALREADY_USED'; end if;
  update public.ai_action_drafts set
    status = case when succeeded then 'completed'::public.ai_action_draft_status else 'failed'::public.ai_action_draft_status end,
    receipt = case when succeeded then execution_receipt else null end,
    execution_lease_until = null, updated_at = now()
  where id = target_draft_id;
  return case when succeeded then execution_receipt else '{}'::jsonb end;
end;
$$;

create or replace function public.cancel_ai_action_draft(target_draft_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.ai_action_drafts set status = 'cancelled', consumed_at = now(), updated_at = now()
  where id = target_draft_id and user_id = auth.uid() and status = 'pending' and expires_at > now();
  if not found then
    if exists (select 1 from public.ai_action_drafts where id = target_draft_id and user_id <> auth.uid())
      then raise exception 'FORBIDDEN'; end if;
    raise exception 'DRAFT_ALREADY_USED';
  end if;
end;
$$;

create or replace function public.register_ai_skill_context_token(
  token_id uuid, target_session_id uuid, allowed_skill_names text[]
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_session public.ai_sessions;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into target_session from public.ai_sessions
  where id = target_session_id and user_id = auth.uid() and status = 'active';
  if target_session.id is null or cardinality(allowed_skill_names) < 1 then raise exception 'FORBIDDEN'; end if;
  insert into public.ai_skill_context_tokens (
    id, user_id, session_id, role_assignment_id, allowed_skills, expires_at
  ) values (
    token_id, auth.uid(), target_session.id, target_session.role_assignment_id,
    allowed_skill_names, now() + interval '60 seconds'
  );
end;
$$;

create or replace function public.consume_ai_skill_context_token(
  token_id uuid, requested_skill text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_context_id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  update public.ai_skill_context_tokens set consumed_at = now()
  where id = token_id and user_id = auth.uid() and consumed_at is null
    and expires_at > now() and requested_skill = any(allowed_skills)
  returning role_assignment_id into selected_context_id;
  if selected_context_id is null then raise exception 'TOKEN_INVALID_OR_USED'; end if;
  return selected_context_id;
end;
$$;

alter table public.ai_sessions enable row level security;
alter table public.ai_request_events enable row level security;
alter table public.ai_action_drafts enable row level security;
alter table public.ai_skill_context_tokens enable row level security;
create policy ai_sessions__select__own on public.ai_sessions for select to authenticated using (user_id = auth.uid());
create policy ai_action_drafts__select__own on public.ai_action_drafts for select to authenticated using (user_id = auth.uid());

revoke all on public.ai_sessions, public.ai_request_events, public.ai_action_drafts, public.ai_skill_context_tokens from anon, authenticated;
grant select on public.ai_sessions, public.ai_action_drafts to authenticated;

revoke all on function public.ai_json_has_authorization_key(jsonb) from public, anon, authenticated;
revoke all on function public.create_ai_session(uuid) from public, anon;
revoke all on function public.update_ai_session_conversation(uuid, text) from public, anon;
revoke all on function public.begin_ai_request(uuid, uuid, uuid, integer) from public, anon;
revoke all on function public.finish_ai_request(uuid, uuid, text) from public, anon;
revoke all on function public.create_ai_action_draft(text, jsonb, uuid) from public, anon;
revoke all on function public.claim_ai_action_draft(uuid, boolean) from public, anon;
revoke all on function public.finish_ai_action_draft(uuid, boolean, jsonb) from public, anon;
revoke all on function public.cancel_ai_action_draft(uuid) from public, anon;
revoke all on function public.register_ai_skill_context_token(uuid, uuid, text[]) from public, anon;
revoke all on function public.consume_ai_skill_context_token(uuid, text) from public, anon;

grant execute on function public.create_ai_session(uuid) to authenticated;
grant execute on function public.update_ai_session_conversation(uuid, text) to authenticated;
grant execute on function public.begin_ai_request(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.finish_ai_request(uuid, uuid, text) to authenticated;
grant execute on function public.create_ai_action_draft(text, jsonb, uuid) to authenticated;
grant execute on function public.claim_ai_action_draft(uuid, boolean) to authenticated;
grant execute on function public.finish_ai_action_draft(uuid, boolean, jsonb) to authenticated;
grant execute on function public.cancel_ai_action_draft(uuid) to authenticated;
grant execute on function public.register_ai_skill_context_token(uuid, uuid, text[]) to authenticated;
grant execute on function public.consume_ai_skill_context_token(uuid, text) to authenticated;
