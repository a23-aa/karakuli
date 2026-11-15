-- Каракули — миграция 006: видео в постах, голосовые/кружки/файлы в чате, звонки
-- Выполнять после migration_005_modes.sql. Безопасно запускать повторно.
-- Фрагменты разделены служебными строками-разделителями (нужны только для варианта «одним запросом»).

alter table public.messages add column if not exists kind     text not null default 'text';
alter table public.messages add column if not exists duration int;
alter table public.messages add column if not exists file_name text;
-- @@
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','photo','video','voice','circle','file','call'));
-- @@
-- хранилище для видео, голосовых, кружков и файлов: публичное чтение, загрузка только в свою папку, до 50 МБ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', true, 52428800, array[
  'video/mp4','video/webm','video/quicktime','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a','audio/wav',
  'image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/zip',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- @@
drop policy if exists files_read   on storage.objects;
create policy files_read   on storage.objects for select using (bucket_id = 'files');
drop policy if exists files_upload on storage.objects;
create policy files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned());
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
-- @@
-- сигналы для звонков (WebRTC): отправитель проверяется базой, получатель видит только свои
create table if not exists public.call_signals (
  id           bigint generated always as identity primary key,
  call_id      uuid not null,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('offer','answer','ice','end','decline')),
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists call_signals_rcpt on public.call_signals (recipient_id, id);
alter table public.call_signals enable row level security;
-- @@
drop policy if exists cs_select on public.call_signals;
create policy cs_select on public.call_signals for select to authenticated using (recipient_id = auth.uid() or sender_id = auth.uid());
drop policy if exists cs_insert on public.call_signals;
create policy cs_insert on public.call_signals for insert to authenticated with check (sender_id = auth.uid() and recipient_id <> auth.uid() and not public.is_banned());
drop policy if exists cs_delete on public.call_signals;
create policy cs_delete on public.call_signals for delete to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
revoke all on public.call_signals from anon;
grant select, insert, delete on public.call_signals to authenticated;
-- @@
do $$ begin
  alter publication supabase_realtime add table public.call_signals;
exception when duplicate_object then null; when undefined_object then null; end $$;
-- @@
-- старые сигналы чистятся при каждой новой отправке (больше часа)
create or replace function public.call_signals_gc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from call_signals where created_at < now() - interval '1 hour';
  return null;
end $$;
-- @@
drop trigger if exists call_signals_gc_trg on public.call_signals;
create trigger call_signals_gc_trg after insert on public.call_signals for each statement execute function public.call_signals_gc();
-- @@
notify pgrst, 'reload schema';
