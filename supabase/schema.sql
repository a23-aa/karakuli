-- =====================================================================
-- Каракули: схема базы данных для Supabase (PostgreSQL)
-- Вставьте целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт для чистого проекта (включает все обновления). Для уже работающей базы – только migration_002_admin.sql.
-- =====================================================================

-- ---------- Профили ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  status text not null default '',
  about text not null default '',
  city text not null default '',
  birth date,
  avatar_url text,
  cover_url text,
  privacy_profile text not null default 'all' check (privacy_profile in ('all','friends')),
  privacy_messages text not null default 'all' check (privacy_messages in ('all','friends')),
  show_online boolean not null default true,
  settings jsonb not null default '{"theme":"light","accent":"blue","notify":{"like":true,"comment":true,"friend_request":true,"friend_accept":true,"message":true,"community_post":true,"repost":true}}'::jsonb,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Профиль создаётся автоматически при регистрации (почта или Google)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fullname text; f text; l text;
begin
  f := coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'given_name');
  l := coalesce(new.raw_user_meta_data->>'last_name',  new.raw_user_meta_data->>'family_name');
  if f is null then
    fullname := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1));
    f := split_part(fullname, ' ', 1);
    l := coalesce(nullif(trim(substr(fullname, length(split_part(fullname, ' ', 1)) + 1)), ''), '');
  end if;
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (new.id, coalesce(f, ''), coalesce(l, ''), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Друзья ----------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships
    where status = 'accepted' and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)));
$$;

-- может ли текущий пользователь видеть записи и фото владельца (учитывает приватность)
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or coalesce((select privacy_profile from public.profiles where id = owner), 'all') = 'all'
      or public.are_friends(owner, auth.uid());
$$;

-- ---------- Сообщества ----------
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  avatar_url text,
  cover_url text,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user on public.community_members (user_id);

-- ---------- Записи ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  body text not null default '',
  photos text[] not null default '{}',
  repost_of uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  check (body <> '' or cardinality(photos) > 0 or repost_of is not null)
);
create index posts_created on public.posts (created_at desc);
create index posts_author on public.posts (author_id, created_at desc);
create index posts_community on public.posts (community_id, created_at desc);

-- ---------- Фотографии ----------
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  album_id uuid references public.albums(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index photos_owner on public.photos (owner_id, created_at desc);

-- ---------- Лайки, комментарии, закладки ----------
create table public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','photo')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index likes_target on public.likes (target_type, target_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','photo')),
  target_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_target on public.comments (target_type, target_id, created_at);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post','photo','link')),
  target_id uuid,
  url text,
  title text,
  created_at timestamptz not null default now()
);
create unique index bookmarks_unique on public.bookmarks (user_id, kind, target_id) where target_id is not null;

-- ---------- Сообщения и уведомления ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  photo_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (body <> '' or photo_url is not null)
);
create index messages_pair on public.messages (sender_id, recipient_id, created_at);
create index messages_recipient on public.messages (recipient_id, is_read);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_id uuid references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  type text not null check (type in ('like','comment','friend_request','friend_accept','message','community_post','repost')),
  link text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- =====================================================================
-- Правила доступа (Row Level Security): защита держится на них
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.friendships       enable row level security;
alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.posts             enable row level security;
alter table public.albums            enable row level security;
alter table public.photos            enable row level security;
alter table public.likes             enable row level security;
alter table public.comments          enable row level security;
alter table public.bookmarks         enable row level security;
alter table public.messages          enable row level security;
alter table public.notifications     enable row level security;

-- профили
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- друзья
create policy friendships_select on public.friendships for select to authenticated
  using (status = 'accepted' or auth.uid() in (requester_id, addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid() and status = 'accepted');
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- сообщества
create policy communities_select on public.communities for select to authenticated using (true);
create policy communities_insert on public.communities for insert to authenticated with check (creator_id = auth.uid());
create policy communities_update on public.communities for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy communities_delete on public.communities for delete to authenticated using (creator_id = auth.uid());
create policy cm_select on public.community_members for select to authenticated using (true);
create policy cm_insert on public.community_members for insert to authenticated with check (user_id = auth.uid());
create policy cm_delete on public.community_members for delete to authenticated using (user_id = auth.uid());

-- записи
create policy posts_select on public.posts for select to authenticated
  using (community_id is not null or public.can_view(author_id));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and (community_id is null or exists (
    select 1 from public.community_members m where m.community_id = posts.community_id and m.user_id = auth.uid())));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.communities c where c.id = posts.community_id and c.creator_id = auth.uid()));

-- альбомы и фото
create policy albums_select on public.albums for select to authenticated using (public.can_view(owner_id));
create policy albums_write  on public.albums for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy photos_select on public.photos for select to authenticated using (public.can_view(owner_id));
create policy photos_write  on public.photos for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- лайки, комментарии, закладки
create policy likes_select on public.likes for select to authenticated using (true);
create policy likes_insert on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());
create policy comments_select on public.comments for select to authenticated using (true);
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (
  author_id = auth.uid()
  or (target_type = 'post'  and exists (select 1 from public.posts  p where p.id = target_id and p.author_id = auth.uid()))
  or (target_type = 'photo' and exists (select 1 from public.photos p where p.id = target_id and p.owner_id  = auth.uid())));
create policy bookmarks_own on public.bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- сообщения: видят только участники диалога; писать можно с учётом приватности получателя
create policy messages_select on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (
    coalesce((select privacy_messages from public.profiles where id = recipient_id), 'all') = 'all'
    or public.are_friends(sender_id, recipient_id)));
create policy messages_mark_read on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (is_read) on public.messages to authenticated;

-- уведомления
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_insert on public.notifications for insert to authenticated
  with check (user_id <> auth.uid() and (from_id = auth.uid() or from_id is null));
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- =====================================================================
-- Файлы (аватары, обложки, фото): публичное чтение, загрузка только в свою папку
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy media_read   on storage.objects for select using (bucket_id = 'media');
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Реальное время и удаление своей страницы
-- =====================================================================
alter publication supabase_realtime add table public.messages, public.notifications, public.friendships;

create or replace function public.delete_my_account() returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

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

-- ================= migration 004: Pixel Battle =================

alter table public.events add column if not exists config    jsonb   not null default '{}'::jsonb;
alter table public.events add column if not exists result    jsonb;
alter table public.events add column if not exists finalized boolean not null default false;
-- @@
create sequence if not exists public.pb_seq;
-- @@
create table if not exists public.pb_players (
  event_id  uuid not null references public.events(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  team      smallint not null check (team in (0,1)),
  placed    int not null default 0,
  last_at   timestamptz,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists pb_players_team_idx on public.pb_players (event_id, team);
-- @@
create table if not exists public.pb_pixels (
  event_id uuid not null references public.events(id) on delete cascade,
  x        smallint not null check (x between 0 and 999),
  y        smallint not null check (y between 0 and 999),
  color    smallint not null check (color between 0 and 15),
  team     smallint not null check (team in (0,1)),
  user_id  uuid,
  seq      bigint not null default nextval('public.pb_seq'),
  primary key (event_id, x, y)
);
create index if not exists pb_pixels_seq_idx on public.pb_pixels (event_id, seq);
-- @@
create table if not exists public.pb_cells (
  event_id uuid not null references public.events(id) on delete cascade,
  cell     smallint not null check (cell between 0 and 399),
  c0       int not null default 0,
  c1       int not null default 0,
  primary key (event_id, cell)
);
-- @@
-- записывать в эти таблицы можно только через функции ниже; читать игроки могут состав и итоги
alter table public.pb_players enable row level security;
alter table public.pb_pixels  enable row level security;
alter table public.pb_cells   enable row level security;
revoke all on public.pb_players, public.pb_pixels, public.pb_cells from anon, authenticated;
grant select on public.pb_players to authenticated;
drop policy if exists pb_players_select on public.pb_players;
create policy pb_players_select on public.pb_players for select to authenticated using (true);
-- @@
-- ---------- счёт ----------
create or replace function public.pb_scores(p_ev uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mode text; s0 numeric := 0; s1 numeric := 0; z0 int := 0; z1 int := 0; p0 int := 0; p1 int := 0;
begin
  select coalesce(config->>'mode','team_war') into v_mode from events where id = p_ev;
  select coalesce(sum(c0),0), coalesce(sum(c1),0),
         coalesce(sum((c0 > c1)::int),0), coalesce(sum((c1 > c0)::int),0)
    into p0, p1, z0, z1 from pb_cells where event_id = p_ev;
  if v_mode = 'territory_rush' then
    s0 := z0; s1 := z1;
  elsif v_mode = 'pixel_domination' then
    -- центр (клетки 8..11 по обеим осям) стоит втрое дороже
    select coalesce(sum(c0 * case when (cell % 20) between 8 and 11 and (cell / 20) between 8 and 11 then 3 else 1 end),0),
           coalesce(sum(c1 * case when (cell % 20) between 8 and 11 and (cell / 20) between 8 and 11 then 3 else 1 end),0)
      into s0, s1 from pb_cells where event_id = p_ev;
  else
    s0 := p0; s1 := p1;
  end if;
  return jsonb_build_object('mode', v_mode, 's', jsonb_build_array(s0, s1), 'pixels', jsonb_build_array(p0, p1), 'zones', jsonb_build_array(z0, z1));
end $$;
-- @@
-- ---------- вход в команду (автобаланс) ----------
create or replace function public.pb_join(p_ev uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; v_team smallint; n0 int; n1 int;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  if is_banned() then raise exception 'аккаунт заблокирован'; end if;
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then raise exception 'ивент не найден'; end if;
  select team into v_team from pb_players where event_id = p_ev and user_id = auth.uid();
  if found then return jsonb_build_object('team', v_team); end if;
  if now() >= e.ends_at then raise exception 'ивент уже закончился'; end if;
  perform pg_advisory_xact_lock(hashtext(p_ev::text));
  select count(*) filter (where team = 0), count(*) filter (where team = 1) into n0, n1 from pb_players where event_id = p_ev;
  v_team := case when n0 < n1 then 0 when n1 < n0 then 1 else (random() < .5)::int end;
  insert into pb_players (event_id, user_id, team) values (p_ev, auth.uid(), v_team)
    on conflict (event_id, user_id) do nothing;
  select team into v_team from pb_players where event_id = p_ev and user_id = auth.uid();
  return jsonb_build_object('team', v_team);
end $$;
-- @@
-- ---------- поставить пиксель ----------
create or replace function public.pb_place(p_ev uuid, p_x int, p_y int, p_color int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; pl pb_players; v_cd int; v_old smallint; v_cell int; v_seq bigint; v_next timestamptz;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  if is_banned() then raise exception 'аккаунт заблокирован'; end if;
  if p_x is null or p_y is null or p_x not between 0 and 999 or p_y not between 0 and 999 then raise exception 'за пределами поля'; end if;
  if p_color is null or p_color not between 0 and 15 then raise exception 'неизвестный цвет'; end if;
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then raise exception 'ивент не найден'; end if;
  if now() < e.starts_at or now() >= e.ends_at then raise exception 'ивент сейчас не идёт'; end if;
  select * into pl from pb_players where event_id = p_ev and user_id = auth.uid() for update;
  if not found then raise exception 'сначала вступите в команду'; end if;
  v_cd := greatest(0, coalesce((e.config->>'cooldown')::int, 30));
  if pl.last_at is not null and pl.last_at + make_interval(secs => v_cd) > now() then
    return jsonb_build_object('ok', false, 'wait_ms', ceil(extract(epoch from (pl.last_at + make_interval(secs => v_cd) - now())) * 1000)::int);
  end if;
  v_cell := (p_y / 50) * 20 + (p_x / 50);
  select team into v_old from pb_pixels where event_id = p_ev and x = p_x and y = p_y for update;
  v_seq := nextval('public.pb_seq');
  insert into pb_pixels (event_id, x, y, color, team, user_id, seq) values (p_ev, p_x, p_y, p_color, pl.team, auth.uid(), v_seq)
    on conflict (event_id, x, y) do update set color = excluded.color, team = excluded.team, user_id = excluded.user_id, seq = excluded.seq;
  insert into pb_cells (event_id, cell) values (p_ev, v_cell) on conflict do nothing;
  if v_old is null then
    update pb_cells set c0 = c0 + (pl.team = 0)::int, c1 = c1 + (pl.team = 1)::int where event_id = p_ev and cell = v_cell;
  elsif v_old <> pl.team then
    update pb_cells set c0 = c0 + (pl.team = 0)::int - (v_old = 0)::int, c1 = c1 + (pl.team = 1)::int - (v_old = 1)::int where event_id = p_ev and cell = v_cell;
  end if;
  update pb_players set placed = placed + 1, last_at = now() where event_id = p_ev and user_id = auth.uid();
  return jsonb_build_object('ok', true, 'seq', v_seq, 'wait_ms', v_cd * 1000);
end $$;
-- @@
-- ---------- итоги и следующий раунд (выполняется один раз, любым игроком) ----------
create or replace function public.pb_finalize(p_ev uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; sc jsonb; v_win int; v_new uuid; v_gap int; v_len interval; n0 int; n1 int; v_changed int;
begin
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then return null; end if;
  if e.finalized then return e.result; end if;
  if now() < e.ends_at then return null; end if;
  sc := pb_scores(p_ev);
  select count(*) filter (where team = 0), count(*) filter (where team = 1) into n0, n1 from pb_players where event_id = p_ev;
  v_win := case when (sc->'s'->>0)::numeric > (sc->'s'->>1)::numeric then 0 when (sc->'s'->>1)::numeric > (sc->'s'->>0)::numeric then 1 else null end;
  update events set finalized = true,
    result = sc || jsonb_build_object('winner', v_win, 'players', jsonb_build_array(n0, n1))
    where id = p_ev and not finalized;
  get diagnostics v_changed = row_count;
  if v_changed = 1 and coalesce((e.config->>'auto_next')::boolean, false) then
    v_gap := coalesce((e.config->>'break')::int, 120);
    v_len := e.ends_at - e.starts_at;
    insert into events (title, description, kind, starts_at, ends_at, created_by, config)
      values (e.title, e.description, 'pixelbattle', e.ends_at + make_interval(secs => v_gap), e.ends_at + make_interval(secs => v_gap) + v_len, e.created_by, e.config)
      returning id into v_new;
  end if;
  return (select result from events where id = p_ev);
end $$;
-- @@
-- ---------- состояние для клиента ----------
create or replace function public.pb_state(p_ev uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; pl pb_players; v_px jsonb; v_max bigint; v_n0 int; v_n1 int;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then raise exception 'ивент не найден'; end if;
  if now() >= e.ends_at and not e.finalized then perform pb_finalize(p_ev); select * into e from events where id = p_ev; end if;
  select * into pl from pb_players where event_id = p_ev and user_id = auth.uid();
  select coalesce(jsonb_agg(((y::int * 1000 + x::int) * 16 + color) * 2 + team), '[]'::jsonb), coalesce(max(seq), 0)
    into v_px, v_max from pb_pixels where event_id = p_ev;
  select count(*) filter (where team = 0), count(*) filter (where team = 1) into v_n0, v_n1 from pb_players where event_id = p_ev;
  return jsonb_build_object('now', now(), 'event', to_jsonb(e), 'team', pl.team, 'last_at', pl.last_at, 'placed', coalesce(pl.placed, 0),
    'scores', pb_scores(p_ev), 'players', jsonb_build_array(v_n0, v_n1), 'pixels', v_px, 'seq', v_max);
end $$;
-- @@
-- ---------- изменения с последнего опроса (раз в ~2 секунды) ----------
create or replace function public.pb_poll(p_ev uuid, p_since bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; v_px jsonb; v_max bigint; v_n0 int; v_n1 int; pl pb_players;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then raise exception 'ивент не найден'; end if;
  if now() >= e.ends_at and not e.finalized then perform pb_finalize(p_ev); select * into e from events where id = p_ev; end if;
  select coalesce(jsonb_agg(((y::int * 1000 + x::int) * 16 + color) * 2 + team order by seq), '[]'::jsonb), coalesce(max(seq), p_since)
    into v_px, v_max from (select * from pb_pixels where event_id = p_ev and seq > coalesce(p_since, 0) order by seq limit 20000) q;
  select count(*) filter (where team = 0), count(*) filter (where team = 1) into v_n0, v_n1 from pb_players where event_id = p_ev;
  select * into pl from pb_players where event_id = p_ev and user_id = auth.uid();
  return jsonb_build_object('now', now(), 'ends_at', e.ends_at, 'finalized', e.finalized, 'result', e.result, 'placed', coalesce(pl.placed, 0),
    'scores', pb_scores(p_ev), 'players', jsonb_build_array(v_n0, v_n1), 'pixels', v_px, 'seq', v_max);
end $$;
-- @@
-- ---------- рейтинг ----------
-- p_ev = null → за всё время (пиксели и победы команды), иначе — внутри одного ивента
create or replace function public.pb_leaderboard(p_ev uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  return coalesce((select jsonb_agg(r) from (
    select pr.id as user_id, pr.first_name, pr.last_name, sum(pp.placed)::int as placed,
           count(*) filter (where ev.finalized and (ev.result->>'winner')::int = pp.team)::int as wins, count(*)::int as battles
      from pb_players pp join profiles pr on pr.id = pp.user_id join events ev on ev.id = pp.event_id
     where p_ev is null or pp.event_id = p_ev
     group by pr.id, pr.first_name, pr.last_name
     order by sum(pp.placed) desc, pr.id limit 50) r), '[]'::jsonb);
end $$;
-- @@
grant execute on function public.pb_join(uuid), public.pb_place(uuid,int,int,int), public.pb_state(uuid),
  public.pb_poll(uuid,bigint), public.pb_finalize(uuid), public.pb_leaderboard(uuid), public.pb_scores(uuid) to authenticated;
-- @@
notify pgrst, 'reload schema';
