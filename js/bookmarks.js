/* Каракули — закладки: записи, фотографии, ссылки. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'bookmarks') return;
  F.page('bookmarks', { right: false }, c => {
    const me = F.me(), q = new URLSearchParams(location.search);
    let tab = q.get('tab') || 'posts', text = '';
    c.innerHTML = `<div class="toolbar"><h1 class="page-title">Закладки</h1></div>
<div class="search" style="max-width:none;position:relative"><span style="position:absolute;z-index:2;pointer-events:none;left:12px;top:9px;color:var(--muted)">${F.ic('search', 18)}</span><input id="bq" class="input" style="padding-left:38px;border-radius:999px" placeholder="Поиск в закладках…" autocomplete="off"></div>
<div id="btabs"></div><div id="bbody" style="display:flex;flex-direction:column;gap:14px"></div>`;
    const body = F.$('#bbody', c);
    const savedPosts = () => me.bookmarks.posts.map(id => F.db().posts.find(p => p.id === id)).filter(Boolean).filter(p => !text || p.text.toLowerCase().includes(text)).reverse();
    const savedPhotos = () => me.bookmarks.photos.map(id => F.db().photos.find(p => p.id === id)).filter(Boolean).reverse();

    function tabs() {
      const T = [['posts', 'Записи', me.bookmarks.posts.length], ['photos', 'Фотографии', me.bookmarks.photos.length], ['links', 'Ссылки', me.bookmarks.links.length]];
      F.$('#btabs', c).innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]} ${t[2] ? `<span class="cnt">${t[2]}</span>` : ''}</button>`).join('')}</div>`;
    }
    function render() {
      tabs();
      if (tab === 'posts') {
        body.innerHTML = '<div id="pl" style="display:flex;flex-direction:column;gap:14px"></div>';
        F.posts.mount(F.$('#pl', body), savedPosts, { empty: 'Сохранённых записей нет. Нажмите на закладку под любой записью.', onRepost: render });
      } else if (tab === 'photos') {
        const ph = savedPhotos();
        body.innerHTML = `<div class="card card-pad">${ph.length ? `<div class="pgal">${ph.map(p => `<div class="th" data-ph="${p.id}"><img src="${p.src}" alt="" loading="lazy"></div>`).join('')}</div>` : `<div class="empty">${F.ic('photo', 40)}<div>Сохранённых фотографий нет. Откройте фото и нажмите «В закладки».</div></div>`}</div>`;
      } else {
        const ls = me.bookmarks.links.filter(l => !text || (l.title + l.url).toLowerCase().includes(text));
        body.innerHTML = `<div class="card card-pad"><div class="toolbar" style="margin-bottom:8px"><span class="muted small">Сохраняйте полезные ссылки</span><button class="btn btn-sm" data-a="addlink">${F.ic('plus', 16)} Добавить ссылку</button></div>
${ls.length ? ls.map(l => `<div class="rowitem"><span style="color:var(--accent)">${F.ic('link')}</span><span class="grow"><b><a href="${F.esc(l.url)}" target="_blank" rel="noopener noreferrer">${F.esc(l.title)}</a></b><span class="muted small">${F.esc(l.url)}</span></span><button class="icon-btn" data-dl="${l.id}" aria-label="Удалить">${F.ic('trash', 18)}</button></div>`).join('') : `<div class="empty">${F.ic('link', 40)}<div>Ссылок пока нет</div></div>`}</div>`;
      }
    }
    function addLink() {
      F.modal({ title: 'Новая ссылка', body: '<div class="form-row"><label>Адрес</label><input class="input" id="l-u" placeholder="https://…"></div><div class="form-row"><label>Название</label><input class="input" id="l-t" maxlength="80" placeholder="Необязательно"></div><div class="form-msg err" id="l-m"></div>',
        onOpen: m => F.$('#l-u', m.body).focus(),
        actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => {
          let url = F.$('#l-u', m.body).value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
          let ok = false; try { const u = new URL(url); ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.'); } catch (e) { }
          if (!ok) { F.$('#l-m', m.body).textContent = 'Введите корректный адрес сайта'; return; }
          me.bookmarks.links.push({ id: F.uid('l'), url, title: F.$('#l-t', m.body).value.trim() || url, ts: Date.now() }); F.save(); m.close(); render();
        } }] });
    }
    c.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); return; }
      const th = e.target.closest('[data-ph]'); if (th) { F.photoViewer(th.dataset.ph, savedPhotos().map(p => p.id), render); return; }
      const dl = e.target.closest('[data-dl]'); if (dl) { me.bookmarks.links = me.bookmarks.links.filter(l => l.id !== dl.dataset.dl); F.save(); render(); return; }
      if (e.target.closest('[data-a="addlink"]')) addLink();
    });
    F.$('#bq', c).addEventListener('input', e => { text = e.target.value.trim().toLowerCase(); render(); });
    render();
  });
})(window.Karakuli);
