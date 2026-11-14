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
