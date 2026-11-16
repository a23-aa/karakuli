/* CrownNet — Pixel Battle: общее поле 1000×1000, две команды, кулдаун на сервере.
   Все записи идут через функции pb_* в базе; здесь только рисование, опрос раз в ~2 с и интерфейс. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'battle') return;

  const N = 1000, CELL = 50, GRID = 20;
  const PALETTE = ['#ffffff', '#c4c4c4', '#6d6d6d', '#000000', '#ff3d5a', '#ff9f1c', '#ffe14d', '#9be564', '#1fbf75', '#22d3ee', '#2e8bff', '#3b3fe0', '#8f5bff', '#e254d8', '#ff7aa8', '#8a5a3b'];
  const TEAMS = [{ name: 'Огонь', c: '#ff4d6d' }, { name: 'Лёд', c: '#35c8ff' }];
  const MODES = {
    team_war: ['С КОМАНДАМИ', 'Две команды, игроки распределяются поровну. Побеждает команда, у которой в конце больше пикселей.'],
    solo: ['КАЖДЫЙ САМ ЗА СЕБЯ', 'Команд нет. Побеждает игрок, у которого в конце больше всего своих пикселей на поле.']
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return (255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16); }; // ABGR
  const PAL32 = PALETTE.map(hex), TEAM32 = TEAMS.map(t => hex(t.c));

  F.page('battle', { bare: true }, async root => {
    const E = F.events, sb = F.sb, esc = F.esc;
    await E.sync();
    let evId = new URLSearchParams(location.search).get('e');
    if (!evId) {
      try { const l = (await E.load()).filter(e => e.kind === 'pixelbattle'), st = E.state(l); evId = (st.active || st.next || l[0] || {}).id; } catch (e) { /* ниже */ }
    }
    if (!evId) { location.replace('events.html'); return; }

    // ---------- состояние ----------
    const col = new Uint8Array(N * N).fill(255), tm = new Uint8Array(N * N);
    const c0 = new Int32Array(GRID * GRID), c1 = new Int32Array(GRID * GRID);
    const off = document.createElement('canvas'); off.width = off.height = N;
    const octx = off.getContext('2d'), img = octx.createImageData(N, N), buf = new Uint32Array(img.data.buffer);
    let ev = null, team = null, seq = 0, placed = 0, nextAt = 0, cd = 30, sel = null, color = 4, teamView = false;
    let scores = null, players = [0, 0], finished = false, result = null, panelTab = null, busy = false, dirty = true;
    const solo = () => ((ev && ev.config) || {}).mode === 'solo';
    let owned = 0, theme = 'light'; try { theme = localStorage.getItem('pb-theme') || 'light'; } catch (e) { /* без памяти */ }
    document.body.dataset.pbtheme = theme;

    root.innerHTML = `
<header class="pb-top"><a class="pb-back" href="events.html" aria-label="Назад к ивентам">${F.ic('back', 22)}</a>
  <div class="pb-title"><b id="pb-name">Pixel Battle</b><span class="pb-mode" id="pb-mode"></span></div>
  <div class="pb-clock" id="pb-clock" title="До конца раунда">--:--</div>
  <button class="pb-ib" id="pb-theme" aria-label="Тема">◐</button>
  <button class="pb-ib" id="pb-info" aria-label="Команды и рейтинг">${F.ic('friends', 20)}</button></header>
<div class="pb-score" id="pb-score"></div>
<main class="pb-stage" id="pb-stage"><canvas id="pb-cv"></canvas>
  <div class="pb-zoom"><button id="z-in" aria-label="Приблизить">+</button><button id="z-out" aria-label="Отдалить">−</button><button id="z-fit" aria-label="Всё поле">⤢</button><button id="z-view" aria-label="Показать команды" title="Цвета / команды">◧</button></div>
  <div class="pb-coord" id="pb-coord"></div></main>
<footer class="pb-dock"><div class="pb-pal" id="pb-pal">${PALETTE.map((c, i) => `<button class="sw${i === color ? ' on' : ''}" data-c="${i}" style="background:${c}" aria-label="Цвет ${i + 1}"></button>`).join('')}</div>
  <button class="pb-place" id="pb-place"><i id="pb-fill"></i><span id="pb-place-t">Выберите клетку</span></button></footer>
<aside class="pb-panel" id="pb-panel" hidden></aside><div class="pb-over" id="pb-over" hidden></div>`;
    const $ = s => root.querySelector(s), cv = $('#pb-cv'), ctx = cv.getContext('2d'), stage = $('#pb-stage');

    // ---------- вид ----------
    let sc = 1, tx = 0, ty = 0, W = 0, H = 0, dpr = 1, minSc = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = stage.clientWidth; H = stage.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
      minSc = Math.max(0.2, Math.min(W, H) / N * 0.98); if (sc < minSc) sc = minSc; clamp(); dirty = true;
    }
    function fit() { sc = minSc; tx = (W - N * sc) / 2; ty = (H - N * sc) / 2; dirty = true; }
    function clamp() { const m = 60; tx = Math.min(W - m, Math.max(m - N * sc, tx)); ty = Math.min(H - m, Math.max(m - N * sc, ty)); }
    function zoomAt(f, px, py) { const ns = Math.min(64, Math.max(minSc, sc * f)); tx = px - (px - tx) * ns / sc; ty = py - (py - ty) * ns / sc; sc = ns; clamp(); dirty = true; }
    function draw() {
      dirty = false; const dark = document.body.dataset.pbtheme !== 'light';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = dark ? '#070a18' : '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * tx, dpr * ty); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = dark ? '#10152e' : '#ffffff'; ctx.fillRect(0, 0, N, N); ctx.drawImage(off, 0, 0);
      const mode = ev && ev.config && ev.config.mode;
      const x0 = Math.max(0, Math.floor(-tx / sc)), y0 = Math.max(0, Math.floor(-ty / sc)), x1 = Math.min(N, Math.ceil((W - tx) / sc)), y1 = Math.min(N, Math.ceil((H - ty) / sc));
      if (mode === 'territory_rush' || mode === 'pixel_domination') { // зоны по 50×50
        for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
          const i = gy * GRID + gx, a = c0[i], b = c1[i], mid = mode === 'pixel_domination' && gx >= 8 && gx <= 11 && gy >= 8 && gy <= 11;
          if (mode === 'territory_rush' && a !== b) { ctx.globalAlpha = .2; ctx.fillStyle = a > b ? TEAMS[0].c : TEAMS[1].c; ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL); }
          if (mid) { ctx.globalAlpha = .14; ctx.fillStyle = '#ffd34d'; ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL); }
        }
        ctx.globalAlpha = .35; ctx.strokeStyle = dark ? '#8aa0ff' : '#4f6df5'; ctx.lineWidth = 1 / sc; ctx.beginPath();
        for (let g = 0; g <= GRID; g++) { ctx.moveTo(g * CELL, 0); ctx.lineTo(g * CELL, N); ctx.moveTo(0, g * CELL); ctx.lineTo(N, g * CELL); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (sc >= 8) { ctx.globalAlpha = .18; ctx.strokeStyle = dark ? '#ffffff' : '#000000'; ctx.lineWidth = 1 / sc; ctx.beginPath(); for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); } ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = dark ? '#6d7dff' : '#b9c0d6'; ctx.lineWidth = 2 / sc; ctx.strokeRect(0, 0, N, N);
      if (sel) { ctx.fillStyle = PALETTE[color]; ctx.globalAlpha = .85; ctx.fillRect(sel.x, sel.y, 1, 1); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.5 / sc, .12); ctx.strokeRect(sel.x, sel.y, 1, 1); ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(.7 / sc, .05); ctx.strokeRect(sel.x + .08, sel.y + .08, .84, .84); }
    }
    (function loop() { if (dirty) draw(); requestAnimationFrame(loop); })();

    // ---------- поле ----------
    function paint(i, c, t) { buf[i] = teamView ? TEAM32[t] : PAL32[c]; }
    function setPixel(i, c, t, dontFlush) {
      const old = col[i], cell = (Math.floor(i / N / CELL)) * GRID + Math.floor((i % N) / CELL);
      if (old !== 255) { if (tm[i] === 0) c0[cell]--; else c1[cell]--; }
      col[i] = c; tm[i] = t; if (t === 0) c0[cell]++; else c1[cell]++;
      paint(i, c, t); if (!dontFlush) flush();
    }
    function flush() { octx.putImageData(img, 0, 0); dirty = true; }
    function repaintAll() { for (let i = 0; i < col.length; i++) if (col[i] !== 255) buf[i] = teamView ? TEAM32[tm[i]] : PAL32[col[i]]; flush(); }
    function applyPacked(arr) {
      for (const v of arr) { const t = v & 1, c = (v >> 1) & 15, i = v >> 5; setPixel(i, c, t, true); }
      if (arr.length) flush();
    }

    // ---------- интерфейс ----------
    function tick() {
      if (!ev) return; const t = E.now(), a = Date.parse(ev.starts_at), b = Date.parse(ev.ends_at);
      $('#pb-clock').textContent = finished ? 'конец' : t < a ? 'через ' + E.short(a - t) : E.clock(b - t).replace(/^00:/, '');
      const left = nextAt - t, btn = $('#pb-place'), live = t >= a && t < b && !finished && team !== null;
      if (!live) { btn.disabled = true; $('#pb-place-t').textContent = finished ? 'Раунд закончен' : t < a ? 'Ждём старта' : 'Вступаем в команду…'; $('#pb-fill').style.width = '0'; }
      else if (left > 0) { btn.disabled = true; $('#pb-place-t').textContent = 'Следующий пиксель через ' + Math.ceil(left / 1000) + ' с'; $('#pb-fill').style.width = Math.max(0, Math.min(100, (1 - left / (cd * 1000)) * 100)) + '%'; }
      else { btn.disabled = !sel || busy; $('#pb-fill').style.width = '100%'; $('#pb-place-t').textContent = sel ? `Поставить пиксель (${sel.x}, ${sel.y})` : 'Выберите клетку на поле'; }
      if (!finished && t >= b) poll();
    }
    function renderScore() {
      if (!scores) return;
      if (solo()) {
        const top = scores.top || [], me = F.sessionId();
        $('#pb-score').className = 'pb-score solo';
        $('#pb-score').innerHTML = `<div class="you">Ваших пикселей: <b>${owned}</b></div><div class="tops">${top.length ? top.map((u, i) => `<span class="${u.id === me ? 'me' : ''}">${i + 1}. ${esc(u.name || 'Игрок')} <b>${u.owned}</b></span>`).join('') : '<span class="muted">Пока никто не закрасил ни одного пикселя</span>'}</div>`;
        return;
      }
      $('#pb-score').className = 'pb-score';
      const s = scores.s, tot = (+s[0]) + (+s[1]), p0 = tot ? Math.round(+s[0] / tot * 100) : 50;
      $('#pb-score').innerHTML = `<div class="sb"><span class="tn" style="color:${TEAMS[0].c}">${TEAMS[0].name}${team === 0 ? ' · вы' : ''}</span><b>${s[0]}</b></div>
<div class="bar"><i style="width:${p0}%;background:${TEAMS[0].c}"></i><i style="width:${100 - p0}%;background:${TEAMS[1].c}"></i></div>
<div class="sb r"><b>${s[1]}</b><span class="tn" style="color:${TEAMS[1].c}">${team === 1 ? 'вы · ' : ''}${TEAMS[1].name}</span></div><div class="un">пикселей · игроков ${players[0]} : ${players[1]}</div>`;
    }
    function setEvent(e) {
      ev = e; cd = Math.max(0, +((e.config || {}).cooldown ?? 30)); const m = MODES[(e.config || {}).mode] || MODES.team_war;
      $('#pb-name').textContent = e.title || 'Pixel Battle'; $('#pb-mode').textContent = m[0]; $('#pb-mode').title = m[1]; $('#z-view').hidden = (e.config || {}).mode === 'solo';
    }
    function mine() { if (solo()) return `<div class="mine"><b>Вы играете сами за себя</b><span>Ваших пикселей на поле: ${owned}</span><span>Поставлено всего: ${placed}</span></div>`; return team === null ? '' : `<div class="mine" style="border-color:${TEAMS[team].c}"><b style="color:${TEAMS[team].c}">Вы в команде «${TEAMS[team].name}»</b><span>Поставлено пикселей: ${placed}</span></div>`; }
    async function board() {
      const box = $('#pb-board'); if (!box) return;
      const r = await sb.rpc('pb_leaderboard', { p_ev: evId }); if (r.error || !$('#pb-board')) return;
      box.innerHTML = (r.data || []).slice(0, 20).map((u, i) => `<div class="lr${u.user_id === F.sessionId() ? ' me' : ''}"><i>${i + 1}</i><span>${esc((u.first_name + ' ' + u.last_name).trim() || 'Игрок')}</span><b>${u.placed}</b></div>`).join('') || '<div class="muted">Пока никто не ставил пиксели</div>';
    }
    function panel(tab) {
      const el = $('#pb-panel'); panelTab = tab; if (!tab) { el.hidden = true; return; }
      const info = MODES[(ev.config || {}).mode] || MODES.team_war; const hdr = tab === 'rating' ? 'Рейтинг раунда' : solo() ? 'Игра' : 'Команды';
      el.hidden = false; el.innerHTML = `<div class="ph"><b>${hdr}</b><button class="pb-ib" data-x="close" aria-label="Закрыть">✕</button></div>
<div class="tabs2"><button class="${tab === 'teams' ? 'on' : ''}" data-tab="teams">${solo() ? 'Игра' : 'Команды'}</button><button class="${tab === 'rating' ? 'on' : ''}" data-tab="rating">Рейтинг</button></div>
${tab === 'teams' ? `${mine()}<div class="mode"><b>${info[0]}</b><p>${info[1]}</p></div>${solo() ? '' : `<div class="tcards">${[0, 1].map(i => `<div class="tc" style="border-color:${TEAMS[i].c}"><b style="color:${TEAMS[i].c}">${TEAMS[i].name}</b><span>Игроков: ${players[i]}</span><span>${scores ? 'Счёт: ' + scores.s[i] : ''}</span><span>${scores ? 'Пикселей: ' + scores.pixels[i] : ''}</span></div>`).join('')}</div>`}
<p class="muted small">Занято ${scores ? ((scores.pixels[0] + scores.pixels[1]) / (N * N) * 100).toFixed(2) : 0}% поля. Кулдаун: ${cd} с.</p>` : '<div id="pb-board" class="board">Загрузка…</div>'}`;
      if (tab === 'rating') board();
    }
    function over() {
      const o = $('#pb-over'); if (!result && !finished) { o.hidden = true; return; }
      const r = result || {}, w = r.winner, s = r.s || (scores && scores.s) || [0, 0];
      if (solo()) { const top = (scores && scores.top) || [], won = r.winner_user === F.sessionId();
        o.hidden = false; o.innerHTML = `<div class="box"><div class="tag">Раунд закончен</div><h2>${r.winner_name ? 'Победил ' + esc(r.winner_name) : 'Ничья!'}</h2>${r.winner_owned ? `<div class="res"><span>${r.winner_owned} пикселей на поле</span></div>` : ''}
<p>${won ? 'Это вы!' : `У вас на поле пикселей: ${owned}.`}</p>${top.length ? `<div class="tops2">${top.map((u, i) => `<div>${i + 1}. ${esc(u.name || 'Игрок')} — <b>${u.owned}</b></div>`).join('')}</div>` : ''}<div id="pb-next" class="muted small"></div>
<div class="btns"><a class="btn" href="events.html">К ивентам</a><button class="btn btn-ghost" data-x="stay">Посмотреть поле</button></div></div>`; nextRound(); return; }
      o.hidden = false; o.innerHTML = `<div class="box"><div class="tag">Раунд закончен</div><h2 style="color:${w == null ? 'inherit' : TEAMS[w].c}">${w == null ? 'Ничья!' : 'Победа — «' + TEAMS[w].name + '»'}</h2>
<div class="res"><span style="color:${TEAMS[0].c}">${TEAMS[0].name}: <b>${s[0]}</b></span><span style="color:${TEAMS[1].c}">${TEAMS[1].name}: <b>${s[1]}</b></span></div>
${team !== null ? `<p>${w === team ? 'Ваша команда победила' : w == null ? 'Силы равны.' : 'В этот раз не повезло.'} Вы поставили ${placed} пикс.</p>` : ''}<div id="pb-next" class="muted small"></div>
<div class="btns"><a class="btn" href="events.html">К ивентам</a><button class="btn btn-ghost" data-x="stay">Посмотреть поле</button></div></div>`;
      nextRound();
    }
    async function nextRound() {
      try { const l = (await E.load()).filter(e => e.kind === 'pixelbattle' && e.id !== evId && Date.parse(e.ends_at) > E.now()), n = l[0], box = $('#pb-next'); if (!n || !box) return;
        const left = Date.parse(n.starts_at) - E.now(); box.innerHTML = left > 0 ? `Следующий раунд через ${E.clock(left)}` : 'Следующий раунд уже идёт'; box.innerHTML += ` · <a href="battle.html?e=${n.id}">Играть</a>`; } catch (e) { /* без следующего */ }
    }

    // ---------- сеть ----------
    function take(d) {
      if (d.scores) scores = d.scores; if (d.players) players = d.players; if (typeof d.placed === 'number') placed = d.placed; if (typeof d.owned === 'number') owned = d.owned;
      if (d.pixels) applyPacked(d.pixels); if (typeof d.seq === 'number') seq = Math.max(seq, d.seq);
      if (d.event) setEvent(d.event);
      if (d.ends_at && ev && d.ends_at !== ev.ends_at) ev.ends_at = d.ends_at;
      if (d.finalized && !finished) { finished = true; result = d.result || null; over(); }
      renderScore(); if (panelTab === 'teams') panel('teams');
    }
    let polling = false;
    async function poll() {
      if (polling || document.hidden) return; polling = true;
      try { const r = await sb.rpc('pb_poll', { p_ev: evId, p_since: seq }); if (!r.error && r.data) { if (r.data.now) E.offset = Date.parse(r.data.now) - Date.now(); take(r.data); } } catch (e) { /* следующая попытка через 2 с */ }
      polling = false;
    }
    async function place() {
      if (!sel || busy || team === null || E.now() < nextAt) return; busy = true;
      const i = sel.y * N + sel.x, was = [col[i], tm[i]], wasMine = false, pt = { x: sel.x, y: sel.y, c: color }; setPixel(i, color, team); // сразу рисуем у себя
      nextAt = E.now() + cd * 1000; tick();
      try {
        const r = await sb.rpc('pb_place', { p_ev: evId, p_x: pt.x, p_y: pt.y, p_color: pt.c });
        if (r.error) throw new Error(r.error.message);
        if (!r.data.ok) { revert(i, was); nextAt = E.now() + (r.data.wait_ms || 1000); } else { placed++; nextAt = E.now() + (r.data.wait_ms ?? cd * 1000); }
      } catch (e) { revert(i, was); nextAt = 0; F.toast(String(e.message || e).replace(/^.*?:\s*/, '') || 'Не удалось поставить пиксель'); }
      busy = false; tick();
    }
    function revert(i, was) { if (was[0] === 255) { const cell = Math.floor(i / N / CELL) * GRID + Math.floor((i % N) / CELL); (tm[i] === 0 ? c0 : c1)[cell]--; col[i] = 255; buf[i] = 0; flush(); } else setPixel(i, was[0], was[1]); }

    // ---------- события ----------
    const ptrs = new Map(); let moved = 0, pinch = 0, downAt = null;
    stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); if (ptrs.size === 1) { moved = 0; downAt = { x: e.offsetX, y: e.offsetY }; } pinch = 0; });
    stage.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId), x = e.offsetX, y = e.offsetY;
      if (!p) { const cx = Math.floor((x - tx) / sc), cy = Math.floor((y - ty) / sc); $('#pb-coord').textContent = cx >= 0 && cy >= 0 && cx < N && cy < N ? cx + ', ' + cy : ''; return; }
      if (ptrs.size === 1) { tx += x - p.x; ty += y - p.y; moved += Math.abs(x - p.x) + Math.abs(y - p.y); clamp(); dirty = true; }
      else if (ptrs.size === 2) { const o = [...ptrs.entries()].find(([k]) => k !== e.pointerId)[1], d = Math.hypot(x - o.x, y - o.y); if (pinch) zoomAt(d / pinch, (x + o.x) / 2, (y + o.y) / 2); pinch = d; moved += 10; }
      p.x = x; p.y = y;
    });
    const up = e => {
      if (ptrs.has(e.pointerId) && ptrs.size === 1 && moved < 6 && downAt && e.type === 'pointerup') {
        const cx = Math.floor((e.offsetX - tx) / sc), cy = Math.floor((e.offsetY - ty) / sc);
        if (cx >= 0 && cy >= 0 && cx < N && cy < N) { sel = { x: cx, y: cy }; if (sc < 4) { /* на мелком масштабе подсказка: приблизьте */ } dirty = true; tick(); }
      }
      ptrs.delete(e.pointerId); pinch = 0;
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });
    root.addEventListener('click', e => {
      const b = e.target.closest('button,a'); if (!b) return;
      if (b.id === 'z-in') zoomAt(1.5, W / 2, H / 2); else if (b.id === 'z-out') zoomAt(1 / 1.5, W / 2, H / 2); else if (b.id === 'z-fit') fit();
      else if (b.id === 'z-view') { teamView = !teamView; b.classList.toggle('on', teamView); repaintAll(); }
      else if (b.id === 'pb-theme') { theme = theme === 'dark' ? 'light' : 'dark'; document.body.dataset.pbtheme = theme; try { localStorage.setItem('pb-theme', theme); } catch (x) { /* ок */ } dirty = true; }
      else if (b.id === 'pb-info') panel(panelTab ? null : 'teams');
      else if (b.dataset.tab) panel(b.dataset.tab);
      else if (b.dataset.x === 'close') panel(null);
      else if (b.dataset.x === 'stay') $('#pb-over').hidden = true;
      else if (b.dataset.c !== undefined) { color = +b.dataset.c; root.querySelectorAll('#pb-pal .sw').forEach(s => s.classList.toggle('on', +s.dataset.c === color)); dirty = true; }
      else if (b.id === 'pb-place') place();
    });
    document.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); place(); } else if (e.key === 'Escape') panel(null); });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

    // ---------- запуск ----------
    resize(); fit();
    let st;
    try { const r = await sb.rpc('pb_state', { p_ev: evId }); if (r.error) throw new Error(r.error.message); st = r.data; }
    catch (e) { F.fatal('Не удалось открыть ивент: ' + (e.message || e) + '. Выполните в Supabase файл migration_004_pixelbattle.sql.', true); return; }
    E.offset = Date.parse(st.now) - Date.now(); setEvent(st.event); team = st.team; placed = st.placed; owned = st.owned || 0;
    if (st.last_at) nextAt = Date.parse(st.last_at) + cd * 1000;
    applyPacked(st.pixels); seq = st.seq; scores = st.scores; players = st.players; renderScore();
    finished = !!st.event.finalized; result = st.event.result || null; if (finished) over();
    const t0 = E.now();
    if (team === null && !finished && t0 < Date.parse(st.event.ends_at)) {
      try { const j = await sb.rpc('pb_join', { p_ev: evId }); if (j.error) throw new Error(j.error.message); team = j.data.team; if (!solo()) F.toast('Вы в команде «' + TEAMS[team].name + '»'); } catch (e) { F.toast(String(e.message || e)); }
    }
    renderScore(); tick(); setInterval(tick, 500); setInterval(poll, 2000);
  });
})(window.Karakuli);
