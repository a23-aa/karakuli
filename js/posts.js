/* ===================================================================
   CrownNet — публикации: карточки, лайки, комментарии, репосты, закладки,
   форма создания записи. Страницы: index.html (главная), news.html.
   =================================================================== */
(function (F) {
  'use strict';
  const openC = new Set();
  const NL = s => F.esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s>])#([\p{L}\p{N}_]{2,30})/gu, '$1<a class="htag" href="news.html?tag=$2">#$2</a>').replace(/(^|[\s>])@([A-Za-z0-9_]{3,30})/g, '$1<a class="mention" href="profile.html?u=$2">@$2</a>').replace(/\n/g, '<br>');
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
    const vids = p.photos.filter(F.isVideoUrl), imgs = p.photos.filter(x => !F.isVideoUrl(x)), shown = imgs.slice(0, 4), n = shown.length;
    return vids.map(v => `<video class="pvid" src="${F.esc(v)}#t=0.1" controls playsinline preload="metadata"></video>`).join('') +
      (n ? `<div class="pgrid n${n}">${shown.map((s, i) => `<img src="${s}" alt="Фото" loading="lazy" data-act="photo" data-pid="${p.id}" data-i="${i}">`).join('')}</div>` : '');
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
    const why = F.posts.why && F.posts.why[p.id] ? `<div class="rec-why">${F.esc(F.posts.why[p.id])}</div>` : '';
    return `<article class="card post" id="post-${p.id}" data-id="${p.id}">${why}
<header class="post-head"><a href="${a.href}"><img class="ava ava-m" style="border-radius:${a.round}" src="${a.ava}" alt=""></a>
<div class="grow"><a class="post-author" href="${a.href}">${a.html || F.esc(a.name)}</a><div class="muted small">${F.timeAgo(p.ts)}</div></div>
${canDelete(p, me) ? `<button class="icon-btn" data-act="delete" title="Удалить запись" aria-label="Удалить запись">${F.ic('trash', 18)}</button>` : ''}</header>
${p.text ? `<div class="post-text">${NL(p.text)}</div>` : ''}${p.repostOf ? embedHTML(p) : ''}${photosHTML(p)}
<div class="post-actions">
<button class="act${liked ? ' liked' : ''}" data-act="like">${F.ic('heart', 18)}<span>${p.likes.length}</span></button>
<button class="act" data-act="comments">${F.ic('comment', 18)}<span>${p.comments.length}</span></button>
<button class="act" data-act="repost" title="Поделиться">${F.ic('repost', 18)}<span>${reposts || ''}</span></button>
<button class="act sp${saved ? ' saved' : ''}" data-act="bookmark" title="В закладки" aria-label="В закладки">${F.ic('bookmark', 18)}</button><span class="views" title="Просмотры" aria-label="Просмотры">${F.ic('eye', 18)}<span data-v="${p.id}">${p.views || 0}</span></span></div>${comments}</article>`;
  }

  F.posts = {
    cardHTML,
    /** Просмотры: запись, которая была видна на экране, считается один раз на человека. */
    watchViews(el) {
      if (!('IntersectionObserver' in window) || !F.sb) return;
      const me = F.me(); if (!me) return;
      let done = {}; try { done = JSON.parse(localStorage.getItem('cn-viewed') || '{}'); } catch (e) { }
      if (!el._vq) el._vq = new Set();
      const flush = () => {
        const ids = [...el._vq]; el._vq.clear(); if (!ids.length) return;
        Promise.resolve(F.sb.rpc('post_seen', { ids })).then(() => { }, () => { });
        ids.forEach(id => { done[id] = 1; const p = F.db().posts.find(x => x.id === id); if (p) { p.views = (p.views || 0) + 1; const sp = el.querySelector('[data-v="' + id + '"]'); if (sp) sp.textContent = p.views; } });
        try { const k = Object.keys(done); if (k.length > 3000) k.slice(0, 1000).forEach(x => delete done[x]); localStorage.setItem('cn-viewed', JSON.stringify(done)); } catch (e) { }
      };
      if (el._io) el._io.disconnect();
      let t = null;
      el._io = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return; const a = en.target, id = a.dataset.id; el._io.unobserve(a);
        const p = F.db().posts.find(x => x.id === id); const cur = F.me(); if (!p || done[id] || !cur || p.authorId === cur.id) return;
        el._vq.add(id); clearTimeout(t); t = setTimeout(flush, 1500);
      }), { threshold: 0.5 });
      el.querySelectorAll('.post[data-id]').forEach(a => el._io.observe(a));
    },
    /** Рисует список записей в el. getList — функция, возвращающая актуальный массив. */
    mount(el, getList, opts) {
      opts = opts || {};
      el._getList = getList; el._opts = opts;
      const render = el._render = () => {
        const list = el._getList();
        el.innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="card empty">${F.ic('news', 40)}<div>${F.esc(el._opts.empty || 'Здесь пока нет записей')}</div></div>`;
        F.posts.watchViews(el);
        if (el._opts.recs) F.posts.markSeen(el); else if (F.posts.why) F.posts.why = null;
      };
      render();
      if (!el._bound) { el._bound = true; bind(el); }
    },
    /** Форма создания записи (на стене пользователя или сообщества). */
    composer(host, o) {
      o = o || {}; const me = F.me(); let imgs = [];
      host.innerHTML = `<div class="card composer"><img class="ava ava-m" src="${F.avatar(me)}" alt=""><div class="comp-main">
<textarea class="input" rows="2" placeholder="${F.esc(o.placeholder || 'Что у вас нового?')}" maxlength="3000"></textarea><div class="previews"></div>
<div class="comp-bar"><button class="btn btn-ghost btn-sm" data-c="photo" type="button">${F.ic('photo', 18)} Фото</button><button class="btn btn-ghost btn-sm" data-c="video" type="button">${F.ic('video', 18)} Видео</button><button class="btn btn-sm" data-c="send" type="button">Опубликовать</button></div></div></div>`;
      const ta = F.$('textarea', host), pv = F.$('.previews', host);
      let busy = 0;
      const drawPrev = () => { pv.innerHTML = imgs.map((s, i) => `<div class="prev">${F.isVideoUrl(s) ? `<video src="${F.esc(s)}#t=0.1" muted playsinline preload="metadata"></video><i class="pv-play">▶</i>` : `<img src="${s}" alt="">`}<button data-rm="${i}" type="button" aria-label="Убрать">×</button></div>`).join('') + (busy ? '<div class="prev up"><span class="spin"></span>Загрузка видео…</div>' : ''); };
      host.addEventListener('click', async e => {
        const rmB = e.target.closest('[data-rm]');
        if (rmB) { imgs.splice(+rmB.dataset.rm, 1); drawPrev(); return; }
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'video') {
          if (busy) return; if (imgs.filter(F.isVideoUrl).length >= 2) { F.toast('Можно прикрепить до 2 видео'); return; }
          const f = await F.pickFile('video/*'); if (!f) return;
          if (!/^video\//.test(f.type)) { F.toast('Это не видео'); return; }
          if (f.size > 30 * 1024 * 1024) { F.toast('Видео больше 30 МБ. Обрежьте или сожмите его'); return; }
          busy++; drawPrev();
          try { const url = await F.uploadFile(f, f.name); imgs.push(url); } catch (err) { F.toast(String(err.message || err)); }
          busy--; drawPrev(); return;
        }
        if (b.dataset.c === 'photo') {
          const got = await F.pickImages(true, 900); if (got.length) { imgs = imgs.concat(got).slice(0, 6); drawPrev(); }
        } else {
          const text = ta.value.trim();
          if (busy) { F.toast('Дождитесь окончания загрузки видео'); return; }
          if (!text && !imgs.length) { F.toast('Напишите что-нибудь или добавьте фото или видео'); return; }
          const d = F.db();
          const p = { id: F.uid('p'), authorId: me.id, communityId: o.communityId || null, text, photos: imgs.slice(), ts: Date.now(), likes: [], comments: [], repostOf: null };
          d.posts.unshift(p); F.mentions(text, me.id, 'index.html#post-' + p.id);
          const stills = imgs.filter(x => !F.isVideoUrl(x));
          if (!p.communityId && stills.length) { const al = F.wallAlbum(me.id); stills.forEach(s => d.photos.unshift({ id: F.uid('ph'), ownerId: me.id, albumId: al.id, src: s, ts: Date.now(), likes: [], comments: [] })); }
          if (!F.save()) { F.reload(); return; }
          ta.value = ''; imgs = []; drawPrev(); F.toast('Запись опубликована');
          if (o.onPublish) o.onPublish(p);
        }
      });
    },
    /** Рекомендации: свежесть + популярность + близость автора (друзья, подписки, лайки, сообщества) + немного случайных новинок. */
    recommend() {
      const me = F.me(), d = F.db(), now = Date.now(), why = {};
      let seen = {}; try { seen = JSON.parse(localStorage.getItem('kr-seen') || '{}'); } catch (e) { /* без памяти */ }
      const myC = new Set(d.communities.filter(c => c.members.includes(me.id)).map(c => c.id)), fol = new Set(me.following || []), fr = new Set(me.friends || []);
      const liked = {}; d.posts.forEach(p => { if (p.likes.includes(me.id)) liked[p.authorId] = (liked[p.authorId] || 0) + 1; p.comments.forEach(c => { if (c.authorId === me.id) liked[p.authorId] = (liked[p.authorId] || 0) + 1; }); });
      const reposts = {}; d.posts.forEach(p => { if (p.repostOf) reposts[p.repostOf] = (reposts[p.repostOf] || 0) + 1; });
      const day = Math.floor(now / 864e5), h = str => { let x = 0; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) >>> 0; return x / 4294967295; };
      const scored = [];
      d.posts.forEach(p => {
        if (p.authorId === me.id || now - p.ts > 30 * 864e5) return;
        const u = F.user(p.authorId); if (!u || u.banned) return;
        if (p.repostOf && !getPost(p.repostOf)) return;
        const age = Math.max(0, (now - p.ts) / 36e5), fresh = Math.exp(-age / 60);
        let aff = 0, reason = '';
        if (fr.has(p.authorId)) { aff += 2; reason = 'Ваш друг'; } else if (fol.has(p.authorId)) { aff += 1.6; reason = 'Вы подписаны'; }
        if (p.communityId && myC.has(p.communityId)) { aff += 1.4; reason = 'Из вашего сообщества'; }
        if (liked[p.authorId]) { aff += Math.min(2.4, 0.6 * liked[p.authorId]); if (!reason) reason = 'Вам нравятся записи автора'; }
        const eng = Math.log1p(p.likes.length * 2 + p.comments.length * 3 + (reposts[p.id] || 0) * 4);
        if (!reason && eng >= 1.6) reason = 'Популярное';
        const media = (p.photos && p.photos.length ? 0.25 : 0) + (p.photos && p.photos.some(F.isVideoUrl) ? 0.2 : 0);
        const explore = 0.5 * h(p.id + day);
        if (!reason) reason = age < 12 ? 'Новое' : 'Может быть интересно';
        let score = (0.6 + aff + eng + media) * fresh + explore * fresh * 1.5;
        if (seen[p.id]) score *= 0.12;
        why[p.id] = reason; scored.push({ p, score, a: p.authorId });
      });
      scored.sort((a, b) => b.score - a.score);
      const out = [], used = {};
      while (scored.length && out.length < 60) { // не больше подряд записей одного автора: штраф за каждую уже выбранную
        scored.forEach(x => { x.eff = x.score * Math.pow(0.55, used[x.a] || 0); });
        let best = 0; scored.forEach((x, i) => { if (x.eff > scored[best].eff) best = i; });
        const x = scored.splice(best, 1)[0]; out.push(x.p); used[x.a] = (used[x.a] || 0) + 1;
      }
      F.posts.why = why; return out;
    },
    markSeen(el) {
      if (!('IntersectionObserver' in window)) return;
      if (el._io) el._io.disconnect();
      const store = () => { try { return JSON.parse(localStorage.getItem('kr-seen') || '{}'); } catch (e) { return {}; } };
      const timers = new Map();
      el._io = new IntersectionObserver(es => es.forEach(en => {
        const id = en.target.dataset.id;
        if (en.isIntersecting) timers.set(id, setTimeout(() => { const s = store(); s[id] = Date.now(); const ks = Object.keys(s); if (ks.length > 600) ks.sort((a, b) => s[a] - s[b]).slice(0, ks.length - 500).forEach(k => delete s[k]); try { localStorage.setItem('kr-seen', JSON.stringify(s)); } catch (e) { /* ок */ } }, 1500));
        else { clearTimeout(timers.get(id)); timers.delete(id); }
      }), { threshold: 0.6 });
      el.querySelectorAll('.post').forEach(a => el._io.observe(a));
    },
    feed(kind, sort) {
      if (kind === 'recs') return F.posts.recommend();
      const me = F.me(), d = F.db();
      const myC = d.communities.filter(c => c.members.includes(me.id)).map(c => c.id);
      let list = d.posts.filter(p => {
        const fol = me.following || [];
        if (kind === 'home') return p.communityId ? myC.includes(p.communityId) : (p.authorId === me.id || me.friends.includes(p.authorId) || fol.includes(p.authorId));
        if (kind === 'friends') return !p.communityId && (p.authorId === me.id || me.friends.includes(p.authorId));
        if (kind === 'follows') return !p.communityId && fol.includes(p.authorId);
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
        const src = getPost(b.dataset.pid) || p; F.lightbox(src.photos.filter(x => !F.isVideoUrl(x)), +b.dataset.i || 0);
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
      F.notify(p.authorId, 'comment', me.id, { link: 'index.html#post-' + p.id }); F.mentions(t, me.id, 'index.html#post-' + p.id, [p.authorId]);
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
      let mode = 'home'; try { mode = localStorage.getItem('kr-home') === 'recs' ? 'recs' : 'home'; } catch (e) { /* ок */ }
      c.innerHTML = '<div id="comp"></div><div class="tabs" id="htb"><button class="tab" data-k="home">Моя лента</button><button class="tab" data-k="recs">Рекомендации</button></div><div id="feed" style="display:flex;flex-direction:column;gap:14px"></div>';
      const feed = F.$('#feed', c);
      const draw = () => { F.$$('#htb .tab', c).forEach(t => t.classList.toggle('active', t.dataset.k === mode)); F.posts.mount(feed, () => F.posts.feed(mode), mode === 'recs' ? { recs: true, empty: 'Пока нечего рекомендовать. Загляните позже — или опубликуйте что-нибудь первым!' } : { empty: 'Лента пока пуста. Добавьте друзей, подпишитесь на людей или на сообщества — или загляните в «Рекомендации»!' }); };
      F.$('#htb', c).addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; mode = b.dataset.k; try { localStorage.setItem('kr-home', mode); } catch (x) { /* ок */ } draw(); });
      F.posts.composer(F.$('#comp', c), { onPublish: draw });
      draw(); flashHash();
    });
  } else if (page === 'news') {
    F.page('news', { right: true }, (c, right) => {
      F.rightPanel(right);
      let kind = 'recs', sort = 'new'; const tag = (new URLSearchParams(location.search).get('tag') || '').toLowerCase().replace(/^#/, ''); if (tag) kind = 'all';
      const tagsOf = t => (String(t || '').match(/#[\p{L}\p{N}_]{2,30}/gu) || []).map(x => x.slice(1).toLowerCase());
      const trending = (() => { const cnt = {}, since = Date.now() - 7 * 864e5; F.db().posts.forEach(p => { if (p.ts > since) new Set(tagsOf(p.text)).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }); }); return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8); })();
      c.innerHTML = `<div class="toolbar"><h1 class="page-title">${tag ? '#' + F.esc(tag) : 'Новости'}</h1><select class="input" id="srt" style="width:auto"><option value="new">Сначала новые</option><option value="popular">Сначала популярные</option></select></div>
<div class="tabs" id="tb"><button class="tab active" data-k="recs">Рекомендации</button><button class="tab" data-k="all">Все записи</button><button class="tab" data-k="friends">Друзья</button><button class="tab" data-k="follows">Подписки</button><button class="tab" data-k="communities">Сообщества</button></div>
${trending.length && !tag ? `<div class="card card-pad" style="margin-bottom:14px"><b style="display:block;margin-bottom:8px">Сейчас обсуждают</b><div class="trend">${trending.map(([t, n]) => `<a href="news.html?tag=${encodeURIComponent(t)}">#${F.esc(t)} <span class="muted">${n}</span></a>`).join('')}</div></div>` : ''}${tag ? '<p><a href="news.html">← Все новости</a></p>' : ''}
<div id="feed" style="display:flex;flex-direction:column;gap:14px"></div>`;
      const feed = F.$('#feed', c), empties = { recs: 'Пока нечего рекомендовать', all: 'Записей пока нет', friends: 'У ваших друзей пока нет записей', follows: 'Подпишитесь на людей, чтобы видеть их записи здесь', communities: 'Подпишитесь на сообщества, чтобы видеть их записи' };
      const draw = () => { F.$('#srt', c).hidden = kind === 'recs'; F.posts.mount(feed, () => tag ? F.posts.feed('all', sort).filter(p => tagsOf(p.text).includes(tag)) : F.posts.feed(kind, sort), { empty: tag ? 'Записей с этим тегом пока нет' : empties[kind], recs: kind === 'recs' && !tag }); };
      F.$('#tb', c).addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; kind = b.dataset.k; F.$$('.tab', c).forEach(t => t.classList.toggle('active', t === b)); draw(); });
      F.$('#srt', c).addEventListener('change', e => { sort = e.target.value; draw(); });
      draw(); flashHash();
    });
  }
})(window.Karakuli);
