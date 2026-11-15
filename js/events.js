/* Каракули — портал ивентов: идёт ивент / «Ждите ивента» / таймер до начала. Содержимое самих ивентов — позже. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'events') return;

  F.page('events', { right: false }, c => {
    const E = F.events, me = F.me();
    let list = [], tick = null, failed = false, timer = null;
    c.innerHTML = `<div class="toolbar"><h1 class="page-title">Портал ивентов</h1>${me.isAdmin ? '<a class="btn btn-ghost btn-sm" href="admin.html?tab=events">Управлять ивентами</a>' : ''}</div><div id="ev"></div><div id="hub"></div>`;
    const box = F.$('#ev', c);
    const when = ms => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const portal = (() => { const pat = ['00011000','00111100','01111110','11111111','01111110','01100110','11000011','10000001'], cols = ['#4f6df5', '#8b6cf0', '#f0577d', '#ffb347']; // статичная пиксельная «звезда»
      return `<svg class="ev-art" viewBox="0 0 96 96" width="112" height="112" aria-hidden="true">${pat.map((r, y) => [...r].map((v, x) => v === '1' ? `<rect x="${x * 12}" y="${y * 12}" width="11" height="11" rx="2.5" fill="${cols[(Math.min(x, 7 - x) + y) % 4]}"/>` : '').join('')).join('')}</svg>`; })();
    const cdBlocks = ms => { const m = String(E.clock(ms)).match(/^(?:(\d+) д )?(\d\d):(\d\d):(\d\d)$/) || [], u = [['д', m[1]], ['час', m[2]], ['мин', m[3]], ['сек', m[4]]].filter(x => x[1] != null); return u.map(x => `<span class="cdb"><b>${x[1]}</b><i>${x[0]}</i></span>`).join(''); };

    const RULES = { team_war: 'Две команды, игроки распределяются поровну. Побеждает команда, у которой в конце больше пикселей.', solo: 'Команд нет — каждый сам за себя. Побеждает игрок, у которого в конце больше всего своих пикселей на поле.' };
    function playCard(e, live) {
      const cfg = e.config || {}, mode = F.PIXEL_KINDS[cfg.mode] || 'Pixel Battle';
      return `<section class="card card-pad pb-card"><div class="pb-head"><span class="pb-chip">${mode}</span><span class="muted small">Поле 1000×1000 · кулдаун ${cfg.cooldown ?? 30} с · ${cfg.mode === 'solo' ? 'без команд' : '2 команды'}</span></div>
<p>${RULES[cfg.mode] || RULES.team_war}</p><p class="muted small">${cfg.mode === 'solo' ? '' : 'Команду выбирает система. '}Пиксели появляются у всех сразу.</p>
${live ? `<a class="btn pb-play" href="battle.html?e=${e.id}">▶ ИГРАТЬ</a>` : '<button class="btn" disabled>Откроется со стартом</button>'}</section>`;
    }
    let hubTab = 'rating';
    async function drawHub() {
      const hub = F.$('#hub', c); if (!hub) return;
      let hist = [], board = [];
      try { const h = await F.sb.from('events').select('*').eq('kind', 'pixelbattle').eq('finalized', true).order('ends_at', { ascending: false }).limit(15); hist = h.data || []; } catch (e) { /* нет таблиц */ }
      try { const b = await F.sb.rpc('pb_leaderboard', { p_ev: null }); board = b.data || []; } catch (e) { /* нет */ }
      if (!hist.length && !board.length) { hub.innerHTML = ''; return; }
      const meId = F.sessionId(), mine = board.find(u => u.user_id === meId);
      const tn = ['Огонь', 'Лёд'];
      hub.innerHTML = `<section class="card card-pad" style="margin-top:14px"><div class="tabs" style="margin-bottom:10px"><button class="tab${hubTab === 'rating' ? ' active' : ''}" data-h="rating">Рейтинг</button><button class="tab${hubTab === 'hist' ? ' active' : ''}" data-h="hist">История</button></div>
${hubTab === 'rating' ? (mine ? `<p class="small">Ваш результат: <b>${mine.placed}</b> пикс. · побед команды: <b>${mine.wins}</b> · раундов: <b>${mine.battles}</b></p>` : '') + (board.slice(0, 15).map((u, i) => `<div class="rowitem"><b style="width:26px">${i + 1}</b><span class="grow">${F.esc((u.first_name + ' ' + u.last_name).trim() || 'Игрок')}${u.user_id === meId ? ' (вы)' : ''}</span><b>${u.placed}</b></div>`).join('') || '<div class="muted">Пока пусто</div>')
: hist.map(e => { const r = e.result || {}, w = r.winner; return `<div class="rowitem"><span class="grow"><b>${F.esc(e.title)}</b><div class="muted small">${when(Date.parse(e.ends_at))} · ${F.PIXEL_KINDS[(e.config || {}).mode] || ''}</div></span><span>${r.winner_name ? 'Победил ' + F.esc(r.winner_name) : w == null ? 'Ничья' : 'Победил «' + tn[w] + '»'} <span class="muted small">${(e.config || {}).mode === 'solo' ? (r.winner_owned || '') : (r.s || [0, 0]).join(' : ')}</span></span></div>`; }).join('') || '<div class="muted">Завершённых раундов нет</div>'}</section>`;
      hub.onclick = ev => { const b = ev.target.closest('[data-h]'); if (b) { hubTab = b.dataset.h; drawHub(); } };
    }
    function draw() {
      const { active, next } = E.state(list), t = E.now();
      if (active) {
        box.innerHTML = `<section class="card ev-hero live">${portal}<div class="ev-body"><span class="live-tag"><i></i>Идёт сейчас</span><h2>${F.esc(active.title)}</h2>${active.description ? `<p>${F.esc(active.description).replace(/\n/g, '<br>')}</p>` : ''}
<div class="cd-label">Закончится через</div><div class="cd" data-end="${Date.parse(active.ends_at)}">${cdBlocks(Date.parse(active.ends_at) - t)}</div></div></section>
${active.kind === 'pixelbattle' ? playCard(active, true) : `<section class="card card-pad event-stage"><div class="empty">${F.ic('portal', 44)}<div><b>Ивент запущен</b></div><p class="muted small">Следите за этой страницей.</p></div></section>`}`;
      } else if (next) {
        box.innerHTML = `<section class="card ev-hero">${portal}<div class="ev-body"><span class="live-tag soon">Скоро</span><h2>${F.esc(next.title)}</h2>${next.description ? `<p>${F.esc(next.description).replace(/\n/g, '<br>')}</p>` : ''}
<div class="cd-label">До начала</div><div class="cd" data-start="${Date.parse(next.starts_at)}">${cdBlocks(Date.parse(next.starts_at) - t)}</div><div class="muted-on small">Начало: ${when(Date.parse(next.starts_at))}</div></div></section>${next.kind === 'pixelbattle' ? playCard(next, false) : ''}`;
      } else {
        box.innerHTML = `<section class="card ev-hero idle">${portal}<div class="ev-body"><h2>Ждите ивента</h2><p>Сейчас ивентов нет. Когда появится новый, он откроется здесь.</p>${failed && me.isAdmin ? '<p class="small">Администратору: выполните в Supabase файл migration_003_social.sql, чтобы подключить ивенты.</p>' : ''}</div></section>`;
      }
    }
    function tickAll() {
      const t = E.now(); let flip = false;
      F.$$('[data-end]', box).forEach(el => { const ms = +el.dataset.end - t; el.innerHTML = cdBlocks(ms); if (ms <= 0) flip = true; });
      F.$$('[data-start]', box).forEach(el => { const ms = +el.dataset.start - t; el.innerHTML = cdBlocks(ms); if (ms <= 0) flip = true; });
      if (flip) { draw(); load(); }
    }
    async function load() {
      try { list = await E.load(); failed = false; } catch (e) { list = []; failed = true; }
      draw(); drawHub();
    }
    (async () => {
      await E.sync(); await load();
      tick = setInterval(tickAll, 1000);
      timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
      try { F.sb.channel('events-live').on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load).subscribe(); } catch (e) { /* без realtime обновится по таймеру */ }
    })();
    window.addEventListener('pagehide', () => { clearInterval(tick); clearInterval(timer); });
  });
})(window.Karakuli);
