/* ===================================================================
   Каракули — слой данных на Supabase (PostgreSQL + Auth + Storage + Realtime).

   Как это устроено:
   • F.init()     подключается к Supabase и восстанавливает сессию.
   • F.refresh()  загружает данные в память (F.db()) в том же виде, в каком с ними
                  работает интерфейс: users, posts, communities, albums, photos,
                  messages, notifications.
   • F.save()     вызывается интерфейсом после любого изменения. Слой сам сравнивает
                  память с последним состоянием базы и отправляет в Supabase только
                  разницу (insert / update / delete). Фото из браузера (data:URL)
                  сначала загружаются в Storage.
   • F.flush()    ждёт окончания сохранения (нужно перед переходом на другую страницу).
   • F.live()     realtime-подписки (сообщения, уведомления, заявки), онлайн-статус.
   Защита данных держится на правилах Row Level Security в supabase/schema.sql.
   =================================================================== */
(function (F) {
  'use strict';
  const CFG = window.KARAKULI_CONFIG || {};
  const T_ORDER = ['profiles', 'communities', 'community_members', 'albums', 'posts', 'photos', 'friendships', 'likes', 'comments', 'bookmarks', 'messages', 'notifications'];
  const UPD = { profiles: null, communities: ['name', 'description', 'avatar_url', 'cover_url'], albums: ['name'], friendships: ['status'], messages: ['is_read'], notifications: ['is_read'] };
  const IGNORE_DUP = ['likes', 'community_members', 'bookmarks'];
  const GLYPHS = ['⭐', '✨', '👑', '🎮', '🐱', '📷'];

  let sb = null, session = null, initP = null, loaded = false;
  let DB = { users: {}, posts: [], communities: [], albums: [], photos: [], messages: {}, notifications: [] };
  let last = null, pairMeta = {}, newPairIds = {};
  let dirty = false, syncP = null, refreshP = null, liveOn = false;

  /* ---------- идентификаторы ---------- */
  F.uid = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); (window.crypto || { getRandomValues: a => a.forEach((_, i) => a[i] = Math.random() * 256) }).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  /* ---------- подключение ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  }
  async function loadLib() {
    if (window.supabase && window.supabase.createClient) return;
    const urls = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4', 'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
    for (const u of urls) { try { await loadScript(u); if (window.supabase && window.supabase.createClient) return; } catch (e) { /* пробуем следующий источник */ } }
    throw new Error('Не удалось загрузить библиотеку Supabase. Проверьте интернет-соединение.');
  }
  /** opts.light — только восстановить сессию, без загрузки данных (страницы входа). */
  F.init = function (opts) {
    opts = opts || {};
    if (!initP) initP = (async () => {
      if (!CFG.supabaseUrl || !CFG.supabaseKey) throw new Error('В js/config.js не указаны supabaseUrl и supabaseKey.');
      await loadLib();
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      F.sb = sb;
      const r = await sb.auth.getSession(); session = r.data && r.data.session;
      sb.auth.onAuthStateChange((ev, s) => { session = s; });
    })();
    return initP.then(async () => { if (session && !opts.light && !loaded) await F.refresh(); });
  };
  F.sessionId = () => session ? session.user.id : null;
  F.authUser = () => session ? session.user : null;
  F.db = () => DB;

  /* ---------- загрузка данных ---------- */
  const nice = m => {
    m = String(m || '');
    if (/relation .* does not exist|schema cache|Could not find the table/i.test(m)) return 'В базе нет таблиц. Откройте Supabase → SQL Editor и выполните файл supabase/schema.sql.';
    if (/row-level security|permission denied/i.test(m)) return 'у вас нет прав на это действие';
    if (/foreign key/i.test(m)) return 'связанные данные уже удалены';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'нет соединения с интернетом';
    return m;
  };
  F.niceError = nice;
  const run = async p => { const r = await p; if (r.error) throw new Error(nice(r.error.message)); return r.data || []; };

  async function fetchAll() {
    const me = session.user.id, from = t => sb.from(t).select('*');
    const [profiles, friendships, posts, communities, members, albums, photos, likes, comments, bookmarks, messages, notifications] = await Promise.all([
      run(from('profiles').limit(1000)),
      run(from('friendships').limit(5000)),
      run(from('posts').order('created_at', { ascending: false }).limit(300)),
      run(from('communities').limit(1000)),
      run(from('community_members').limit(10000)),
      run(from('albums').limit(2000)),
      run(from('photos').order('created_at', { ascending: false }).limit(1000)),
      run(from('likes').limit(10000)),
      run(from('comments').order('created_at', { ascending: true }).limit(5000)),
      run(from('bookmarks').eq('user_id', me).order('created_at', { ascending: true }).limit(2000)),
      run(from('messages').or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at', { ascending: false }).limit(2000)),
      run(from('notifications').eq('user_id', me).order('created_at', { ascending: false }).limit(100))
    ]);
    return { profiles, friendships, posts, communities, members, albums, photos, likes, comments, bookmarks, messages, notifications };
  }

  const ts = s => Date.parse(s) || Date.now();
  const pairKey = (a, b) => a < b ? a + '_' + b : b + '_' + a;

  /** Заполняет F.db() данными из базы. Объекты пользователей обновляются «на месте»,
      чтобы страницы, которые держат ссылку на me, не теряли связь. */
  function applyData(d) {
    const me = session.user.id, now = Date.now(), users = DB.users, seen = new Set();
    d.profiles.forEach(p => {
      seen.add(p.id);
      const s = p.settings || {}, def = F.defaultSettings();
      const nu = {
        id: p.id, first: p.first_name || '', last: p.last_name || '', email: p.id === me ? (session.user.email || '') : '',
        status: p.status || '', about: p.about || '', city: p.city || '', birth: p.birth || '', avatar: p.avatar_url || null, cover: p.cover_url || null,
        online: p.id === me || (p.show_online !== false && now - ts(p.last_seen) < 150000), bot: false,
        friends: [], incoming: [], outgoing: [], bookmarks: { posts: [], photos: [], links: [] },
        settings: { theme: s.theme || 'light', accent: s.accent || 'blue', privacy: { profile: p.privacy_profile || 'all', messages: p.privacy_messages || 'all', online: p.show_online !== false }, notify: Object.assign({}, def.notify, s.notify || {}) },
        created: ts(p.created_at)
      };
      if (users[p.id]) { const keep = users[p.id]; Object.keys(keep).forEach(k => delete keep[k]); Object.assign(keep, nu); } else users[p.id] = nu;
    });
    Object.keys(users).forEach(id => { if (!seen.has(id)) delete users[id]; });

    pairMeta = {}; newPairIds = {};
    d.friendships.forEach(f => {
      const a = users[f.requester_id], b = users[f.addressee_id]; if (!a || !b) return;
      pairMeta[pairKey(a.id, b.id)] = { id: f.id, requester: f.requester_id, addressee: f.addressee_id };
      if (f.status === 'accepted') { a.friends.push(b.id); b.friends.push(a.id); } else { a.outgoing.push(b.id); b.incoming.push(a.id); }
    });

    const likesBy = {}, commentsBy = {};
    d.likes.forEach(l => { (likesBy[l.target_type + l.target_id] = likesBy[l.target_type + l.target_id] || []).push(l.user_id); });
    d.comments.forEach(c => { const k = c.target_type + c.target_id; (commentsBy[k] = commentsBy[k] || []).push({ id: c.id, authorId: c.author_id, text: c.body, ts: ts(c.created_at) }); });

    DB.posts = d.posts.map(p => ({ id: p.id, authorId: p.author_id, communityId: p.community_id || null, text: p.body || '', photos: p.photos || [], ts: ts(p.created_at), likes: likesBy['post' + p.id] || [], comments: commentsBy['post' + p.id] || [], repostOf: p.repost_of || null }));
    const mem = {}; d.members.forEach(m => { (mem[m.community_id] = mem[m.community_id] || []).push(m.user_id); });
    DB.communities = d.communities.map(c => ({ id: c.id, name: c.name, desc: c.description || '', emoji: GLYPHS[F.hashStr(c.id) % GLYPHS.length], avatar: c.avatar_url || null, cover: c.cover_url || null, creatorId: c.creator_id, members: mem[c.id] || [], base: 0, created: ts(c.created_at) }));
    DB.albums = d.albums.map(a => ({ id: a.id, ownerId: a.owner_id, name: a.name, ts: ts(a.created_at), system: a.is_system ? 'wall' : false }));
    DB.photos = d.photos.map(p => ({ id: p.id, ownerId: p.owner_id, albumId: p.album_id || null, src: p.url, ts: ts(p.created_at), likes: likesBy['photo' + p.id] || [], comments: commentsBy['photo' + p.id] || [] }));

    const mu = users[me];
    d.bookmarks.forEach(b => {
      if (!mu) return;
      if (b.kind === 'post') mu.bookmarks.posts.push(b.target_id); else if (b.kind === 'photo') mu.bookmarks.photos.push(b.target_id);
      else mu.bookmarks.links.push({ id: b.id, title: b.title || b.url, url: b.url, ts: ts(b.created_at) });
    });
    DB.messages = {};
    d.messages.slice().reverse().forEach(m => {
      const k = F.dkey(m.sender_id, m.recipient_id);
      (DB.messages[k] = DB.messages[k] || []).push({ id: m.id, from: m.sender_id, to: m.recipient_id, text: m.body || '', photo: m.photo_url || null, ts: ts(m.created_at), read: !!m.is_read });
    });
    DB.notifications = d.notifications.map(n => ({ id: n.id, userId: n.user_id, type: n.type, fromId: n.from_id || n.community_id, ts: ts(n.created_at), read: !!n.is_read, link: n.link || '' }));
  }

  F.refresh = function () {
    if (!session) return Promise.resolve();
    if (refreshP) return refreshP;
    refreshP = (async () => {
      try {
        while (syncP) await syncP;
        const data = await fetchAll();
        applyData(data);
        if (!DB.users[session.user.id]) throw new Error('Профиль не найден. Выйдите и зарегистрируйтесь заново.');
        last = toRows(); loaded = true;
      } finally { refreshP = null; }
    })();
    return refreshP;
  };
  F.reload = () => F.refresh().then(() => window.dispatchEvent(new Event('karakuli:update'))).catch(() => { });

  /* ---------- память → строки таблиц ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const iso = t => new Date(t || Date.now()).toISOString();
  const fid = k => pairMeta[k] ? pairMeta[k].id : (newPairIds[k] = newPairIds[k] || F.uid());

  function toRows() {
    const me = session.user.id, R = {}; T_ORDER.forEach(t => { R[t] = new Map(); });
    const put = (t, key, data, extra, where) => R[t].set(key, { data: clone(data), extra: extra || {}, where: where || { id: data.id } });
    const u = DB.users[me];
    if (u) {
      put('profiles', me, { first_name: u.first, last_name: u.last, status: u.status || '', about: u.about || '', city: u.city || '', birth: u.birth || null, avatar_url: u.avatar || null, cover_url: u.cover || null,
        privacy_profile: u.settings.privacy.profile, privacy_messages: u.settings.privacy.messages, show_online: u.settings.privacy.online !== false,
        settings: { theme: u.settings.theme, accent: u.settings.accent, notify: u.settings.notify } }, {}, { id: me });
    }
    DB.communities.forEach(c => {
      put('communities', c.id, { id: c.id, name: c.name, description: c.desc || '', avatar_url: c.avatar || null, cover_url: c.cover || null, creator_id: c.creatorId }, { created_at: iso(c.created) });
      c.members.forEach(m => put('community_members', c.id + ':' + m, { community_id: c.id, user_id: m }, {}, { community_id: c.id, user_id: m }));
    });
    DB.albums.forEach(a => put('albums', a.id, { id: a.id, owner_id: a.ownerId, name: a.name, is_system: !!a.system }, { created_at: iso(a.ts) }));
    const likesAndComments = (type, o) => {
      o.likes.forEach(l => put('likes', type + ':' + o.id + ':' + l, { user_id: l, target_type: type, target_id: o.id }, {}, { user_id: l, target_type: type, target_id: o.id }));
      o.comments.forEach(c => put('comments', c.id, { id: c.id, author_id: c.authorId, target_type: type, target_id: o.id, body: c.text }, { created_at: iso(c.ts) }));
    };
    DB.posts.forEach(p => {
      put('posts', p.id, { id: p.id, author_id: p.authorId, community_id: p.communityId || null, body: p.text || '', photos: p.photos || [], repost_of: p.repostOf || null }, { created_at: iso(p.ts) });
      likesAndComments('post', p);
    });
    DB.photos.forEach(p => {
      put('photos', p.id, { id: p.id, owner_id: p.ownerId, album_id: p.albumId || null, url: p.src }, { created_at: iso(p.ts) });
      likesAndComments('photo', p);
    });
    const done = new Set(), all = Object.values(DB.users);
    all.forEach(x => x.friends.forEach(f => {
      const k = pairKey(x.id, f); if (done.has(k)) return; done.add(k);
      const meta = pairMeta[k], req = meta ? meta.requester : (x.id < f ? x.id : f), adr = meta ? meta.addressee : (req === x.id ? f : x.id);
      put('friendships', k, { id: fid(k), requester_id: req, addressee_id: adr, status: 'accepted' });
    }));
    all.forEach(x => x.outgoing.forEach(o => {
      const k = pairKey(x.id, o); if (done.has(k)) return; done.add(k);
      put('friendships', k, { id: fid(k), requester_id: x.id, addressee_id: o, status: 'pending' });
    }));
    if (u) {
      u.bookmarks.posts.forEach(id => put('bookmarks', 'post:' + id, { user_id: me, kind: 'post', target_id: id }, {}, { user_id: me, kind: 'post', target_id: id }));
      u.bookmarks.photos.forEach(id => put('bookmarks', 'photo:' + id, { user_id: me, kind: 'photo', target_id: id }, {}, { user_id: me, kind: 'photo', target_id: id }));
      u.bookmarks.links.forEach(l => put('bookmarks', 'link:' + l.id, { id: l.id, user_id: me, kind: 'link', url: l.url, title: l.title }, { created_at: iso(l.ts) }));
    }
    Object.values(DB.messages).forEach(arr => arr.forEach(m => put('messages', m.id, { id: m.id, sender_id: m.from, recipient_id: m.to, body: m.text || '', photo_url: m.photo || null, is_read: !!m.read }, { created_at: iso(m.ts) })));
    DB.notifications.forEach(n => {
      const byUser = n.type !== 'community_post';
      put('notifications', n.id, { id: n.id, user_id: n.userId, from_id: byUser ? n.fromId : null, community_id: byUser ? null : n.fromId, type: n.type, link: n.link || '', is_read: !!n.read }, { created_at: iso(n.ts) });
    });
    return R;
  }

  /* ---------- загрузка фото в Storage ---------- */
  const isData = s => typeof s === 'string' && s.startsWith('data:');
  async function upload(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'jpg';
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const r = await sb.storage.from('media').upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
    if (r.error) throw new Error(nice(r.error.message));
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  }
  async function resolveMedia() {
    const jobs = [], add = (obj, key, idx) => { const v = idx == null ? obj[key] : obj[key][idx]; if (isData(v)) jobs.push({ obj, key, idx, v }); };
    const me = DB.users[session.user.id]; if (me) { add(me, 'avatar'); add(me, 'cover'); }
    DB.communities.forEach(c => { add(c, 'avatar'); add(c, 'cover'); });
    DB.posts.forEach(p => (p.photos || []).forEach((_, i) => add(p, 'photos', i)));
    DB.photos.forEach(p => add(p, 'src'));
    Object.values(DB.messages).forEach(a => a.forEach(m => add(m, 'photo')));
    const cache = new Map();
    for (const j of jobs) {
      let url = cache.get(j.v); if (!url) { url = await upload(j.v); cache.set(j.v, url); }
      if (j.idx == null) { if (j.obj[j.key] === j.v) j.obj[j.key] = url; } else if (j.obj[j.key][j.idx] === j.v) j.obj[j.key][j.idx] = url;
    }
  }

  /* ---------- синхронизация: разница → Supabase ---------- */
  function diff(prev, next) {
    const ops = { ins: [], upd: [], del: [] };
    T_ORDER.forEach(t => {
      next[t].forEach((v, k) => {
        const p = prev[t].get(k);
        if (!p) ops.ins.push({ t, k, v });
        else if (JSON.stringify(p.data) !== JSON.stringify(v.data)) ops.upd.push({ t, k, v, p });
      });
      prev[t].forEach((v, k) => { if (!next[t].has(k)) ops.del.push({ t, k, v }); });
    });
    return ops;
  }
  const check = async q => { const r = await q; if (r.error) throw new Error(nice(r.error.message)); return r; };

  async function pushOps(ops) {
    const gone = new Set(ops.del.filter(o => o.t === 'posts' || o.t === 'photos').map(o => o.v.data.id));
    for (const t of T_ORDER.slice().reverse()) {
      let rows = ops.del.filter(o => o.t === t);
      if (t === 'likes' || t === 'comments') rows = rows.filter(o => !gone.has(o.v.data.target_id)); // «сироты» удалять не нужно
      if (!rows.length) continue;
      const w = Object.keys(rows[0].v.where);
      if (w.length === 1) await check(sb.from(t).delete().in(w[0], rows.map(o => o.v.where[w[0]])));
      else for (const o of rows) await check(sb.from(t).delete().match(o.v.where));
    }
    for (const t of T_ORDER) {
      const ins = ops.ins.filter(o => o.t === t);
      if (ins.length && t !== 'profiles') {
        const rows = ins.map(o => Object.assign({}, o.v.data, o.v.extra));
        await check(IGNORE_DUP.includes(t) ? sb.from(t).upsert(rows, { ignoreDuplicates: true }) : sb.from(t).insert(rows));
      }
      for (const o of ops.upd.filter(x => x.t === t)) {
        if (!(t in UPD)) continue;
        const cols = UPD[t], patch = {};
        Object.keys(o.v.data).forEach(c => { if (cols ? cols.includes(c) : !(c in o.v.where)) patch[c] = o.v.data[c]; });
        if (cols) { const same = cols.every(c => JSON.stringify(o.p.data[c]) === JSON.stringify(o.v.data[c])); if (same) continue; }
        await check(sb.from(t).update(patch).match(o.v.where));
      }
    }
  }
  function applyMeta(ops) {
    ops.ins.concat(ops.upd).filter(o => o.t === 'friendships').forEach(o => { pairMeta[o.k] = { id: o.v.data.id, requester: o.v.data.requester_id, addressee: o.v.data.addressee_id }; delete newPairIds[o.k]; });
    ops.del.filter(o => o.t === 'friendships').forEach(o => { delete pairMeta[o.k]; delete newPairIds[o.k]; });
  }

  async function runSync() {
    let failed = false;
    try {
      while (dirty) {
        dirty = false;
        await resolveMedia();
        const next = toRows(), ops = diff(last, next);
        if (ops.ins.length || ops.upd.length || ops.del.length) { await pushOps(ops); applyMeta(ops); }
        last = next;
      }
    } catch (e) {
      failed = true; dirty = false; console.error(e);
      F.toast('Не удалось сохранить: ' + nice(e.message));
    }
    syncP = null;
    if (failed) F.reload();
  }
  /** Вызывается интерфейсом после изменения данных. */
  F.save = () => { dirty = true; if (!syncP) syncP = runSync(); return true; };
  /** Дождаться, пока все изменения будут записаны в базу. */
  F.flush = () => syncP || Promise.resolve();
  window.addEventListener('beforeunload', e => { if (syncP || dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- реальное время, онлайн, выход ---------- */
  F.live = function () {
    const me = F.sessionId(); if (!me || liveOn) return; liveOn = true;
    const ping = () => { Promise.resolve(sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', me)).catch(() => { }); };
    ping(); setInterval(ping, 60000);
    let timer = null;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => F.refresh().then(() => { F.badges(); window.dispatchEvent(new Event('karakuli:update')); }).catch(() => { }), 400); };
    try {
      sb.channel('karakuli-' + me)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'recipient_id=eq.' + me }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: 'addressee_id=eq.' + me }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: 'requester_id=eq.' + me }, bump)
        .subscribe();
    } catch (e) { console.warn('realtime недоступен, обновляем по таймеру', e); }
    setInterval(bump, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) bump(); });
  };
  F.logout = async () => {
    try { await F.flush(); await sb.auth.signOut(); } catch (e) { /* всё равно выходим */ }
    location.href = 'login.html';
  };
  F.deleteAccount = async () => {
    await F.flush();
    const r = await sb.rpc('delete_my_account'); if (r.error) throw new Error(nice(r.error.message));
    try { await sb.auth.signOut(); } catch (e) { /* аккаунт уже удалён */ }
    location.href = 'register.html';
  };
})(window.Karakuli);
