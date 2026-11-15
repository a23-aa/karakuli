-- Каракули — миграция 007: push-уведомления (сообщения, звонки, ивенты, всё из «Уведомлений») на телефон и компьютер
-- Выполнять после migration_006_media.sql. Безопасно запускать повторно.
-- Ещё нужно: 1) выполнить запрос с приватным VAPID-ключом (даётся отдельно), 2) создать Edge Function «push» (supabase/functions/push/index.ts).
-- Фрагменты разделены служебными строками-разделителями (нужны только для варианта «одним запросом»).

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net: %', sqlerrm; end $$;
-- @@
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- @@
-- настройки отправки: читает только Edge Function и функции базы (доступа с сайта нет)
create table if not exists public.push_config (key text primary key, value text not null);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (key, value) values
  ('url', 'https://dwqaopsvburojrjxrdls.supabase.co/functions/v1/push'),
  ('vapid_public', 'BETp-sabCJLZVsv8suGTfWoK3yaFrzSpJlFc02KRDWdsXCr_zxUbS-rVqS_bOraSi7vnXoPGluhFziP6hbf5skE'),
  ('vapid_subject', 'https://a23-aa.github.io/karakuli/'),
  ('secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
on conflict (key) do nothing;
-- @@
create or replace function public.push_register(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, ua) values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_ua)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua;
end $$;
-- @@
create or replace function public.push_unregister(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;
-- @@
grant execute on function public.push_register(text,text,text,text), public.push_unregister(text) to authenticated;
-- @@
-- отправка: p_user = null → всем подписанным. Любая ошибка здесь никогда не мешает основному действию.
create or replace function public.push_send(p_user uuid, p_title text, p_body text, p_url text, p_tag text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if p_user is not null and not exists (select 1 from push_subscriptions where user_id = p_user) then return; end if;
  select value into v_url from push_config where key = 'url';
  select value into v_secret from push_config where key = 'secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', p_user, 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag));
exception when others then null;
end $$;
-- @@
-- любое уведомление сайта (сообщение, лайк, заявка, подписка…) → push
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_body text; r record;
begin
  if new.type = 'community_post' then select name into v_name from communities where id = new.community_id;
  else select trim(first_name || ' ' || last_name) into v_name from profiles where id = new.from_id; end if;
  if new.type = 'message' then
    select kind, body into r from messages where sender_id = new.from_id and recipient_id = new.user_id order by created_at desc limit 1;
    if r.kind = 'call' then return null; end if;
    v_body := case r.kind when 'voice' then '🎤 Голосовое сообщение' when 'circle' then '⭕ Кружок' when 'video' then '🎬 Видео' when 'photo' then '📷 Фото' when 'file' then '📎 Файл'
      else left(coalesce(nullif(r.body, ''), 'Новое сообщение'), 140) end;
  else
    v_body := case new.type when 'like' then 'оценил(а) вашу запись' when 'comment' then 'прокомментировал(а) вашу запись' when 'friend_request' then 'отправил(а) вам заявку в друзья'
      when 'friend_accept' then 'принял(а) вашу заявку в друзья' when 'community_post' then 'опубликовало новую запись' when 'repost' then 'поделился(ась) вашей записью'
      when 'follow' then 'подписался(-ась) на вас' else 'новое уведомление' end;
  end if;
  perform push_send(new.user_id, coalesce(nullif(v_name, ''), 'Каракули'), v_body, coalesce(nullif(new.link, ''), 'notifications.html'),
    case when new.type = 'message' then 'msg-' || new.from_id::text else null end);
  return null;
end $$;
-- @@
drop trigger if exists push_on_notification_trg on public.notifications;
create trigger push_on_notification_trg after insert on public.notifications for each row execute function public.push_on_notification();
-- @@
-- входящий звонок
create or replace function public.push_on_call() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.kind <> 'offer' then return null; end if;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = new.sender_id;
  perform push_send(new.recipient_id, coalesce(nullif(v_name, ''), 'Каракули'), case when (new.payload->>'video')::boolean then '📹 Видеозвонок' else '📞 Входящий звонок' end,
    'messages.html?u=' || new.sender_id::text, 'call');
  return null;
end $$;
-- @@
drop trigger if exists push_on_call_trg on public.call_signals;
create trigger push_on_call_trg after insert on public.call_signals for each row execute function public.push_on_call();
-- @@
-- ивенты: за 10 минут до начала и в момент старта (проверяется раз в минуту)
alter table public.events add column if not exists push_soon boolean not null default false;
alter table public.events add column if not exists push_sent boolean not null default false;
-- @@
create or replace function public.push_due_events() returns void
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in update events set push_sent = true, push_soon = true where not push_sent and starts_at <= now() and ends_at > now() returning title loop
    perform push_send(null, '🎮 ' || e.title, 'Ивент начался! Заходите.', 'events.html', 'event');
  end loop;
  for e in update events set push_soon = true where not push_soon and not push_sent and starts_at > now() and starts_at <= now() + interval '10 minutes' returning title, starts_at loop
    perform push_send(null, '⏰ ' || e.title, 'Ивент начнётся через несколько минут', 'events.html', 'event');
  end loop;
end $$;
-- @@
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('karakuli-push-events', '* * * * *', 'select public.push_due_events()');
exception when others then raise notice 'pg_cron недоступен: % — включите расширение pg_cron в Database → Extensions', sqlerrm; end $$;
-- @@
notify pgrst, 'reload schema';
