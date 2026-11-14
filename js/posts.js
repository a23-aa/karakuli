/* ===================================================================
   Каракули — публикации: карточки, лайки, комментарии, репосты, закладки,
   форма создания записи. Страницы: index.html (главная), news.html.
   =================================================================== */
(function (F) {
  'use strict';
  const openC = new Set();
  const NL = s => F.esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const getPost = id => F.db().posts.find(p => p.id === id);

  function authorInfo(p) {
    if (p.communityId) {
      const c = F.community(p.communityId);
      if (c) return { name: c.name, href: 'community.html?id=' + c.id, ava: F.cAvatar(c), round: '14px' };
    }
    const u = F.user(p.authorId);
    return { name: F.fullName(u), html: F.nameHTML(u, 15), href: 'profile.html?id=' + p.authorId, ava: F.avatar(u), round: '50%' };
  }
  function photosHTML(p) {
    if (!p.photos || !p.photos.length) return '';
    const shown = p.photos.slice(0, 4), n = shown.length;
    return `<div class="pgrid n${n}">${shown.map((s, i) => `<img src="${s}" alt="Фото" loading="lazy" data-act="photo" data-pid="${p.id}" data-i="${i}">`).join('')}</div>`;
  }
  function embedHTML(p) {
    const o = getPost(p.repostOf);
    if (!o) return '<div class="repost muted">Запись удалена</div>';
    const a = authorInfo(o);
    return `<div class="repost"><div class="post-head" style="margin-bottom:4px"><a href="${a.href}"><img class="ava ava-s" style="border-radius:${a.round}" src="${a.ava}" alt=""></a><div><a class="post-author" href="${a.href}">${a.html || F.esc(a.name)}</a><div class="muted small">${F.timeAgo(o.ts)}</div></div></div>${o.text ? `<div class="post-text">${NL(o.text)}</div>` : ''}${photosHTML(o)}</div>`;
  }
  function canDelete(p, me) {
    if (p.authorId === me.id) return true;
    if (p.communityId) { const c = F.community(p.communityId); return !!c && c.creatorId === me.id; }
    return false;
  }

  function cardHTML(p) {
    const me = F.me(), a = authorInfo(p);
    const liked = p.likes.includes(me.id), saved = me.bookmarks.posts.includes(p.id);
    const reposts = F.db().posts.filter(x => x.repostOf === p.id).length;
    const open = openC.has(p.id);
    let comments = '';
    if (open) {
      comments = `<div class="comments">${p.comments.map(c => {
        const u = F.user(c.authorId);
        return `<div class="comment"><a href="profile.html?id=${c.authorId}"><img class="ava ava-s" src="${F.avatar(u)}" alt=""></a><div class="c-body"><a class="c-name" href="profile.html?id=${c.authorId}">${F.nameHTML(u, 13)}</a> <span>${NL(c.text)}</span><div class="muted small">${F.timeAgo(c.ts)}${(c.authorId === me.id || p.authorId === me.id) ? ` · <button class="link-btn" data-act="del-comment" data-cid="${c.id}">Удалить</button>` : ''}</div></div></div>`;
      }).join('')}<form class="comment-form" data-act="comment-form"><img class="ava ava-s" src="${F.avatar(me)}" alt=""><input class="input" name="t" placeholder="Написать комментарий…" autocomplete="off" maxlength="500"><button class="icon-btn" type="submit" aria-label="Отправить">${F.ic('send')}</button></form></div>`;
    }
    return `<article class="card post" id="post-${p.id}" data-id="${p.id}">
<header class="post-head"><a href="${a.href}"><img class="ava ava-m" style="border-radius:${a.round}" src="${a.ava}" alt=""></a>
<div class="grow"><a class="post-author" href="${a.href}">${a.html || F.esc(a.name)}</a><div class="muted small">${F.timeAgo(p.ts)}</div></div>
${canDelete(p, me) ? `<button class="icon-btn" data-act="delete" title="Удалить запись" aria-label="Удалить запись">${F.ic('trash', 18)}</button>` : ''}</header>
${p.text ? `<div class="post-text">${NL(p.text)}</div>` : ''}${p.repostOf ? embedHTML(p) : ''}${photosHTML(p)}
<div class="post-actions">
<button class="act${liked ? ' liked' : ''}" data-act="like">${F.ic('heart', 18)}<span>${p.likes.length}</span></button>
<button class="act" data-act="comments">${F.ic('comment', 18)}<span>${p.comments.length}</span></button>
<button class="act" data-act="repost" title="Поделиться">${F.ic('repost', 18)}<span>${reposts || ''}</span></button>
<button class="act sp${saved ? ' saved' : ''}" data-act="bookmark" title="В закладки" aria-label="В закладки">${F.ic('bookmark', 18)}</button></div>${comments}</article>`;
  }

  F.posts = {
    cardHTML,
    /** Рисует список записей в el. getList — функция, возвращающая актуальный массив. */
    mount(el, getList, opts) {
      opts = opts || {};
      el._getList = getList; el._opts = opts;
      const render = el._render = () => {
        const list = el._getList();
        el.innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="card empty">${F.ic('news', 40)}<div>${F.esc(el._opts.empty || 'Здесь пока нет записей')}</div></div>`;
      };
      render();
      if (!el._bound) { el._bound = true; bind(el); }
    },
    /** Форма создания записи (на стене пользователя или сообщества). */
    composer(host, o) {
      o = o || {}; const me = F.me(); let imgs = [];
      host.innerHTML = `<div class="card composer"><img class="ava ava-m" src="${F.avatar(me)}" alt=""><div class="comp-main">
<textarea class="input" rows="2" placeholder="${F.esc(o.placeholder || 'Что у вас нового?')}" maxlength="3000"></textarea><div class="previews"></div>
<div class="comp-bar"><button class="btn btn-ghost btn-sm" data-c="photo" type="button">${F.ic('photo', 18)} Фото</button><button class="btn btn-sm" data-c="send" type="button">Опубликовать</button></div></div></div>`;
      const ta = F.$('textarea', host), pv = F.$('.previews', host);
      const drawPrev = () => { pv.innerHTML = imgs.map((s, i) => `<div class="prev"><img src="${s}" alt=""><button data-rm="${i}" type="button" aria-label="Убрать">×</button></div>`).join(''); };
      host.addEventListener('click', async e => {
        const rmB = e.target.closest('[data-rm]');
        if (rmB) { imgs.splice(+rmB.dataset.rm, 1); drawPrev(); return; }
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'photo') {
          const got = await F.pickImages(true, 900); if (got.length) { imgs = imgs.concat(got).slice(0, 6); drawPrev(); }
        } else {
          const text = ta.value.trim();
          if (!text && !imgs.length) { F.toast('Напишите что-нибудь или добавьте фото'); return; }
          const d = F.db();
          const p = { id: F.uid('p'), authorId: me.id, communityId: o.communityId || null, text, photos: imgs.slice(), ts: Date.now(), likes: [], comments: [], repostOf: null };
          d.posts.unshift(p);
          if (!p.communityId && imgs.length) { const al = F.wallAlbum(me.id); imgs.forEach(s => d.photos.unshift({ id: F.uid('ph'), ownerId: me.id, albumId: al.id, src: s, ts: Date.now(), likes: [], comments: [] })); }
          if (!F.save()) { F.reload(); return; }
          ta.value = ''; imgs = []; drawPrev(); F.toast('Запись опубликована');
          if (o.onPublish) o.onPublish(p);
        }
      });
    },
    feed(kind, sort) {
      const me = F.me(), d = F.db();
      const myC = d.communities.filter(c => c.members.includes(me.id)).map(c => c.id);
      let list = d.posts.filter(p => {
        if (kind === 'home') return p.communityId ? myC.includes(p.communityId) : (p.authorId === me.id || me.friends.includes(p.authorId));
        if (kind === 'friends') return !p.communityId && (p.authorId === me.id || me.friends.includes(p.authorId));
        if (kind === 'communities') return !!p.communityId && myC.includes(p.communityId);
        return true;
      });
      list = list.slice();
      if (sort === 'popular') list.sort((a, b) => (b.likes.length * 2 + b.comments.length) - (a.likes.length * 2 + a.comments.length) || b.ts - a.ts);
      else list.sort((a, b) => b.ts - a.ts);
      return list;
    }
  };

  function bind(el) {
    const rr = () => el._render();
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
      const art = b.closest('.post'); if (!art) return;
      const me = F.me(), p = getPost(art.dataset.id); if (!p) return;
      const act = b.dataset.act;
      if (act === 'photo') {
        const src = getPost(b.dataset.pid) || p; F.lightbox(src.photos, +b.dataset.i || 0);
      } else if (act === 'like') {
        const i = p.likes.indexOf(me.id);
        if (i >= 0) p.likes.splice(i, 1); else { p.likes.push(me.id); F.notify(p.authorId, 'like', me.id, { link: 'index.html#post-' + p.id }); }
        F.save(); rr();
      } else if (act === 'comments') {
        if (openC.has(p.id)) openC.delete(p.id); else openC.add(p.id);
        rr(); const inp = F.$('#post-' + p.id + ' .comment-form input'); if (inp) inp.focus();
      } else if (act === 'bookmark') {
        const arr = me.bookmarks.posts, i = arr.indexOf(p.id);
        if (i >= 0) { arr.splice(i, 1); F.toast('Убрано из закладок'); } else { arr.push(p.id); F.toast('Сохранено в закладки'); }
        F.save(); rr();
      } else if (act === 'delete') {
        F.confirm('Удалить эту запись?', 'Удалить').then(ok => {
          if (!ok) return; const d = F.db();
          d.posts = d.posts.filter(x => x.id !== p.id);
          F.allUsers().forEach(u => { const k = u.bookmarks.posts.indexOf(p.id); if (k >= 0) u.bookmarks.posts.splice(k, 1); });
          F.save(); rr(); F.toast('Запись удалена');
        });
      } else if (act === 'del-comment') {
        p.comments = p.comments.filter(c => c.id !== b.dataset.cid); F.save(); rr();
      } else if (act === 'repost') {
        const orig = p.repostOf ? (getPost(p.repostOf) || p) : p;
        F.modal({ title: 'Поделиться записью', body: '<textarea class="input" id="rp-t" rows="3" maxlength="1000" placeholder="Добавьте комментарий (необязательно)"></textarea><p class="muted small" style="margin:8px 0 0">Запись появится на вашей странице.</p>',
          actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Поделиться', onClick: m => {
            const t = F.$('#rp-t', m.body).value.trim();
            F.db().posts.unshift({ id: F.uid('p'), authorId: me.id, communityId: null, text: t, photos: [], ts: Date.now(), likes: [], comments: [], repostOf: orig.id });
            F.notify(orig.authorId, 'repost', me.id, { link: 'profile.html?id=' + me.id });
            F.save(); m.close(); F.toast('Запись опубликована на вашей странице'); if (el._opts.onRepost) el._opts.onRepost(); else rr();
          } }] });
      }
    });
    el.addEventListener('submit', e => {
      const f = e.target.closest('form[data-act="comment-form"]'); if (!f) return;
      e.preventDefault();
      const art = f.closest('.post'), p = getPost(art.dataset.id), me = F.me(), t = f.t.value.trim(); if (!p || !t) return;
      p.comments.push({ id: F.uid('c'), authorId: me.id, text: t, ts: Date.now() });
      F.notify(p.authorId, 'comment', me.id, { link: 'index.html#post-' + p.id });
      F.save(); rr();
      const inp = F.$('#post-' + p.id + ' .comment-form input'); if (inp) inp.focus();
    });
  }

  /* ---------- страницы ---------- */
  function flashHash() {
    if (!location.hash.startsWith('#post-')) return;
    const n = F.$(location.hash); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('flash'); }
  }
  const page = document.body.dataset.page;
  if (page === 'index') {
    F.page('index', { right: true }, (c, right) => {
      F.rightPanel(right);
      c.innerHTML = '<div id="comp"></div><div id="feed" style="display:flex;flex-direction:column;gap:14px"></div>';
      const feed = F.$('#feed', c);
      const draw = () => F.posts.mount(feed, () => F.posts.feed('home'), { empty: 'Лента пока пуста. Добавьте друзей или подпишитесь на сообщества!' });
      F.posts.composer(F.$('#comp', c), { onPublish: draw });
      draw(); flashHash();
    });
  } else if (page === 'news') {
    F.page('news', { right: true }, (c, right) => {
      F.rightPanel(right);
      let kind = 'all', sort = 'new';
      c.innerHTML = `<div class="toolbar"><h1 class="page-title">Новости</h1><select class="input" id="srt" style="width:auto"><option value="new">Сначала новые</option><option value="popular">Сначала популярные</option></select></div>
<div class="tabs" id="tb"><button class="tab active" data-k="all">Все записи</button><button class="tab" data-k="friends">Друзья</button><button class="tab" data-k="communities">Сообщества</button></div>
<div id="feed" style="display:flex;flex-direction:column;gap:14px"></div>`;
      const feed = F.$('#feed', c), empties = { all: 'Записей пока нет', friends: 'У ваших друзей пока нет записей', communities: 'Подпишитесь на сообщества, чтобы видеть их записи' };
      const draw = () => F.posts.mount(feed, () => F.posts.feed(kind, sort), { empty: empties[kind] });
      F.$('#tb', c).addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; kind = b.dataset.k; F.$$('.tab', c).forEach(t => t.classList.toggle('active', t === b)); draw(); });
      F.$('#srt', c).addEventListener('change', e => { sort = e.target.value; draw(); });
      draw(); flashHash();
    });
  }
})(window.Karakuli);
