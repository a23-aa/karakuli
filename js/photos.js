/* Каракули — фотографии: просмотрщик (лайки, комментарии, закладки, удаление) и страница галереи. */
(function (F) {
  'use strict';

  /** Просмотр фотографии. list — массив id для листания; onChange — вызывается после изменений. */
  F.photoViewer = function (id, list, onChange) {
    list = (list && list.length) ? list.slice() : [id];
    let idx = Math.max(0, list.indexOf(id));
    const ov = document.createElement('div'); ov.className = 'lb pv';
    document.body.appendChild(ov); document.body.classList.add('no-scroll');
    const changed = () => { if (onChange) onChange(); };
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); if (!F.$('.modal-ov')) document.body.classList.remove('no-scroll'); changed(); };
    const step = d => { idx = (idx + d + list.length) % list.length; draw(); };
    const key = e => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft' && list.length > 1) step(-1); else if (e.key === 'ArrowRight' && list.length > 1) step(1);
    };
    const cur = () => F.db().photos.find(p => p.id === list[idx]);

    function draw() {
      const ph = cur(); if (!ph) { close(); return; }
      const me = F.me(), owner = F.user(ph.ownerId), liked = ph.likes.includes(me.id), saved = me.bookmarks.photos.includes(ph.id);
      ov.innerHTML = `<button class="icon-btn lb-close" data-v="close" aria-label="Закрыть">${F.ic('close', 24)}</button>
<div class="pv-box"><div class="pv-img">${list.length > 1 ? '<button class="lb-nav prev" data-v="prev">‹</button><button class="lb-nav next" data-v="next">›</button>' : ''}<img src="${ph.src}" alt="Фотография"></div>
<aside class="pv-side card"><a class="rowitem" href="profile.html?id=${ph.ownerId}"><img class="ava ava-m" src="${F.avatar(owner)}" alt=""><span class="grow"><b>${F.esc(F.fullName(owner))}</b><span class="muted small">${F.timeAgo(ph.ts)}</span></span></a>
<div class="post-actions"><button class="act${liked ? ' liked' : ''}" data-v="like">${F.ic('heart', 18)}<span>${ph.likes.length}</span></button>
<button class="act${saved ? ' saved' : ''}" data-v="save">${F.ic('bookmark', 18)}<span>${saved ? 'В закладках' : 'В закладки'}</span></button>
${ph.ownerId === me.id ? `<button class="act sp" data-v="del">${F.ic('trash', 18)}<span>Удалить</span></button>` : ''}</div>
<div class="pv-comments">${ph.comments.length ? ph.comments.map(c => { const u = F.user(c.authorId); return `<div class="comment"><a href="profile.html?id=${c.authorId}"><img class="ava ava-s" src="${F.avatar(u)}" alt=""></a><div class="c-body"><b>${F.nameHTML(u, 13)}</b> ${F.esc(c.text)}<div class="muted small">${F.timeAgo(c.ts)}</div></div></div>`; }).join('') : '<div class="muted small">Комментариев пока нет</div>'}</div>
<form class="comment-form" data-v="form"><input class="input" name="t" placeholder="Комментарий…" autocomplete="off" maxlength="300"><button class="icon-btn" type="submit" aria-label="Отправить">${F.ic('send')}</button></form></aside></div>`;
      const box = F.$('.pv-comments', ov); box.scrollTop = box.scrollHeight;
    }

    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'), ph = cur(); if (!b) { if (e.target === ov) close(); return; }
      const me = F.me(), v = b.dataset.v;
      if (v === 'close') close(); else if (v === 'prev') step(-1); else if (v === 'next') step(1);
      else if (v === 'like' && ph) { const i = ph.likes.indexOf(me.id); if (i >= 0) ph.likes.splice(i, 1); else { ph.likes.push(me.id); F.notify(ph.ownerId, 'like', me.id, { link: 'photos.html' }); } F.save(); draw(); }
      else if (v === 'save' && ph) { const a = me.bookmarks.photos, i = a.indexOf(ph.id); if (i >= 0) a.splice(i, 1); else a.push(ph.id); F.save(); draw(); }
      else if (v === 'del' && ph) {
        F.confirm('Удалить эту фотографию?', 'Удалить').then(ok => {
          if (!ok) return; const d = F.db();
          d.photos = d.photos.filter(p => p.id !== ph.id); F.allUsers().forEach(u => { u.bookmarks.photos = u.bookmarks.photos.filter(x => x !== ph.id); });
          F.save(); list.splice(idx, 1); changed();
          if (!list.length) { close(); return; } idx = idx % list.length; draw(); F.toast('Фотография удалена');
        });
      }
    });
    ov.addEventListener('submit', e => {
      const f = e.target.closest('form[data-v="form"]'); if (!f) return; e.preventDefault();
      const ph = cur(), t = f.t.value.trim(); if (!ph || !t) return; const me = F.me();
      ph.comments.push({ id: F.uid('pc'), authorId: me.id, text: t, ts: Date.now() }); F.notify(ph.ownerId, 'comment', me.id, { link: 'photos.html' }); F.save(); draw();
      const inp = F.$('.pv-side input', ov); if (inp) inp.focus();
    });
    document.addEventListener('keydown', key); draw();
  };

  if (document.body.dataset.page !== 'photos') return;

  F.page('photos', { right: false }, c => {
    const me = F.me(), q = new URLSearchParams(location.search);
    let tab = 'all', albumId = null;
    const mine = () => F.db().photos.filter(p => p.ownerId === me.id).sort((a, b) => b.ts - a.ts);
    const myAlbums = () => F.db().albums.filter(a => a.ownerId === me.id);
    const thumbs = (arr, ids) => arr.length ? `<div class="pgal">${arr.map(p => `<div class="th" data-ph="${p.id}"><img src="${p.src}" alt="" loading="lazy"></div>`).join('')}</div>` : '';
    const open = (id, ids) => F.photoViewer(id, ids, render);

    function upload(preAlbum) {
      let files = [];
      const albums = myAlbums();
      F.modal({ title: 'Загрузить фотографии', body: `<div class="form-row"><label>Альбом</label><select class="input" id="u-al"><option value="">Без альбома</option>${albums.map(a => `<option value="${a.id}"${a.id === preAlbum ? ' selected' : ''}>${F.esc(a.name)}</option>`).join('')}</select></div>
<button class="btn btn-ghost" id="u-pick" type="button">${F.ic('photo', 18)} Выбрать файлы</button><div class="previews" id="u-prev"></div>`,
        onOpen: m => { F.$('#u-pick', m.body).onclick = async () => { const got = await F.pickImages(true, 1100); files = files.concat(got); F.$('#u-prev', m.body).innerHTML = files.map(s => `<div class="prev"><img src="${s}" alt=""></div>`).join(''); }; },
        actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Загрузить', onClick: m => {
          if (!files.length) { F.toast('Выберите хотя бы одну фотографию'); return; }
          const al = F.$('#u-al', m.body).value || null, d = F.db();
          files.forEach(s => d.photos.unshift({ id: F.uid('ph'), ownerId: me.id, albumId: al, src: s, ts: Date.now(), likes: [], comments: [] }));
          if (!F.save()) { F.reload(); return; } m.close(); F.toast('Загружено: ' + files.length); render();
        } }] });
    }
    function newAlbum() {
      F.modal({ title: 'Новый альбом', body: '<div class="form-row"><label>Название</label><input class="input" id="al-n" maxlength="40" placeholder="Например, «Каникулы»"></div>',
        onOpen: m => F.$('#al-n', m.body).focus(),
        actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Создать', onClick: m => {
          const n = F.$('#al-n', m.body).value.trim(); if (!n) { F.toast('Введите название'); return; }
          F.db().albums.push({ id: F.uid('a'), ownerId: me.id, name: n, ts: Date.now() }); F.save(); m.close(); tab = 'albums'; albumId = null; render();
        } }] });
    }

    function render() {
      const photos = mine();
      let body = '';
      if (albumId) {
        const al = F.db().albums.find(a => a.id === albumId); if (!al) { albumId = null; return render(); }
        const ph = photos.filter(p => p.albumId === albumId);
        body = `<div class="card card-pad"><div class="toolbar" style="margin-bottom:12px"><div style="display:flex;align-items:center;gap:8px"><button class="icon-btn" data-a="back" aria-label="Назад">${F.ic('back')}</button><h2 class="page-title" style="font-size:20px">${F.esc(al.name)} <span class="muted small">${ph.length}</span></h2></div>
<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-a="upload-here">${F.ic('plus', 16)} Добавить</button>${al.system ? '' : `<button class="btn btn-ghost btn-sm" data-a="rename">${F.ic('edit', 16)}</button><button class="btn btn-ghost btn-sm" data-a="del-album">${F.ic('trash', 16)}</button>`}</div></div>
${ph.length ? thumbs(ph) : `<div class="empty">${F.ic('photo', 40)}<div>В альбоме пока нет фотографий</div></div>`}</div>`;
      } else if (tab === 'albums') {
        body = `<div class="card card-pad"><div class="pgal"><div class="new" data-a="new-album"><div>${F.ic('plus', 32)}<div>Новый альбом</div></div></div>${myAlbums().map(a => { const ph = photos.filter(p => p.albumId === a.id); return `<div class="album" data-album="${a.id}"><div class="th">${ph[0] ? `<img src="${ph[0].src}" alt="">` : `<div class="empty" style="padding:30px 0">${F.ic('folder', 32)}</div>`}</div>${F.esc(a.name)}<small>${ph.length} ${F.plural(ph.length, 'фото', 'фото', 'фото')}</small></div>`; }).join('')}</div></div>`;
      } else {
        body = `<div class="card card-pad">${photos.length ? thumbs(photos) : `<div class="empty">${F.ic('photo', 40)}<div>У вас пока нет фотографий</div><p><button class="btn" data-a="upload">Загрузить</button></p></div>`}</div>`;
      }
      c.innerHTML = `<div class="toolbar"><h1 class="page-title">Фотографии <span class="muted small">${photos.length}</span></h1><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-a="new-album">${F.ic('folder', 16)} Создать альбом</button><button class="btn btn-sm" data-a="upload">${F.ic('plus', 16)} Загрузить</button></div></div>
<div class="tabs"><button class="tab${tab === 'all' && !albumId ? ' active' : ''}" data-t="all">Все фотографии</button><button class="tab${tab === 'albums' || albumId ? ' active' : ''}" data-t="albums">Мои альбомы</button></div>${body}`;
    }

    c.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; albumId = null; render(); return; }
      const th = e.target.closest('[data-ph]');
      if (th) { const ids = albumId ? mine().filter(p => p.albumId === albumId).map(p => p.id) : mine().map(p => p.id); open(th.dataset.ph, ids); return; }
      const al = e.target.closest('[data-album]'); if (al) { albumId = al.dataset.album; render(); return; }
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'upload') upload(albumId); else if (a === 'upload-here') upload(albumId); else if (a === 'new-album') newAlbum();
      else if (a === 'back') { albumId = null; tab = 'albums'; render(); }
      else if (a === 'rename') {
        const al2 = F.db().albums.find(x => x.id === albumId);
        F.modal({ title: 'Переименовать альбом', body: `<input class="input" id="rn" maxlength="40" value="${F.esc(al2.name)}">`, actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => { const n = F.$('#rn', m.body).value.trim(); if (!n) return; al2.name = n; F.save(); m.close(); render(); } }] });
      } else if (a === 'del-album') {
        F.confirm('Удалить альбом вместе со всеми его фотографиями?', 'Удалить').then(ok => {
          if (!ok) return; const d = F.db(); const gone = d.photos.filter(p => p.albumId === albumId).map(p => p.id);
          d.photos = d.photos.filter(p => p.albumId !== albumId); d.albums = d.albums.filter(x => x.id !== albumId);
          F.allUsers().forEach(u => { u.bookmarks.photos = u.bookmarks.photos.filter(x => !gone.includes(x)); }); F.save(); albumId = null; tab = 'albums'; render(); F.toast('Альбом удалён');
        });
      }
    });
    if (q.get('tab') === 'albums') tab = 'albums';
    render();
  });
})(window.Karakuli);
