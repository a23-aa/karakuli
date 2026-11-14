/* Каракули — админ-панель: статистика, пользователи и галочки, записи, комментарии, сообщества. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'admin') return;
  F.page('admin', { right: false }, c => {
    const me = F.me();
    if (!me.isAdmin) { c.innerHTML = `<div class="card empty">${F.ic('shield', 40)}<div><b>Нет доступа</b></div><p class="muted small">Эта страница только для администратора сайта.</p><p><a class="btn" href="index.html">На главную</a></p></div>`; return; }
    const sb = F.sb, esc = F.esc;
    const TABS = [['stats', 'Статистика'], ['users', 'Пользователи'], ['posts', 'Записи'], ['comments', 'Комментарии'], ['communities', 'Сообщества']];
    let tab = new URLSearchParams(location.search).get('tab') || 'stats', timer = null, q = '';
    c.innerHTML = `<h1 class="page-title">Админ-панель</h1><div class="adm-tabs" id="at"></div><div id="ab"></div>`;
    const tabs = F.$('#at', c), box = F.$('#ab', c);

    /** Выполнить запрос к базе: показать ошибку или подтверждение, затем перезагрузить данные. */
    async function act(p, ok) {
      await F.flush();
      let r; try { r = await p; } catch (e) { r = { error: e }; }
      if (r && r.error) { F.toast('Ошибка: ' + F.niceError(r.error.message || String(r.error))); return false; }
      if (ok) F.toast(ok);
      try { await F.refresh(); } catch (e) { /* покажем старые данные */ }
      draw(); return true;
    }
    const short = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; };
    const who = u => u ? `<a href="profile.html?id=${u.id}" style="color:inherit;font-weight:800">${F.nameHTML(u, 14)}</a>${u.username ? ` <span class="muted small">@${esc(u.username)}</span>` : ''}` : '<i class="muted">удалён</i>';
    const search = ph => `<div class="search" style="max-width:none;position:relative;margin-bottom:12px"><span style="position:absolute;z-index:2;pointer-events:none;left:12px;top:9px;color:var(--muted)">${F.ic('search', 18)}</span><input class="input" id="aq" style="padding-left:40px" placeholder="${ph}" value="${esc(q)}" autocomplete="off"></div>`;
    const bindSearch = fn => { const i = F.$('#aq', box); i.addEventListener('input', () => { q = i.value.trim().toLowerCase(); fn(); const n = F.$('#aq', box); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); };

    /* ---------- статистика ---------- */
    async function stats() {
      if (!box.querySelector('.adm-stats')) box.innerHTML = '<div class="card card-pad muted">Считаем…</div>';
      const r = await sb.rpc('admin_stats');
      if (tab !== 'stats') return;
      if (r.error) { box.innerHTML = `<div class="card card-pad"><b>Не удалось получить статистику.</b><p class="muted small">${esc(F.niceError(r.error.message))}</p><p class="small">Выполните в Supabase SQL Editor файл <code>supabase/migration_002_admin.sql</code> и сделайте себя администратором (инструкция в конце файла).</p></div>`; return; }
      const s = r.data, S = (k, l, live) => `<div class="card adm-stat${live ? ' live' : ''}"><b>${s[k] == null ? 0 : s[k]}</b><span>${l}</span></div>`;
      const max = Math.max(1, ...s.signups.map(x => x.n));
      box.innerHTML = `<div class="adm-stats">${S('online', 'Сейчас на сайте', 1)}${S('online_hour', 'Был за час')}${S('online_day', 'Был за сутки')}${S('users', 'Всего пользователей')}${S('new_today', 'Новых за сутки')}${S('new_week', 'Новых за неделю')}${S('posts', 'Записей')}${S('comments', 'Комментариев')}${S('messages', 'Сообщений')}${S('photos', 'Фотографий')}${S('likes', 'Лайков')}${S('communities', 'Сообществ')}${S('friendships', 'Дружеских связей')}${S('verified', 'С синей галочкой')}${S('blogger', 'С серой галочкой')}${S('banned', 'Заблокировано')}</div>
<section class="card card-pad"><h2 class="sec-title">Регистрации за 14 дней</h2><div class="adm-bars">${s.signups.map(x => `<i style="height:${Math.max(3, Math.round(x.n / max * 100))}%" title="${x.d}: ${x.n}"><em>${x.n || ''}</em></i>`).join('')}</div>
<div class="muted small" style="display:flex;justify-content:space-between;margin-top:4px"><span>${s.signups[0].d.slice(5)}</span><span>${s.signups[s.signups.length - 1].d.slice(5)}</span></div></section>
<p class="muted small">Онлайн — те, кто был активен последние 2,5 минуты. Содержимое личных сообщений администратору не показывается, только их количество. Цифры обновляются сами.</p>`;
    }

    /* ---------- пользователи ---------- */
    function users() {
      const all = F.allUsers().slice().sort((a, b) => b.created - a.created);
      box.innerHTML = search('Поиск по имени или @юзернейму') + `<section class="card card-pad" id="ul"></section>`;
      const render = () => {
        const list = all.filter(u => !q || F.fullName(u).toLowerCase().includes(q) || (u.username || '').includes(q.replace(/^@/, '')));
        F.$('#ul', box).innerHTML = `<div class="muted small" style="margin-bottom:6px">Найдено: ${list.length} из ${all.length}</div>` + (list.slice(0, 100).map(u => {
          const prot = u.isAdmin || u.id === me.id;
          const tags = (u.isAdmin ? '<span class="tag gold">админ</span>' : '') + (u.banned ? '<span class="tag red">бан</span>' : '') + (!u.username ? '<span class="tag">без юзернейма</span>' : '');
          const sel = u.badge === 'owner' ? '<span class="muted small">Галочка владельца</span>' : `<select class="input" data-bd="${u.id}" style="padding:4px 8px;width:auto"><option value="">Без галочки</option><option value="verified"${u.badge === 'verified' ? ' selected' : ''}>Синяя — подтверждён</option><option value="blogger"${u.badge === 'blogger' ? ' selected' : ''}>Серая — блогер</option></select>`;
          return `<div class="adm-row" data-u="${u.id}"><a href="profile.html?id=${u.id}"><img class="ava ava-m" src="${F.avatar(u)}" alt=""></a>
<div class="grow"><div>${who(u)}${tags}${F.isOnline(u) ? ' <span class="on-text">online</span>' : ''}</div><div class="muted small">зарегистрирован ${F.fmtDate(u.created)}</div>
<div class="adm-actions" style="margin-top:6px">${sel}${prot ? '' : `<button class="btn btn-ghost btn-sm" data-a="ban">${u.banned ? 'Разблокировать' : 'Заблокировать'}</button>${u.username ? '<button class="btn btn-ghost btn-sm" data-a="clr">Сбросить юзернейм</button>' : ''}<button class="btn btn-danger btn-sm" data-a="del">Удалить</button>`}</div></div></div>`;
        }).join('') || '<div class="muted">Никого не нашли</div>') + (list.length > 100 ? '<div class="muted small">Показаны первые 100. Уточните поиск.</div>' : '');
      };
      render(); bindSearch(render);
      box.onchange = e => { const s = e.target.closest("[data-bd]"); if (!s) return; act(sb.rpc('admin_set_badge', { uid: s.dataset.bd, b: s.value || null }), 'Галочка обновлена'); };
      box.onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('[data-u]').dataset.u, u = F.user(id); if (!u) return;
        if (b.dataset.a === 'ban') {
          if (u.banned) { act(sb.rpc('admin_set_ban', { uid: id, flag: false, reason: '' }), 'Пользователь разблокирован'); return; }
          F.modal({ title: 'Заблокировать ' + F.fullName(u), body: '<p class="muted small" style="margin-top:0">Заблокированный видит сайт, но не может публиковать записи, комментарии и сообщения.</p><div class="form-row"><label>Причина (увидит пользователь)</label><input class="input" id="bn-r" maxlength="140"></div>',
            actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Заблокировать', cls: 'btn-danger', onClick: m => { const r = F.$('#bn-r', m.body).value.trim(); m.close(); act(sb.rpc('admin_set_ban', { uid: id, flag: true, reason: r }), 'Пользователь заблокирован'); } }] });
        } else if (b.dataset.a === 'clr') F.confirm('Сбросить юзернейм @' + u.username + '? Пользователю придётся выбрать новый.', 'Сбросить').then(ok => ok && act(sb.rpc('admin_clear_username', { uid: id }), 'Юзернейм сброшен'));
        else if (b.dataset.a === 'del') F.confirm('Удалить пользователя ' + F.fullName(u) + ' вместе со всеми его записями, фото и перепиской? Это нельзя отменить.', 'Удалить навсегда').then(ok => ok && act(sb.rpc('admin_delete_user', { uid: id }), 'Пользователь удалён'));
      };
    }

    /* ---------- записи ---------- */
    function posts() {
      box.innerHTML = search('Поиск по тексту записи или автору') + `<section class="card card-pad" id="pl"></section>`;
      const render = () => {
        const list = F.db().posts.filter(p => !q || (p.text || '').toLowerCase().includes(q) || F.fullName(F.user(p.authorId)).toLowerCase().includes(q) || ((F.user(p.authorId) || {}).username || '').includes(q.replace(/^@/, ''))).slice(0, 60);
        F.$('#pl', box).innerHTML = list.map(p => {
          const cm = p.communityId ? F.community(p.communityId) : null;
          return `<div class="adm-row" data-p="${p.id}"><div class="grow"><div>${who(F.user(p.authorId))}${cm ? ` <span class="muted small">в «${esc(cm.name)}»</span>` : ''} <span class="muted small">· ${F.timeAgo(p.ts)}</span></div>
<div style="white-space:pre-wrap;word-break:break-word">${esc(short(p.text, 400)) || '<i class="muted">без текста</i>'}</div><div class="muted small">${p.photos.length ? 'фото: ' + p.photos.length + ' · ' : ''}лайков ${p.likes.length} · комментариев ${p.comments.length}</div>
<div class="adm-actions" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-a="edit">Редактировать</button><button class="btn btn-danger btn-sm" data-a="del">Удалить</button></div></div></div>`;
        }).join('') || '<div class="muted">Записей нет</div>';
      };
      render(); bindSearch(render);
      box.onchange = null;
      box.onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('[data-p]').dataset.p, p = F.db().posts.find(x => x.id === id); if (!p) return;
        if (b.dataset.a === 'edit') F.modal({ title: 'Редактировать запись', wide: true, body: `<textarea class="input" id="pe-t" rows="7" maxlength="3000">${esc(p.text)}</textarea>`,
          actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => { const t = F.$('#pe-t', m.body).value.trim(); if (!t && !p.photos.length && !p.repostOf) { F.toast('Запись не может быть пустой'); return; } m.close(); act(sb.from('posts').update({ body: t }).eq('id', id), 'Запись изменена'); } }] });
        else F.confirm('Удалить эту запись?', 'Удалить').then(ok => ok && act(sb.from('posts').delete().eq('id', id), 'Запись удалена'));
      };
    }

    /* ---------- комментарии ---------- */
    function comments() {
      const d = F.db(), rows = [];
      d.posts.forEach(p => p.comments.forEach(cm => rows.push({ cm, kind: 'записи', link: 'index.html#post-' + p.id })));
      d.photos.forEach(p => p.comments.forEach(cm => rows.push({ cm, kind: 'фото', link: 'photos.html' })));
      rows.sort((a, b) => b.cm.ts - a.cm.ts);
      box.innerHTML = search('Поиск по тексту или автору') + `<section class="card card-pad" id="cl"></section>`;
      const render = () => {
        const list = rows.filter(r => !q || r.cm.text.toLowerCase().includes(q) || F.fullName(F.user(r.cm.authorId)).toLowerCase().includes(q)).slice(0, 80);
        F.$('#cl', box).innerHTML = list.map(r => `<div class="adm-row" data-c="${r.cm.id}"><div class="grow"><div>${who(F.user(r.cm.authorId))} <span class="muted small">к ${r.kind} · ${F.timeAgo(r.cm.ts)}</span></div><div style="word-break:break-word">${esc(short(r.cm.text, 400))}</div></div><button class="btn btn-danger btn-sm" data-a="del">Удалить</button></div>`).join('') || '<div class="muted">Комментариев нет</div>';
      };
      render(); bindSearch(render); box.onchange = null;
      box.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('[data-c]').dataset.c; F.confirm('Удалить комментарий?', 'Удалить').then(ok => ok && act(sb.from('comments').delete().eq('id', id), 'Комментарий удалён')); };
    }

    /* ---------- сообщества ---------- */
    function communities() {
      box.innerHTML = search('Поиск по названию') + `<section class="card card-pad" id="gl"></section>`;
      const render = () => {
        const list = F.db().communities.filter(x => !q || x.name.toLowerCase().includes(q));
        F.$('#gl', box).innerHTML = list.map(x => `<div class="adm-row" data-g="${x.id}"><a href="community.html?id=${x.id}"><img class="ava ava-m" style="border-radius:12px" src="${F.cAvatar(x)}" alt=""></a><div class="grow"><div><b>${esc(x.name)}</b></div><div class="muted small">создатель: ${who(F.user(x.creatorId))} · участников ${x.members.length}</div><div class="adm-actions" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-a="edit">Редактировать</button><button class="btn btn-danger btn-sm" data-a="del">Удалить</button></div></div></div>`).join('') || '<div class="muted">Сообществ нет</div>';
      };
      render(); bindSearch(render); box.onchange = null;
      box.onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('[data-g]').dataset.g, x = F.community(id); if (!x) return;
        if (b.dataset.a === 'edit') F.modal({ title: 'Редактировать сообщество', body: `<div class="form-row"><label>Название</label><input class="input" id="ge-n" maxlength="60" value="${esc(x.name)}"></div><div class="form-row"><label>Описание</label><textarea class="input" id="ge-d" rows="4" maxlength="500">${esc(x.desc)}</textarea></div>`,
          actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => { const n = F.$('#ge-n', m.body).value.trim(); if (!n) { F.toast('Введите название'); return; } const ds = F.$('#ge-d', m.body).value.trim(); m.close(); act(sb.from('communities').update({ name: n, description: ds }).eq('id', id), 'Сообщество изменено'); } }] });
        else F.confirm('Удалить сообщество «' + x.name + '» вместе с его записями?', 'Удалить').then(ok => ok && act(sb.from('communities').delete().eq('id', id), 'Сообщество удалено'));
      };
    }

    function draw() {
      clearInterval(timer);
      tabs.innerHTML = TABS.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('');
      ({ stats, users, posts, comments, communities }[tab] || stats)();
      if (tab === 'stats') timer = setInterval(() => { if (!document.hidden) stats(); }, 15000);
    }
    tabs.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; tab = t.dataset.t; q = ''; draw(); });
    draw();
  });
})(window.Karakuli);
