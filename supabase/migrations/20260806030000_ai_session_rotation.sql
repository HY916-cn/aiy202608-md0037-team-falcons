-- Keep the AI assistant available for long-running demo and test accounts.
-- Session history has no numeric cap; request concurrency and rate limiting are
-- enforced independently by begin_ai_request.
create or replace function public.create_ai_session(selected_role_assignment_id uuid)
returns public.ai_sessions language plpgsql security definer set search_path = '' as $$
declare
  created_session public.ai_sessions;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );
  if not exists (
    select 1 from public.role_assignments
    where id = selected_role_assignment_id and user_id = current_user_id
  ) then raise exception 'FORBIDDEN'; end if;

  insert into public.ai_sessions (user_id, role_assignment_id)
  values (current_user_id, selected_role_assignment_id)
  returning * into created_session;
  return created_session;
end;
$$;
