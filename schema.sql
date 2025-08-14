-- Supabase schema for BulletHell Mobile
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  tag text not null,
  avatar_url text,
  created_at timestamp with time zone default now()
);
create unique index if not exists profiles_nickname_tag_key on public.profiles (nickname, tag);
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = user_id);

create table if not exists public.scores (
  id bigserial primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  score integer not null,
  created_at timestamp with time zone default now()
);
alter table public.scores enable row level security;
create policy "scores_select" on public.scores for select using (true);
create policy "scores_insert_self" on public.scores for insert with check (auth.uid() = user_id);

create table if not exists public.updates (
  id bigserial primary key,
  title text not null,
  content text not null,
  created_at timestamp with time zone default now()
);
alter table public.updates enable row level security;
create policy "updates_select_public" on public.updates for select using (true);
