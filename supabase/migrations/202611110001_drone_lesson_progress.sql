-- Adds a separate identity namespace for the drone course; existing course IDs
-- and saved progress remain unchanged. Apply after the original profiles schema.
-- CREATE IF NOT EXISTS also supports projects missing the older progress migration.
begin;
create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null,
  completed_step_ids text[] not null default '{}'::text[],
  best_score integer check (best_score between 0 and 100),
  quiz_passed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  check (cardinality(completed_step_ids) <= 20),
  check (completed_at is null or quiz_passed)
);
alter table public.lesson_progress drop constraint if exists lesson_progress_lesson_id_check;
alter table public.lesson_progress add constraint lesson_progress_lesson_id_check
  check (lesson_id ~ '^([1-6]\.[12]|drone-[1-6]\.[12])$');
alter table public.lesson_progress enable row level security;
revoke all on public.lesson_progress from public, anon, authenticated;
grant select on public.lesson_progress to authenticated;
grant all on public.lesson_progress to service_role;
drop policy if exists own_lesson_progress on public.lesson_progress;
create policy own_lesson_progress on public.lesson_progress for select to authenticated
using (user_id = auth.uid());

-- The API supplies a verified caller ID, server-defined steps and server-computed
-- quiz score. Browser clients cannot invoke this function or write the table.
create or replace function public.merge_lesson_progress(
  p_user_id uuid,
  p_lesson_id text,
  p_valid_step_ids text[],
  p_step_id text default null,
  p_score integer default null,
  p_total integer default null
) returns setof public.lesson_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_progress public.lesson_progress;
begin
  if p_user_id is null or p_lesson_id is null
    or p_lesson_id !~ '^([1-6]\.[12]|drone-[1-6]\.[12])$' then
    raise exception 'Invalid lesson progress identity';
  end if;
  if p_valid_step_ids is null or cardinality(p_valid_step_ids) not between 1 and 20
    or exists(select 1 from unnest(p_valid_step_ids) as item(id) where id is null or char_length(id) not between 1 and 100)
    or cardinality(p_valid_step_ids) <> (select count(distinct id) from unnest(p_valid_step_ids) as item(id)) then
    raise exception 'Invalid lesson step definition';
  end if;
  if p_step_id is not null and not (p_step_id = any(p_valid_step_ids)) then
    raise exception 'Step does not belong to lesson';
  end if;
  if (p_score is null) <> (p_total is null)
    or (p_score is not null and (p_total not between 1 and 100 or p_score not between 0 and p_total))
    or (p_step_id is null and p_score is null) then
    raise exception 'Invalid lesson progress event';
  end if;

  insert into public.lesson_progress as existing (
    user_id, lesson_id, completed_step_ids, best_score, quiz_passed, updated_at
  ) values (
    p_user_id, p_lesson_id,
    case when p_step_id is null then '{}'::text[] else array[p_step_id] end,
    p_score, coalesce(p_score = p_total, false), now()
  ) on conflict (user_id, lesson_id) do update set
    completed_step_ids = (
      select coalesce(array_agg(distinct id order by id), '{}'::text[])
      from unnest(existing.completed_step_ids || excluded.completed_step_ids) as combined(id)
    ),
    best_score = greatest(existing.best_score, excluded.best_score),
    quiz_passed = existing.quiz_passed or excluded.quiz_passed,
    updated_at = now()
  returning * into v_progress;

  if v_progress.completed_at is null and v_progress.quiz_passed
    and v_progress.completed_step_ids @> p_valid_step_ids then
    update public.lesson_progress set completed_at = now()
    where user_id = p_user_id and lesson_id = p_lesson_id
    returning * into v_progress;
  end if;
  return next v_progress;
end;
$$;
revoke all on function public.merge_lesson_progress(uuid, text, text[], text, integer, integer) from public, anon, authenticated;
grant execute on function public.merge_lesson_progress(uuid, text, text[], text, integer, integer) to service_role;
commit;
