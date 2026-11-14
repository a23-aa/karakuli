/* Каракули — портал ивентов: идёт ивент / «Ждите ивента» / таймер до начала. Содержимое самих ивентов — позже. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'events') return;

  F.page('events', { right: false }, c => {
    const E = F.events, me = F.me();
    let list = [], tick = null, failed = false, timer = null;
    c.innerHTML = `<div class="toolbar"><h1 class="page-title">Портал ивентов</h1>${me.isAdmin ? '<a class="btn btn-ghost btn-sm" href="admin.html?tab=events">Управлять ивентами</a>' : ''}</div><div id="ev"></div>`;
    const box = F.$('#ev', c);
    const when = ms => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const portal = `<svg class="portal-art" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><ellipse cx="60" cy="60" rx="34" ry="52" fill="none" stroke="currentColor" stroke-width="5" opacity=".95"/><ellipse class="pr2" cx="60" cy="60" rx="21" ry="36" fill="none" stroke="currentColor" stroke-width="4" opacity=".75"/><ellipse class="pr3" cx="60" cy="60" rx="9" ry="19" fill="currentColor" opacity=".55"/><path d="M14 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM103 84l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="currentColor"/></svg>`;

    function draw() {
      const { active, next } = E.state(list), t = E.now();
      if (active) {
        box.innerHTML = `<section class="card portal-card live">${portal}<div class="portal-body"><span class="live-tag">Идёт сейчас</span><h2>${F.esc(active.title)}</h2>${active.description ? `<p>${F.esc(active.description).replace(/\n/g, '<br>')}</p>` : ''}
<div class="cd-label">Закончится через</div><div class="cd" data-end="${Date.parse(active.ends_at)}">${E.clock(Date.parse(active.ends_at) - t)}</div></div></section>
<section class="card card-pad event-stage"><div class="empty">${F.ic('portal', 44)}<div><b>Ивент запущен</b></div><p class="muted small">Здесь появится сам ивент. Следите за этой страницей.</p></div></section>`;
      } else if (next) {
        box.innerHTML = `<section class="card portal-card">${portal}<div class="portal-body"><span class="live-tag soon">Скоро</span><h2>${F.esc(next.title)}</h2>${next.description ? `<p>${F.esc(next.description).replace(/\n/g, '<br>')}</p>` : ''}
<div class="cd-label">До начала</div><div class="cd" data-start="${Date.parse(next.starts_at)}">${E.clock(Date.parse(next.starts_at) - t)}</div><div class="muted-on small">Начало: ${when(Date.parse(next.starts_at))}</div></div></section>`;
      } else {
        box.innerHTML = `<section class="card portal-card idle">${portal}<div class="portal-body"><h2>Ждите ивента</h2><p>Сейчас ивентов нет. Когда появится новый, он откроется здесь.</p>${failed && me.isAdmin ? '<p class="small">Администратору: выполните в Supabase файл migration_003_social.sql, чтобы подключить ивенты.</p>' : ''}</div></section>`;
      }
    }
    function tickAll() {
      const t = E.now(); let flip = false;
      F.$$('[data-end]', box).forEach(el => { const ms = +el.dataset.end - t; el.textContent = E.clock(ms); if (ms <= 0) flip = true; });
      F.$$('[data-start]', box).forEach(el => { const ms = +el.dataset.start - t; el.textContent = E.clock(ms); if (ms <= 0) flip = true; });
      if (flip) { draw(); load(); }
    }
    async function load() {
      try { list = await E.load(); failed = false; } catch (e) { list = []; failed = true; }
      draw();
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
