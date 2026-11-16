-- CrownNet — миграция 008: ники от 2 символов, просмотры постов, удаление своих сообщений,
-- упоминания, поддержка, заявки на галочку, push без смайликов. Выполняется один раз (повтор безопасен).

-- ник: от 2 до 32 символов
alter table public.profiles drop constraint if exists profiles_username_fmt;
-- @@
alter table public.profiles add constraint profiles_username_fmt check (username is null or username ~ '^[a-z][a-z0-9_]{1,31}$');
-- @@
create or replace function public.username_reserved(u text) returns boolean
language sql immutable as $$
  select u = any (array['admin','administrator','karakuli','crownnet','crown','support','moderator','official','system','root','help','owner','telegram','vk']);
$$;
-- @@
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z][a-z0-9_]{1,31}$'
     and not public.username_reserved(lower(u))
     and not exists (select 1 from public.profiles where username = lower(u));
$$;
-- @@
-- создание профиля: имя на сайте = ник (если он указан при регистрации), иначе как раньше
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare fullname text; f text; l text; un text;
begin
  un := lower(nullif(new.raw_user_meta_data->>'username', ''));
  f := coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'given_name');
  l := coalesce(new.raw_user_meta_data->>'last_name',  new.raw_user_meta_data->>'family_name');
  if f is null then
    fullname := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1));
    f := split_part(fullname, ' ', 1);
    l := coalesce(nullif(trim(substr(fullname, length(split_part(fullname, ' ', 1)) + 1)), ''), '');
  end if;
  begin
    insert into public.profiles (id, first_name, last_name, avatar_url, username)
    values (new.id, coalesce(f, ''), coalesce(l, ''), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
            case when un is not null and un ~ '^[a-z][a-z0-9_]{1,31}$' and public.username_available(un) then un else null end);
  exception when unique_violation then
    insert into public.profiles (id, first_name, last_name, avatar_url) values (new.id, coalesce(f, ''), coalesce(l, ''), null);
  end;
  return new;
end $$;
-- @@
-- просмотры постов
alter table public.posts add column if not exists views integer not null default 0;
-- @@
create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
-- @@
alter table public.post_views enable row level security;
-- @@
create or replace function public.post_views_inc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('crown.views', '1', true);
  update public.posts set views = views + 1 where id = new.post_id;
  return null;
end $$;
-- @@
drop trigger if exists post_views_inc_trg on public.post_views;
-- @@
create trigger post_views_inc_trg after insert on public.post_views for each row execute function public.post_views_inc();
-- @@
create or replace function public.posts_views_guard() returns trigger
language plpgsql as $$
begin
  if new.views is distinct from old.views and coalesce(current_setting('crown.views', true), '') <> '1' then new.views := old.views; end if;
  return new;
end $$;
-- @@
drop trigger if exists posts_views_guard_trg on public.posts;
-- @@
create trigger posts_views_guard_trg before update on public.posts for each row execute function public.posts_views_guard();
-- @@
create or replace function public.post_seen(ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.post_views (post_id, user_id)
    select p.id, auth.uid() from public.posts p where p.id = any(ids) on conflict do nothing;
end $$;
-- @@
grant execute on function public.post_seen(uuid[]) to authenticated;
-- @@
-- удалять можно свои сообщения (у обоих собеседников)
drop policy if exists messages_delete_own on public.messages;
-- @@
create policy messages_delete_own on public.messages for delete to authenticated using (sender_id = auth.uid());
-- @@
grant delete on public.messages to authenticated;
-- @@
-- новый тип уведомления: упоминание
alter table public.notifications drop constraint if exists notifications_type_check;
-- @@
alter table public.notifications add constraint notifications_type_check
  check (type in ('like','comment','friend_request','friend_accept','message','community_post','repost','follow','mention'));
-- @@
-- поддержка
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  body text not null check (char_length(body) between 1 and 3000),
  status text not null default 'open' check (status in ('open','answered','closed')),
  reply text,
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
-- @@
alter table public.support_tickets enable row level security;
-- @@
drop policy if exists support_select on public.support_tickets;
-- @@
create policy support_select on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- @@
drop policy if exists support_insert on public.support_tickets;
-- @@
create policy support_insert on public.support_tickets for insert to authenticated with check (user_id = auth.uid() and not public.is_banned());
-- @@
drop policy if exists support_admin_update on public.support_tickets;
-- @@
create policy support_admin_update on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- @@
-- заявки на галочку
create table if not exists public.badge_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge text not null check (badge in ('verified','blogger')),
  reason text not null check (char_length(reason) between 1 and 1500),
  link text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
-- @@
create unique index if not exists badge_requests_one_pending on public.badge_requests (user_id) where status = 'pending';
-- @@
alter table public.badge_requests enable row level security;
-- @@
drop policy if exists badgereq_select on public.badge_requests;
-- @@
create policy badgereq_select on public.badge_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- @@
drop policy if exists badgereq_insert on public.badge_requests;
-- @@
create policy badgereq_insert on public.badge_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and not public.is_banned());
-- @@
create or replace function public.admin_review_badge(req uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.badge_requests;
begin
  if not public.is_admin() then raise exception 'у вас нет прав на это действие'; end if;
  select * into r from public.badge_requests where id = req and status = 'pending';
  if r.id is null then return; end if;
  update public.badge_requests set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now() where id = req;
  if approve then perform public.admin_set_badge(r.user_id, r.badge); end if;
end $$;
-- @@
grant execute on function public.admin_review_badge(uuid, boolean) to authenticated;
-- @@
-- push без смайликов
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_body text; r record;
begin
  if new.type = 'community_post' then select name into v_name from communities where id = new.community_id;
  else select coalesce(nullif(username, ''), trim(first_name || ' ' || last_name)) into v_name from profiles where id = new.from_id; end if;
  if new.type = 'message' then
    select kind, body into r from messages where sender_id = new.from_id and recipient_id = new.user_id order by created_at desc limit 1;
    if r.kind = 'call' then return null; end if;
    v_body := case r.kind when 'voice' then 'Голосовое сообщение' when 'circle' then 'Кружок' when 'video' then 'Видео' when 'photo' then 'Фото' when 'file' then 'Файл'
      else left(coalesce(nullif(r.body, ''), 'Новое сообщение'), 140) end;
  else
    v_body := case new.type when 'like' then 'оценил(а) вашу запись' when 'comment' then 'прокомментировал(а) вашу запись' when 'friend_request' then 'отправил(а) вам заявку в друзья'
      when 'friend_accept' then 'принял(а) вашу заявку в друзья' when 'community_post' then 'опубликовало новую запись' when 'repost' then 'поделился(ась) вашей записью'
      when 'follow' then 'подписался(-ась) на вас' when 'mention' then 'упомянул(а) вас' else 'новое уведомление' end;
  end if;
  perform push_send(new.user_id, coalesce(nullif(v_name, ''), 'CrownNet'), v_body, coalesce(nullif(new.link, ''), 'notifications.html'),
    case when new.type = 'message' then 'msg-' || new.from_id::text else null end);
  return null;
end $$;
