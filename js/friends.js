/* Каракули — друзья: список, онлайн, входящие/исходящие заявки, поиск людей. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'friends') return;
  F.page('friends', { right: false }, c => {
    const me = F.me(), q = new URLSearchParams(location.search);
    let tab = q.get('tab') || 'all', text = q.get('q') || '';
    c.innerHTML = `<div class="toolbar"><h1 class="page-title">Друзья</h1></div>
<div class="search" style="max-width:none;position:relative"><span style="position:absolute;z-index:2;pointer-events:none;left:12px;top:9px;color:var(--muted)">${F.ic('search', 18)}</span><input id="fq" class="input" style="padding-left:38px;border-radius:999px" placeholder="Поиск по имени…" autocomplete="off" value="${F.esc(text)}"></div>
<div id="ftabs"></div><div id="flist"></div>`;
    const list = F.$('#flist', c);
    const users = ids => ids.map(F.user).filter(Boolean);
    const match = u => !text || F.fullName(u).toLowerCase().includes(text.toLowerCase()) || (!!u.username && u.username.includes(text.toLowerCase().replace(/^@/, '')));

    const fb = (a, id, t, cls) => `<button${cls ? ` class="${cls}"` : ''} data-f="${a}" data-id="${id}">${t}</button>`;
    let onlyOnline = false;

    /* на карточке одна главная кнопка, остальное в меню «⋯» */
    function card(u, kind) {
      const wr = `<a href="messages.html?u=${u.id}">Написать</a>`, folItem = F.isFollowing(u.id) ? fb('unfollow', u.id, 'Отписаться') : fb('follow', u.id, 'Подписаться');
      let main, menu = [];
      if (kind === 'friend') { main = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a>`; menu = [folItem, fb('remove', u.id, 'Удалить из друзей', 'danger')]; }
      else if (kind === 'incoming') { main = fb('accept', u.id, 'Принять', 'btn btn-sm'); menu = [fb('decline', u.id, 'Отклонить'), wr]; }
      else if (kind === 'outgoing') { main = '<span class="muted small" style="align-self:center">Заявка отправлена</span>'; menu = [fb('cancel', u.id, 'Отменить заявку'), wr]; }
      else if (kind === 'follower') { main = F.isFollowing(u.id) ? '<span class="muted small" style="align-self:center">Вы подписаны</span>' : fb('follow', u.id, 'Подписаться в ответ', 'btn btn-sm'); menu = [wr].concat(F.isFollowing(u.id) ? [fb('unfollow', u.id, 'Отписаться')] : []); }
      else if (kind === 'following') { main = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a>`; menu = [fb('unfollow', u.id, 'Отписаться')]; }
      else if (me.friends.includes(u.id)) { main = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a>`; menu = [folItem]; }
      else if (me.outgoing.includes(u.id)) { main = '<span class="muted small" style="align-self:center">Заявка отправлена</span>'; menu = [wr, folItem]; }
      else if (me.incoming.includes(u.id)) { main = fb('accept', u.id, 'Принять', 'btn btn-sm'); menu = [wr, folItem]; }
      else { main = fb('add', u.id, F.ic('plus', 16) + ' Добавить', 'btn btn-sm'); menu = [wr, folItem]; }
      return `<div class="card pcard"><a class="ava-wrap" href="profile.html?id=${u.id}"><img class="ava ava-l" src="${F.avatar(u)}" alt="">${F.isOnline(u) ? '<i class="online-dot"></i>' : ''}</a>
<div class="grow"><a class="name" href="profile.html?id=${u.id}">${F.nameHTML(u, 16)}</a>${u.username ? `<div class="muted small">@${F.esc(u.username)}</div>` : ''}<div class="st">${F.esc(u.status || '')}</div><div class="btns">${main}${F.menuHTML(menu)}</div></div></div>`;
    }

    function render() {
      const friends = users(me.friends), inc = users(me.incoming), out = users(me.outgoing);
      const fol = users(me.followers || []), fing = users(me.following || []);
      const T = [['all', 'Друзья', friends.length], ['requests', 'Заявки', inc.length + out.length, inc.length > 0], ['followers', 'Подписчики', fol.length], ['following', 'Подписки', fing.length], ['search', 'Поиск', 0]];
      if (tab === 'online') { tab = 'all'; onlyOnline = true; } else if (tab === 'incoming' || tab === 'outgoing') tab = 'requests';
      F.$('#ftabs', c).innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}${t[2] ? ` <span class="cnt">${t[2]}</span>` : ''}</button>`).join('')}</div>`;
      let html = '', empty = 'Здесь пока никого нет';
      const grid = (arr, kind) => { arr = arr.filter(match); return arr.length ? `<div class="people">${arr.map(u => card(u, kind)).join('')}</div>` : ''; };
      if (tab === 'all') {
        const arr = onlyOnline ? friends.filter(F.isOnline) : friends;
        html = `<div class="chips"><button class="chip${onlyOnline ? ' on' : ''}" data-chip="online">Только онлайн</button></div>` + (grid(arr, 'friend') || `<div class="card empty">${F.ic('friends', 40)}<div>${onlyOnline ? 'Сейчас никто из друзей не в сети' : 'У вас пока нет друзей. Найдите их во вкладке «Поиск»!'}</div></div>`);
      } else if (tab === 'requests') {
        const a = grid(inc, 'incoming'), b = grid(out, 'outgoing');
        html = (a ? `<div class="sec-title" style="margin:4px 0 8px">Входящие</div>${a}` : '') + (b ? `<div class="sec-title" style="margin:14px 0 8px">Отправленные</div>${b}` : '') || `<div class="card empty">${F.ic('friends', 40)}<div>Заявок нет</div></div>`;
      } else if (tab === 'followers') html = grid(fol, 'follower') || `<div class="card empty">${F.ic('friends', 40)}<div>У вас пока нет подписчиков</div></div>`;
      else if (tab === 'following') html = grid(fing, 'following') || `<div class="card empty">${F.ic('friends', 40)}<div>Вы пока ни на кого не подписаны</div></div>`;
      else html = grid(F.allUsers().filter(u => u.id !== me.id), null) || `<div class="card empty">${F.ic('friends', 40)}<div>Никого не нашли. Попробуйте другое имя.</div></div>`;
      list.innerHTML = html;
    }

    F.$('#fq', c).addEventListener('input', e => { text = e.target.value.trim(); if (text && tab !== 'search' && !F.$('#flist .people')) { /* оставляем текущую вкладку */ } render(); });
    c.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); return; }
      const ch = e.target.closest('[data-chip]'); if (ch) { onlyOnline = !onlyOnline; render(); return; }
      const b = e.target.closest('[data-f]'); if (!b) return; const id = b.dataset.id, u = F.user(id), a = b.dataset.f;
      if (a === 'follow') { F.follow(id); F.toast('Вы подписались на ' + u.first); }
      else if (a === 'unfollow') F.unfollow(id);
      else if (a === 'add') { F.sendRequest(id); F.toast('Заявка отправлена'); }
      else if (a === 'accept') { F.acceptRequest(id); F.toast('Теперь вы друзья с ' + u.first); }
      else if (a === 'decline') F.declineRequest(id);
      else if (a === 'cancel') F.cancelRequest(id);
      else if (a === 'remove') { F.confirm('Удалить ' + F.fullName(u) + ' из друзей?', 'Удалить').then(ok => { if (ok) { F.removeFriend(id); render(); } }); return; }
      render();
    });
    window.addEventListener('karakuli:update', render);
    render();
  });
})(window.Karakuli);
