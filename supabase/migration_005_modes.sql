-- Каракули — миграция 005: два режима Pixel Battle (с командами / каждый сам за себя).
-- Выполнять после migration_004_pixelbattle.sql. Безопасно запускать повторно.

alter table public.pb_players add column if not exists owned int not null default 0;
-- @@
update public.pb_players pp set owned = coalesce((select count(*) from public.pb_pixels x where x.event_id = pp.event_id and x.user_id = pp.user_id), 0);
-- @@
create or replace function public.pb_scores(p_ev uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_top jsonb; v_mode text; s0 numeric := 0; s1 numeric := 0; z0 int := 0; z1 int := 0; p0 int := 0; p1 int := 0;
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
  select coalesce(jsonb_agg(jsonb_build_object('id', t.user_id, 'name', t.nm, 'owned', t.owned)), '[]'::jsonb) into v_top from (
    select pp.user_id, trim(pr.first_name || ' ' || pr.last_name) as nm, pp.owned from pb_players pp join profiles pr on pr.id = pp.user_id
     where pp.event_id = p_ev and pp.owned > 0 order by pp.owned desc, pp.joined_at limit 5) t;
  return jsonb_build_object('top', v_top, 'mode', v_mode, 's', jsonb_build_array(s0, s1), 'pixels', jsonb_build_array(p0, p1), 'zones', jsonb_build_array(z0, z1));
end $$;
-- @@
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
  v_team := case when coalesce(e.config->>'mode','') = 'solo' then 0 when n0 < n1 then 0 when n1 < n0 then 1 else (random() < .5)::int end;
  insert into pb_players (event_id, user_id, team) values (p_ev, auth.uid(), v_team)
    on conflict (event_id, user_id) do nothing;
  select team into v_team from pb_players where event_id = p_ev and user_id = auth.uid();
  return jsonb_build_object('team', v_team);
end $$;
-- @@
create or replace function public.pb_place(p_ev uuid, p_x int, p_y int, p_color int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; pl pb_players; v_cd int; v_old smallint; v_old_user uuid; v_cell int; v_seq bigint; v_next timestamptz;
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
  select team, user_id into v_old, v_old_user from pb_pixels where event_id = p_ev and x = p_x and y = p_y for update;
  v_seq := nextval('public.pb_seq');
  insert into pb_pixels (event_id, x, y, color, team, user_id, seq) values (p_ev, p_x, p_y, p_color, pl.team, auth.uid(), v_seq)
    on conflict (event_id, x, y) do update set color = excluded.color, team = excluded.team, user_id = excluded.user_id, seq = excluded.seq;
  insert into pb_cells (event_id, cell) values (p_ev, v_cell) on conflict do nothing;
  if v_old is null then
    update pb_cells set c0 = c0 + (pl.team = 0)::int, c1 = c1 + (pl.team = 1)::int where event_id = p_ev and cell = v_cell;
  elsif v_old <> pl.team then
    update pb_cells set c0 = c0 + (pl.team = 0)::int - (v_old = 0)::int, c1 = c1 + (pl.team = 1)::int - (v_old = 1)::int where event_id = p_ev and cell = v_cell;
  end if;
  if v_old_user is distinct from auth.uid() then
    if v_old_user is not null then update pb_players set owned = greatest(0, owned - 1) where event_id = p_ev and user_id = v_old_user; end if;
    update pb_players set owned = owned + 1 where event_id = p_ev and user_id = auth.uid();
  end if;
  update pb_players set placed = placed + 1, last_at = now() where event_id = p_ev and user_id = auth.uid();
  return jsonb_build_object('ok', true, 'seq', v_seq, 'wait_ms', v_cd * 1000);
end $$;
-- @@
create or replace function public.pb_finalize(p_ev uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_wu uuid; v_wn text; v_a int; v_b int; e events; sc jsonb; v_win int; v_new uuid; v_gap int; v_len interval; n0 int; n1 int; v_changed int;
begin
  select * into e from events where id = p_ev and kind = 'pixelbattle';
  if not found then return null; end if;
  if e.finalized then return e.result; end if;
  if now() < e.ends_at then return null; end if;
  sc := pb_scores(p_ev);
  select count(*) filter (where team = 0), count(*) filter (where team = 1) into n0, n1 from pb_players where event_id = p_ev;
  v_win := case when (sc->'s'->>0)::numeric > (sc->'s'->>1)::numeric then 0 when (sc->'s'->>1)::numeric > (sc->'s'->>0)::numeric then 1 else null end;
  if coalesce(e.config->>'mode','') = 'solo' then
    select user_id, owned into v_wu, v_a from pb_players where event_id = p_ev order by owned desc, joined_at limit 1;
    select owned into v_b from pb_players where event_id = p_ev order by owned desc, joined_at offset 1 limit 1;
    if v_wu is not null and v_a > 0 and v_a is distinct from v_b then
      select trim(first_name || ' ' || last_name) into v_wn from profiles where id = v_wu;
      sc := sc || jsonb_build_object('winner_user', v_wu, 'winner_name', v_wn, 'winner_owned', v_a);
    end if;
  end if;
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
  return jsonb_build_object('now', now(), 'event', to_jsonb(e), 'team', pl.team, 'last_at', pl.last_at, 'placed', coalesce(pl.placed, 0), 'owned', coalesce(pl.owned, 0),
    'scores', pb_scores(p_ev), 'players', jsonb_build_array(v_n0, v_n1), 'pixels', v_px, 'seq', v_max);
end $$;
-- @@
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
  return jsonb_build_object('now', now(), 'ends_at', e.ends_at, 'finalized', e.finalized, 'result', e.result, 'placed', coalesce(pl.placed, 0), 'owned', coalesce(pl.owned, 0),
    'scores', pb_scores(p_ev), 'players', jsonb_build_array(v_n0, v_n1), 'pixels', v_px, 'seq', v_max);
end $$;
-- @@
create or replace function public.pb_leaderboard(p_ev uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  return coalesce((select jsonb_agg(r) from (
    select pr.id as user_id, pr.first_name, pr.last_name, sum(pp.placed)::int as placed,
           count(*) filter (where ev.finalized and ((coalesce(ev.config->>'mode','') <> 'solo' and (ev.result->>'winner')::int = pp.team) or ev.result->>'winner_user' = pp.user_id::text))::int as wins, count(*)::int as battles
      from pb_players pp join profiles pr on pr.id = pp.user_id join events ev on ev.id = pp.event_id
     where p_ev is null or pp.event_id = p_ev
     group by pr.id, pr.first_name, pr.last_name
     order by sum(pp.placed) desc, pr.id limit 50) r), '[]'::jsonb);
end $$;
-- @@
notify pgrst, 'reload schema';
