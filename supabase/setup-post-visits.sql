-- Run once in Supabase Dashboard → SQL Editor.
-- Each signed-in user can mark one status per post: planned or visited.

create table if not exists public.post_visit_status (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('planned', 'visited')),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_visit_status enable row level security;

drop policy if exists "Authenticated users read post visit statuses" on public.post_visit_status;
drop policy if exists "Users read own post visit status" on public.post_visit_status;
create policy "Users read own post visit status"
  on public.post_visit_status for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users add own post visit status" on public.post_visit_status;
create policy "Users add own post visit status"
  on public.post_visit_status for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own post visit status" on public.post_visit_status;
create policy "Users update own post visit status"
  on public.post_visit_status for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own post visit status" on public.post_visit_status;
create policy "Users remove own post visit status"
  on public.post_visit_status for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.post_visit_status to authenticated;

-- Return only the aggregate count and the signed-in user's own status.
create or replace function public.get_post_visit_summary(p_post_id bigint)
returns table (visited_count bigint, user_status text)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    count(*) filter (where status = 'visited')::bigint,
    max(status) filter (where user_id = auth.uid())
  from public.post_visit_status
  where post_id = p_post_id;
$function$;

revoke all on function public.get_post_visit_summary(bigint) from public, anon;
grant execute on function public.get_post_visit_summary(bigint) to authenticated;
grant execute on function public.get_post_visit_summary(bigint) to anon;
