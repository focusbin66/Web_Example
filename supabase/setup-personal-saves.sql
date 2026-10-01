-- Run once in Supabase Dashboard → SQL Editor.
-- Saved posts are private to the authenticated user.

create table if not exists public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;

drop policy if exists "Users read own saved posts" on public.saved_posts;
create policy "Users read own saved posts"
  on public.saved_posts for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users save posts for self" on public.saved_posts;
create policy "Users save posts for self"
  on public.saved_posts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own saved posts" on public.saved_posts;
create policy "Users remove own saved posts"
  on public.saved_posts for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.saved_posts to authenticated;

-- Add the AI analysis column if this existing project database does not have it yet.
alter table public.posts add column if not exists analysis text;

-- Permit owners to update only their own post rows.
drop policy if exists "Owners update own posts" on public.posts;
create policy "Owners update own posts"
  on public.posts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners delete own posts" on public.posts;
create policy "Owners delete own posts"
  on public.posts for delete to authenticated
  using (auth.uid() = user_id);

grant update on public.posts to authenticated;
