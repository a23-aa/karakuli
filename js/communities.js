/* Каракули — каталог сообществ и страница сообщества (создание, подписка, редактирование, стена). */
(function (F) {
  'use strict';
  const page = document.body.dataset.page;
  if (page !== 'communities' && page !== 'community') return;

  const joined = (c, uid) => c.members.includes(uid);
  function toggleJoin(c) {
    const me = F.me(); const i = c.members.indexOf(me.id);
    if (i >= 0) { c.members.splice(i, 1); F.toast('Вы отписались от «' + c.name + '»'); } else { c.members.push(me.id); F.toast('Вы подписались на «' + c.name + '»'); }
    F.save();
  }
  /** Форма создания/редактирования сообщества. */
  function editModal(c, done) {
    const isNew = !c; let av = c ? c.avatar : null, cv = c ? c.cover : null;
    F.modal({ title: isNew ? 'Создать сообщество' : 'Редактировать сообщество', wide: true, body: `
<div class="form-row"><label>Название</label><input class="input" id="c-n" maxlength="50" value="${F.esc(c ? c.name : '')}" placeholder="Например, «Любители фото»"></div>
<div class="form-row"><label>Описание</label><textarea class="input" id="c-d" rows="3" maxlength="400" placeholder="О чём ваше сообщество?">${F.esc(c ? c.desc : '')}</textarea></div>
<div class="form-grid"><div class="form-row"><label>Аватар</label><div style="display:flex;gap:10px;align-items:center"><img class="ava ava-l" style="border-radius:16px" id="c-av" src="${c ? F.cAvatar(c) : F.communityIcon('⭐', 'new' + Date.now())}" alt=""><button class="btn btn-ghost btn-sm" id="c-avb" type="button">Загрузить</button></div></div>
<div class="form-row"><label>Обложка</label><div style="display:flex;gap:10px;align-items:center"><img id="c-cv" src="${c ? F.cCover(c) : F.scene('sunset', 9)}" alt="" style="width:110px;height:64px;object-fit:cover;border-radius:12px;border:2px solid var(--line)"><button class="btn btn-ghost btn-sm" id="c-cvb" type="button">Загрузить</button></div></div></div>`,
      onOpen: m => {
        const g = s => F.$(s, m.body);
        g('#c-avb').onclick = async () => { const r = await F.pickImages(false, 400); if (r[0]) { av = r[0]; g('#c-av').src = av; } };
        g('#c-cvb').onclick = async () => { const r = await F.pickImages(false, 1200); if (r[0]) { cv = r[0]; g('#c-cv').src = cv; } };
      },
      actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: isNew ? 'Создать' : 'Сохранить', onClick: m => {
        const name = F.$('#c-n', m.body).value.trim(), desc = F.$('#c-d', m.body).value.trim();
        if (!name) { F.toast('Введите название сообщества'); return; }
        const me = F.me(), d = F.db();
        if (isNew) { c = { id: F.uid('c'), name, desc, emoji: '⭐', avatar: av, cover: cv, creatorId: me.id, members: [me.id], base: 0, created: Date.now() }; d.communities.push(c); }
        else Object.assign(c, { name, desc, avatar: av, cover: cv });
        if (!F.save()) { F.reload(); return; } m.close(); F.toast(isNew ? 'Сообщество создано' : 'Сохранено'); done(c);
      } }] });
  }

  if (page === 'communities') {
    F.page('communities', { right: false }, c => {
      const me = F.me(), q = new URLSearchParams(location.search);
      let tab = q.get('tab') || 'all', text = '';
      c.innerHTML = `<div class="toolbar"><h1 class="page-title">Сообщества</h1><button class="btn btn-sm" id="mk">${F.ic('plus', 16)} Создать сообщество</button></div>
<div class="search" style="max-width:none;position:relative"><span style="position:absolute;z-index:2;pointer-events:none;left:12px;top:9px;color:var(--muted)">${F.ic('search', 18)}</span><input id="cq" class="input" style="padding-left:38px;border-radius:999px" placeholder="Поиск по сообществам…" autocomplete="off"></div>
<div id="ctabs"></div><div id="clist" class="cgrid"></div>`;
      const list = F.$('#clist', c);
      function render() {
        const all = F.db().communities;
        const mine = all.filter(x => joined(x, me.id));
        const T = [['all', 'Все'], ['popular', 'Популярные'], ['rec', 'Рекомендации'], ['mine', 'Мои сообщества']];
        F.$('#ctabs', c).innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}${t[0] === 'mine' ? ` <span class="cnt">${mine.length}</span>` : ''}</button>`).join('')}</div>`;
        let arr = all.slice();
        if (tab === 'popular') arr.sort((a, b) => F.members(b) - F.members(a));
        else if (tab === 'rec') arr = arr.filter(x => !joined(x, me.id)).sort((a, b) => F.members(b) - F.members(a));
        else if (tab === 'mine') arr = mine;
        if (text) arr = arr.filter(x => (x.name + ' ' + x.desc).toLowerCase().includes(text));
        list.innerHTML = arr.length ? arr.map(x => `<div class="card ccard"><a href="community.html?id=${x.id}"><img class="ava ava-l" src="${F.cAvatar(x)}" alt=""></a>
<div class="grow"><a class="name" href="community.html?id=${x.id}">${F.esc(x.name)}</a><div class="muted small">${F.fmtCount(F.members(x))} ${F.plural(F.members(x), 'подписчик', 'подписчика', 'подписчиков')}</div><div class="desc">${F.esc(x.desc)}</div></div>
<button class="btn btn-sm${joined(x, me.id) ? ' btn-ghost' : ''}" data-j="${x.id}">${joined(x, me.id) ? 'Вы подписаны' : 'Подписаться'}</button></div>`).join('')
          : `<div class="card empty">${F.ic('groups', 40)}<div>${tab === 'mine' ? 'Вы пока не подписаны ни на одно сообщество' : 'Ничего не найдено'}</div></div>`;
      }
      c.addEventListener('click', e => {
        const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); return; }
        const j = e.target.closest('[data-j]'); if (j) { toggleJoin(F.community(j.dataset.j)); render(); return; }
        if (e.target.closest('#mk')) editModal(null, n => { F.toast('Создаём сообщество…'); F.flush().then(() => { location.href = 'community.html?id=' + n.id; }); });
      });
      F.$('#cq', c).addEventListener('input', e => { text = e.target.value.trim().toLowerCase(); render(); });
      render();
    });
  }

  if (page === 'community') {
    const id = new URLSearchParams(location.search).get('id');
    F.page('communities', { right: false }, c => {
      const me = F.me();
      if (!F.community(id)) { c.innerHTML = `<div class="card empty">${F.ic('groups', 40)}<div>Сообщество не найдено</div><p><a class="btn" href="communities.html">К каталогу</a></p></div>`; return; }
      let tab = 'wall';
      c.innerHTML = '<div id="ch"></div><div id="ct"></div><div id="cb" style="display:flex;flex-direction:column;gap:14px"></div>';
      const head = F.$('#ch', c), tabsEl = F.$('#ct', c), body = F.$('#cb', c);
      const cm = () => F.community(id);
      const posts = () => F.db().posts.filter(p => p.communityId === id).sort((a, b) => b.ts - a.ts);

      function renderHead() {
        const x = cm(), isOwner = x.creatorId === me.id, j = joined(x, me.id), n = F.members(x);
        head.innerHTML = `<section class="card profile-card"><div class="cover"><img src="${F.cCover(x)}" alt=""></div>
<div class="p-main"><img class="ava ava-xl" style="border-radius:26px" src="${F.cAvatar(x)}" alt=""><div class="p-info"><h1>${F.esc(x.name)}</h1><div class="muted">${F.fmtCount(n)} ${F.plural(n, 'подписчик', 'подписчика', 'подписчиков')}</div></div>
<div class="p-actions"><button class="btn btn-sm${j ? ' btn-ghost' : ''}" data-c="join">${j ? 'Вы подписаны' : 'Вступить'}</button>${isOwner ? `<button class="btn btn-ghost btn-sm" data-c="edit">${F.ic('edit', 16)} Редактировать</button>` : ''}</div></div><div style="height:10px"></div></section>`;
      }
      function renderTabs() {
        const T = [['wall', 'Публикации'], ['info', 'Информация'], ['members', 'Участники'], ['photos', 'Фотографии']];
        tabsEl.innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
      }
      function renderBody() {
        const x = cm();
        if (tab === 'wall') {
          const canPost = joined(x, me.id);
          body.innerHTML = (canPost ? '<div id="comp"></div>' : `<div class="card card-pad muted small center">Вступите в сообщество, чтобы публиковать записи</div>`) + '<div id="wall" style="display:flex;flex-direction:column;gap:14px"></div>';
          if (canPost) F.posts.composer(F.$('#comp', body), { communityId: id, placeholder: 'Напишите что-нибудь в сообщество…', onPublish: () => F.posts.mount(F.$('#wall', body), posts) });
          F.posts.mount(F.$('#wall', body), posts, { empty: 'В сообществе пока нет публикаций' });
        } else if (tab === 'info') {
          const owner = F.user(x.creatorId);
          body.innerHTML = `<section class="card card-pad"><dl class="info-table"><dt>Описание</dt><dd>${F.esc(x.desc || 'Описание не заполнено')}</dd><dt>Подписчиков</dt><dd>${F.fmtCount(F.members(x))}</dd><dt>Создатель</dt><dd>${owner ? `<a href="profile.html?id=${owner.id}">${F.esc(F.fullName(owner))}</a>` : '—'}</dd><dt>Создано</dt><dd>${F.fmtDate(x.created || Date.now())}</dd></dl></section>`;
        } else if (tab === 'members') {
          const us = x.members.map(F.user).filter(Boolean);
          body.innerHTML = `<section class="card card-pad">${us.length ? `<div class="mini-grid">${us.map(u => `<a href="profile.html?id=${u.id}"><img class="ava" src="${F.avatar(u)}" alt=""><span>${F.esc(u.first)}</span></a>`).join('')}</div>` : '<div class="empty">Пока нет участников</div>'}${x.base ? `<p class="muted small" style="margin-bottom:0">и ещё ${F.fmtCount(x.base)} ${F.plural(x.base, 'участник', 'участника', 'участников')}</p>` : ''}</section>`;
        } else {
          const ph = []; posts().forEach(p => p.photos.forEach(s => ph.push(s)));
          body.innerHTML = `<section class="card card-pad">${ph.length ? `<div class="pgal">${ph.map((s, i) => `<div class="th" data-img="${i}"><img src="${s}" alt="" loading="lazy"></div>`).join('')}</div>` : `<div class="empty">${F.ic('photo', 40)}<div>В сообществе пока нет фотографий</div></div>`}</section>`;
          body._imgs = ph;
        }
      }
      c.addEventListener('click', e => {
        const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; renderTabs(); renderBody(); return; }
        const im = e.target.closest('[data-img]'); if (im) { F.lightbox(body._imgs, +im.dataset.img); return; }
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'join') { toggleJoin(cm()); renderHead(); renderBody(); }
        else if (b.dataset.c === 'edit') editModal(cm(), () => { renderHead(); renderBody(); });
      });
      renderHead(); renderTabs(); renderBody();
    });
  }
})(window.Karakuli);
