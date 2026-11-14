/* Каракули — страница профиля (своя и чужая): шапка, вкладки, редактирование. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'profile') return;
  const q = new URLSearchParams(location.search);
  F.page(q.get('id') || q.get('u') ? '' : 'profile', { right: false }, c => {
    const uid = q.get('id') || (q.get('u') ? ((F.byUsername(q.get('u')) || {}).id || 'none') : F.sessionId());
    const me = F.me(), u = F.user(uid);
    if (!u) { c.innerHTML = `<div class="card empty">${F.ic('user', 40)}<div>Пользователь не найден</div><p><a class="btn" href="index.html">На главную</a></p></div>`; return; }
    const own = u.id === me.id;
    let tab = q.get('tab') || 'wall';
    c.innerHTML = '<div id="p-head"></div><div id="p-tabs"></div><div id="p-body" style="display:flex;flex-direction:column;gap:14px"></div>';
    const head = F.$('#p-head', c), tabsEl = F.$('#p-tabs', c), body = F.$('#p-body', c);
    const wall = () => F.db().posts.filter(p => p.authorId === u.id && !p.communityId).sort((a, b) => b.ts - a.ts);
    const photos = () => F.db().photos.filter(p => p.ownerId === u.id).sort((a, b) => b.ts - a.ts);
    const locked = () => !own && u.settings.privacy.profile === 'friends' && !F.areFriends(me.id, u.id);

    function renderHead() {
      let actions = '';
      const folBtn = own ? '' : (F.isFollowing(u.id) ? '<button class="btn btn-ghost btn-sm" data-p="unfollow">Вы подписаны</button>' : '<button class="btn btn-ghost btn-sm" data-p="follow">Подписаться</button>');
      if (own) actions = `<button class="btn btn-sm" data-p="edit">${F.ic('edit', 16)} Редактировать профиль</button>`;
      else if (me.friends.includes(u.id)) actions = `<a class="btn btn-sm" href="messages.html?u=${u.id}">${F.ic('chat', 16)} Написать</a><button class="btn btn-ghost btn-sm" data-p="remove">Удалить из друзей</button>${folBtn}`;
      else if (me.incoming.includes(u.id)) actions = `<button class="btn btn-sm" data-p="accept">Принять заявку</button><button class="btn btn-ghost btn-sm" data-p="decline">Отклонить</button><a class="btn btn-ghost btn-sm" href="messages.html?u=${u.id}">Написать</a>${folBtn}`;
      else if (me.outgoing.includes(u.id)) actions = `<button class="btn btn-ghost btn-sm" data-p="cancel">Отменить заявку</button><a class="btn btn-ghost btn-sm" href="messages.html?u=${u.id}">Написать</a>${folBtn}`;
      else actions = `<button class="btn btn-sm" data-p="add">${F.ic('plus', 16)} Добавить в друзья</button><a class="btn btn-ghost btn-sm" href="messages.html?u=${u.id}">Написать</a>${folBtn}`;
      const showStats = !locked();
      head.innerHTML = `<section class="card profile-card"><div class="cover"><img src="${F.cover(u)}" alt="">${own ? `<button class="btn btn-ghost btn-sm" data-p="edit">${F.ic('photo', 16)} Сменить обложку</button>` : ''}</div>
<div class="p-main"><span class="ava-wrap"><img class="ava ava-xl" src="${F.avatar(u)}" alt="">${F.isOnline(u) ? '<i class="online-dot" style="width:20px;height:20px;border-width:3px"></i>' : ''}</span>
<div class="p-info"><h1>${F.nameHTML(u, 22)}</h1>${u.username ? `<div class="handle" id="p-handle">@${F.esc(u.username)}</div>` : ''}<div class="status-line${own ? ' own' : ''}" ${own ? 'data-p="status" title="Изменить статус"' : ''}>${F.esc(u.status || (own ? 'Установить статус' : ''))}</div>
<div style="margin-top:3px">${F.isOnline(u) ? '<span class="on-text">Online</span>' : '<span class="muted small">был(а) в сети недавно</span>'}</div></div>
<div class="p-actions">${actions}</div></div>
${showStats ? `<div class="p-stats"><div><b>${u.friends.length}</b>${F.plural(u.friends.length, 'друг', 'друга', 'друзей')}</div><div><a href="#" data-sl="followers"><b>${(u.followers || []).length}</b>${F.plural((u.followers || []).length, 'подписчик', 'подписчика', 'подписчиков')}</a></div><div><a href="#" data-sl="following"><b>${(u.following || []).length}</b>${F.plural((u.following || []).length, 'подписка', 'подписки', 'подписок')}</a></div><div><b>${photos().length}</b>${F.plural(photos().length, 'фотография', 'фотографии', 'фотографий')}</div><div><b>${wall().length}</b>${F.plural(wall().length, 'публикация', 'публикации', 'публикаций')}</div></div>` : '<div style="height:10px"></div>'}</section>`;
    }
    function renderTabs() {
      const T = [['wall', 'Стена'], ['info', 'Информация'], ['friends', 'Друзья'], ['photos', 'Фотографии']];
      tabsEl.innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
    }
    function renderBody() {
      if (locked()) { body.innerHTML = `<div class="card empty">${F.ic('lock', 40)}<div><b>Страница доступна только друзьям</b></div><div class="small">Добавьте пользователя в друзья, чтобы увидеть записи, фотографии и информацию.</div></div>`; return; }
      if (tab === 'wall') {
        body.innerHTML = (own ? '<div id="comp"></div>' : '') + '<div id="wall" style="display:flex;flex-direction:column;gap:14px"></div>';
        const draw = () => { F.posts.mount(F.$('#wall', body), wall, { empty: own ? 'На вашей стене пока пусто. Напишите что-нибудь!' : 'На стене пока нет записей', onRepost: refreshAll }); };
        if (own) F.posts.composer(F.$('#comp', body), { onPublish: refreshAll });
        draw();
      } else if (tab === 'info') {
        const rows = [['Имя', F.fullName(u)], ['Юзернейм', F.handle(u)], ['Дата рождения', F.fmtBirth(u.birth)], ['Город', u.city], ['О себе', u.about], ['На сайте с', F.fmtDate(u.created || Date.now())]].filter(r => r[1]);
        body.innerHTML = `<section class="card card-pad"><dl class="info-table">${rows.map(r => `<dt>${r[0]}</dt><dd>${F.esc(r[1]).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>${own && !u.about ? '<p><button class="btn btn-ghost btn-sm" data-p="edit">Рассказать о себе</button></p>' : ''}</section>`;
      } else if (tab === 'friends') {
        const fr = u.friends.map(F.user).filter(Boolean);
        body.innerHTML = `<section class="card card-pad">${fr.length ? `<div class="mini-grid">${fr.map(f => `<a href="profile.html?id=${f.id}"><img class="ava" src="${F.avatar(f)}" alt=""><span>${F.esc(f.first)}</span></a>`).join('')}</div>` : `<div class="empty">${F.ic('friends', 40)}<div>Друзей пока нет</div></div>`}</section>`;
      } else {
        const ph = photos();
        body.innerHTML = `<section class="card card-pad">${ph.length ? `<div class="pgal">${ph.map(p => `<div class="th" data-ph="${p.id}"><img src="${p.src}" alt="" loading="lazy"></div>`).join('')}</div>` : `<div class="empty">${F.ic('photo', 40)}<div>Фотографий пока нет</div></div>`}${own ? '<p style="margin:12px 0 0"><a class="btn btn-ghost btn-sm" href="photos.html">Управление фотографиями</a></p>' : ''}</section>`;
      }
    }
    function refreshAll() { renderHead(); renderBody(); }

    function editModal() {
      let av = u.avatar, cv = u.cover;
      F.modal({ title: 'Редактировать профиль', wide: true, body: `
<div class="form-grid"><div class="form-row"><label>Имя</label><input class="input" id="e-first" maxlength="30" value="${F.esc(u.first)}"></div><div class="form-row"><label>Фамилия</label><input class="input" id="e-last" maxlength="30" value="${F.esc(u.last)}"></div></div>
<div class="form-row"><label>Статус</label><input class="input" id="e-status" maxlength="100" value="${F.esc(u.status || '')}"></div>
<div class="form-grid"><div class="form-row"><label>Дата рождения</label><input class="input" id="e-birth" type="date" value="${F.esc(u.birth || '')}"></div><div class="form-row"><label>Город</label><input class="input" id="e-city" maxlength="50" value="${F.esc(u.city || '')}"></div></div>
<div class="form-row"><label>О себе</label><textarea class="input" id="e-about" rows="3" maxlength="500">${F.esc(u.about || '')}</textarea></div>
<div class="form-grid"><div class="form-row"><label>Аватар</label><div style="display:flex;gap:10px;align-items:center"><img class="ava ava-l" id="e-av" src="${F.avatar(u)}" alt=""><div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-ghost btn-sm" id="e-avb" type="button">Загрузить</button><button class="link-btn small" id="e-avr" type="button">Сбросить</button></div></div></div>
<div class="form-row"><label>Обложка</label><div style="display:flex;gap:10px;align-items:center"><img id="e-cv" src="${F.cover(u)}" alt="" style="width:110px;height:64px;object-fit:cover;border-radius:12px;border:2px solid var(--line)"><div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-ghost btn-sm" id="e-cvb" type="button">Загрузить</button><button class="link-btn small" id="e-cvr" type="button">Сбросить</button></div></div></div></div>`,
        onOpen: m => {
          const g = s => F.$(s, m.body);
          g('#e-avb').onclick = async () => { const r = await F.pickImages(false, 400); if (r[0]) { av = r[0]; g('#e-av').src = av; } };
          g('#e-avr').onclick = () => { av = null; g('#e-av').src = F.avatarFor(u.id + u.first); };
          g('#e-cvb').onclick = async () => { const r = await F.pickImages(false, 1200); if (r[0]) { cv = r[0]; g('#e-cv').src = cv; } };
          g('#e-cvr').onclick = () => { cv = null; g('#e-cv').src = F.scene('sunset', 1); };
        },
        actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => {
          const g = s => F.$(s, m.body).value.trim(), first = g('#e-first'), last = g('#e-last');
          if (!first || !last) { F.toast('Имя и фамилия обязательны'); return; }
          Object.assign(u, { first, last, status: g('#e-status'), birth: g('#e-birth'), city: g('#e-city'), about: g('#e-about'), avatar: av, cover: cv });
          F.save(); m.close(); F.toast('Сохраняем…'); F.flush().then(() => { location.href = 'profile.html'; });
        } }] });
    }
    function statusModal() {
      F.modal({ title: 'Статус', body: `<input class="input" id="s-t" maxlength="100" value="${F.esc(u.status || '')}" placeholder="Чем вы сейчас заняты?">`, onOpen: m => F.$('#s-t', m.body).focus(),
        actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить', onClick: m => { u.status = F.$('#s-t', m.body).value.trim(); F.save(); m.close(); renderHead(); } }] });
    }

    c.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; renderTabs(); renderBody(); return; }
      const th = e.target.closest('[data-ph]'); if (th) { F.photoViewer(th.dataset.ph, photos().map(p => p.id), refreshAll); return; }
      const sl = e.target.closest('[data-sl]');
      if (sl) { e.preventDefault(); const kind = sl.dataset.sl, ids = (u[kind] || []).map(F.user).filter(Boolean);
        F.modal({ title: (kind === 'followers' ? 'Подписчики' : 'Подписки') + ' · ' + F.esc(u.first), body: ids.length ? ids.map(x => `<a class="rowitem" href="profile.html?id=${x.id}"><img class="ava ava-m" src="${F.avatar(x)}" alt=""><span class="grow"><b>${F.nameHTML(x, 14)}</b>${x.username ? `<span class="muted small">@${F.esc(x.username)}</span>` : ''}</span></a>`).join('') : '<div class="empty">Здесь пока никого нет</div>' }); return; }
      const b = e.target.closest('[data-p]'); if (!b) return; const a = b.dataset.p;
      if (a === 'edit') editModal(); else if (a === 'status') statusModal();
      else if (a === 'follow') { if (F.follow(u.id)) F.toast('Вы подписались на ' + u.first); refreshAll(); }
      else if (a === 'unfollow') { F.unfollow(u.id); refreshAll(); }
      else if (a === 'add') { F.sendRequest(u.id); F.toast('Заявка отправлена'); refreshAll(); }
      else if (a === 'cancel') { F.cancelRequest(u.id); refreshAll(); }
      else if (a === 'accept') { F.acceptRequest(u.id); F.toast('Теперь вы друзья'); refreshAll(); }
      else if (a === 'decline') { F.declineRequest(u.id); refreshAll(); }
      else if (a === 'remove') F.confirm('Удалить ' + F.fullName(u) + ' из друзей?', 'Удалить').then(ok => { if (ok) { F.removeFriend(u.id); refreshAll(); } });
    });
    window.addEventListener('karakuli:update', () => { renderHead(); });
    renderHead(); renderTabs(); renderBody();
    if (own && q.get('edit') === '1') editModal();
    if (own && q.get('welcome') === '1') F.toast('Добро пожаловать в Каракули! Ваша страница создана 🎉');
  });
})(window.Karakuli);
