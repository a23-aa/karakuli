-- =====================================================================
-- Каракули, обновление 3: подписчики и портал ивентов.
-- Для работающей базы: Supabase → SQL Editor → вставить ТЕКСТ файла → Run. Можно запускать повторно.
-- (Для чистой базы он уже включён в конец schema.sql.)
-- =====================================================================

-- ---------- подписчики ----------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());
drop policy if exists no_banned_follows on public.follows;
create policy no_banned_follows on public.follows as restrictive for insert to authenticated with check (not public.is_banned());

-- новый тип уведомления «подписался»
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('like','comment','friend_request','friend_accept','message','community_post','repost','follow'));

-- ---------- ивенты ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  kind        text not null default 'custom',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists events_time_idx on public.events (ends_at, starts_at);
alter table public.events enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (true);
drop policy if exists events_admin_insert on public.events;
create policy events_admin_insert on public.events for insert to authenticated with check (public.is_admin());
drop policy if exists events_admin_update on public.events;
create policy events_admin_update on public.events for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists events_admin_delete on public.events;
create policy events_admin_delete on public.events for delete to authenticated using (public.is_admin());

-- серверное время (чтобы таймеры не зависели от часов на телефоне)
create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now(); $$;
grant execute on function public.server_time() to authenticated;

-- изменения ивентов приходят на страницу сразу
do $$ begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null; when undefined_object then null; end $$;

notify pgrst, 'reload schema';
