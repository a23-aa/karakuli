-- =====================================================================
-- Каракули, обновление 2: юзернеймы, галочки, админ-панель, блокировки.
-- Для работающей базы: Supabase → SQL Editor → вставить → Run. Можно запускать повторно.
-- (Для чистой базы он уже включён в конец schema.sql.)
-- =====================================================================

-- ---------- новые поля профиля ----------
alter table public.profiles
  add column if not exists username   text,
  add column if not exists badge      text,
  add column if not exists is_admin   boolean not null default false,
  add column if not exists banned     boolean not null default false,
  add column if not exists ban_reason text not null default '';

alter table public.profiles drop constraint if exists profiles_username_fmt;
alter table public.profiles add constraint profiles_username_fmt
  check (username is null or username ~ '^[a-z][a-z0-9_]{4,31}$');
alter table public.profiles drop constraint if exists profiles_badge_chk;
alter table public.profiles add constraint profiles_badge_chk
  check (badge is null or badge in ('owner','verified','blogger'));
-- юзернейм уникален (хранится в нижнем регистре)
create unique index if not exists profiles_username_uq on public.profiles (username);

-- ---------- помощники ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from public.profiles where id = auth.uid()), false);
$$;

-- занятые служебные имена
create or replace function public.username_reserved(u text) returns boolean
language sql immutable as $$
  select u = any (array['admin','administrator','karakuli','support','moderator','official','system','root','help','owner','telegram','vk']);
$$;

-- свободен ли юзернейм (можно звать до регистрации)
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z][a-z0-9_]{4,31}$'
     and not public.username_reserved(lower(u))
     and not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- обычные пользователи не могут занять служебные имена
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.username is not null then new.username := lower(new.username); end if;
  if new.username is distinct from old.username and new.username is not null
     and public.username_reserved(new.username)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'username reserved';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_upd on public.profiles;
create trigger profiles_guard_upd before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- создание профиля: юзернейм из регистрации ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fullname text; f text; l text; un text;
begin
  f := coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'given_name');
  l := coalesce(new.raw_user_meta_data->>'last_name',  new.raw_user_meta_data->>'family_name');
  if f is null then
    fullname := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1));
    f := split_part(fullname, ' ', 1);
    l := coalesce(nullif(trim(substr(fullname, length(split_part(fullname, ' ', 1)) + 1)), ''), '');
  end if;
  un := lower(new.raw_user_meta_data->>'username');
  if un is null or not public.username_available(un) then un := null; end if;
  begin
    insert into public.profiles (id, first_name, last_name, avatar_url, username)
    values (new.id, coalesce(f, ''), coalesce(l, ''), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), un);
  exception when unique_violation then
    insert into public.profiles (id, first_name, last_name, avatar_url)
    values (new.id, coalesce(f, ''), coalesce(l, ''), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'));
  end;
  return new;
end $$;

-- ---------- защита служебных полей ----------
-- обычный пользователь меняет только свои «человеческие» поля; badge, is_admin, banned — только через функции админа
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, status, about, city, birth, avatar_url, cover_url,
              privacy_profile, privacy_messages, show_online, settings, last_seen, username)
  on public.profiles to authenticated;

-- админ видит всё, как владелец
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or public.is_admin()
      or coalesce((select privacy_profile from public.profiles where id = owner), 'all') = 'all'
      or public.are_friends(owner, auth.uid());
$$;

-- ---------- права админа на контент ----------
drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete on public.posts for delete to authenticated using (public.is_admin());
drop policy if exists comments_admin_delete on public.comments;
create policy comments_admin_delete on public.comments for delete to authenticated using (public.is_admin());
drop policy if exists photos_admin_delete on public.photos;
create policy photos_admin_delete on public.photos for delete to authenticated using (public.is_admin());
drop policy if exists communities_admin_update on public.communities;
create policy communities_admin_update on public.communities for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists communities_admin_delete on public.communities;
create policy communities_admin_delete on public.communities for delete to authenticated using (public.is_admin());

-- ---------- заблокированные ничего не публикуют ----------
do $$ declare t text; begin
  foreach t in array array['posts','comments','messages','likes','friendships','communities','community_members','photos','albums'] loop
    execute format('drop policy if exists no_banned_%I on public.%I', t, t);
    execute format('create policy no_banned_%I on public.%I as restrictive for insert to authenticated with check (not public.is_banned())', t, t);
  end loop;
end $$;

-- ---------- функции админа ----------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',        (select count(*) from public.profiles),
    'online',       (select count(*) from public.profiles where show_online and last_seen > now() - interval '150 seconds'),
    'online_hour',  (select count(*) from public.profiles where last_seen > now() - interval '1 hour'),
    'online_day',   (select count(*) from public.profiles where last_seen > now() - interval '1 day'),
    'new_today',    (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'new_week',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'posts',        (select count(*) from public.posts),
    'comments',     (select count(*) from public.comments),
    'messages',     (select count(*) from public.messages),
    'photos',       (select count(*) from public.photos),
    'likes',        (select count(*) from public.likes),
    'communities',  (select count(*) from public.communities),
    'friendships',  (select count(*) from public.friendships where status = 'accepted'),
    'banned',       (select count(*) from public.profiles where banned),
    'verified',     (select count(*) from public.profiles where badge = 'verified'),
    'blogger',      (select count(*) from public.profiles where badge = 'blogger'),
    'signups',      (select coalesce(jsonb_agg(jsonb_build_object('d', d::date, 'n', (select count(*) from public.profiles p where p.created_at::date = d::date)) order by d), '[]'::jsonb)
                       from generate_series(current_date - 13, current_date, interval '1 day') d)
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- галочка: 'verified' (синяя), 'blogger' (серая) или null. Галочку владельца админ не трогает
create or replace function public.admin_set_badge(uid uuid, b text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if b is not null and b not in ('verified','blogger') then raise exception 'bad badge'; end if;
  update public.profiles set badge = b where id = uid and badge is distinct from 'owner';
end $$;

create or replace function public.admin_set_ban(uid uuid, flag boolean, reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set banned = flag, ban_reason = case when flag then coalesce(reason, '') else '' end
   where id = uid and not is_admin;
end $$;

-- сбросить юзернейм (пользователь выберет новый)
create or replace function public.admin_clear_username(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set username = null where id = uid and not is_admin;
end $$;

create or replace function public.admin_delete_user(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.profiles where id = uid and is_admin) then raise exception 'cannot delete admin'; end if;
  delete from auth.users where id = uid;
end $$;

do $$ declare f text; begin
  foreach f in array array['admin_set_badge(uuid,text)','admin_set_ban(uuid,boolean,text)','admin_clear_username(uuid)','admin_delete_user(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- КАК СТАТЬ ВЛАДЕЛЬЦЕМ (выполните один раз, подставив свою почту и юзернейм):
--
--   update public.profiles
--      set is_admin = true, badge = 'owner', username = 'your_name'
--    where id = (select id from auth.users where email = 'вашапочта@gmail.com');
--
-- Сначала зарегистрируйтесь на сайте, потом выполните это в SQL Editor.
-- =====================================================================
