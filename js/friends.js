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

    function card(u, kind) {
      let btns;
      if (kind === 'friend') btns = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a><button class="btn btn-ghost btn-sm" data-f="remove" data-id="${u.id}">Удалить</button>`;
      else if (kind === 'follower') btns = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a>${F.isFollowing(u.id) ? '<button class="btn btn-ghost btn-sm" data-f="unfollow" data-id="' + u.id + '">Вы подписаны</button>' : '<button class="btn btn-ghost btn-sm" data-f="follow" data-id="' + u.id + '">Подписаться в ответ</button>'}`;
      else if (kind === 'following') btns = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a><button class="btn btn-ghost btn-sm" data-f="unfollow" data-id="${u.id}">Отписаться</button>`;
      else if (kind === 'incoming') btns = `<button class="btn btn-sm" data-f="accept" data-id="${u.id}">Принять</button><button class="btn btn-ghost btn-sm" data-f="decline" data-id="${u.id}">Отклонить</button>`;
      else if (kind === 'outgoing') btns = `<button class="btn btn-ghost btn-sm" data-f="cancel" data-id="${u.id}">Отменить заявку</button>`;
      else if (me.friends.includes(u.id)) btns = `<a class="btn btn-sm" href="messages.html?u=${u.id}">Написать</a><span class="muted small" style="align-self:center">в друзьях</span>`;
      else if (me.outgoing.includes(u.id)) btns = '<span class="muted small">Заявка отправлена</span>';
      else if (me.incoming.includes(u.id)) btns = `<button class="btn btn-sm" data-f="accept" data-id="${u.id}">Принять</button>`;
      else btns = `<button class="btn btn-sm" data-f="add" data-id="${u.id}">${F.ic('plus', 16)} Добавить</button><a class="btn btn-ghost btn-sm" href="messages.html?u=${u.id}">Написать</a>${F.isFollowing(u.id) ? '<button class="btn btn-ghost btn-sm" data-f="unfollow" data-id="' + u.id + '">Отписаться</button>' : '<button class="btn btn-ghost btn-sm" data-f="follow" data-id="' + u.id + '">Подписаться</button>'}`;
      return `<div class="card pcard"><a class="ava-wrap" href="profile.html?id=${u.id}"><img class="ava ava-l" src="${F.avatar(u)}" alt="">${F.isOnline(u) ? '<i class="online-dot"></i>' : ''}</a>
<div class="grow"><a class="name" href="profile.html?id=${u.id}">${F.nameHTML(u, 16)}</a>${u.username ? `<div class="muted small">@${F.esc(u.username)}</div>` : ''}<div class="st">${F.esc(u.status || '')}</div><div class="btns">${btns}</div></div></div>`;
    }

    function render() {
      const friends = users(me.friends), inc = users(me.incoming), out = users(me.outgoing), onl = friends.filter(F.isOnline);
      const fol = users(me.followers || []), fing = users(me.following || []);
      const T = [['all', 'Мои друзья', friends.length], ['online', 'Онлайн', onl.length], ['incoming', 'Заявки', inc.length, true], ['outgoing', 'Исходящие', out.length], ['followers', 'Подписчики', fol.length], ['following', 'Подписки', fing.length], ['search', 'Поиск людей', 0]];
      F.$('#ftabs', c).innerHTML = `<div class="tabs">${T.map(t => `<button class="tab${tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}${t[2] ? ` <span class="cnt">${t[2]}</span>` : ''}</button>`).join('')}</div>`;
      let arr, kind = null, empty = 'Здесь пока никого нет';
      if (tab === 'all') { arr = friends; kind = 'friend'; empty = 'У вас пока нет друзей. Найдите их во вкладке «Поиск людей»!'; }
      else if (tab === 'online') { arr = onl; kind = 'friend'; empty = 'Сейчас никто из друзей не в сети'; }
      else if (tab === 'incoming') { arr = inc; kind = 'incoming'; empty = 'Новых заявок нет'; }
      else if (tab === 'outgoing') { arr = out; kind = 'outgoing'; empty = 'Исходящих заявок нет'; }
      else if (tab === 'followers') { arr = fol; kind = 'follower'; empty = 'У вас пока нет подписчиков'; }
      else if (tab === 'following') { arr = fing; kind = 'following'; empty = 'Вы пока ни на кого не подписаны'; }
      else { arr = F.allUsers().filter(u => u.id !== me.id); empty = 'Никого не нашли. Попробуйте другое имя.'; }
      arr = arr.filter(match);
      list.innerHTML = arr.length ? `<div class="people">${arr.map(u => card(u, kind)).join('')}</div>` : `<div class="card empty">${F.ic('friends', 40)}<div>${empty}</div></div>`;
    }

    F.$('#fq', c).addEventListener('input', e => { text = e.target.value.trim(); if (text && tab !== 'search' && !F.$('#flist .people')) { /* оставляем текущую вкладку */ } render(); });
    c.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); return; }
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
