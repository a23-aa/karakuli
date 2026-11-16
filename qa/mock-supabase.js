/* ТЕСТОВАЯ подмена supabase-js для QA-клиента: хранит «базу» в localStorage браузера. На сайт не подключается. */
/* Имитация supabase-js для проверки логики (только для тестов, в проект не входит) */
(() => {
  const KEY = '__mock_sb__';
  const fresh = () => ({ t: {}, users: [], uid: null, resets: [], files: [] });
  const load = () => { let d; try { d = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { d = fresh(); } const o = sessionStorage.getItem('mock_multi') && sessionStorage.getItem('mock_uid'); if (o) d.uid = o; return d; };
  const bc = new BroadcastChannel('mock-rt');
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const uuid = () => crypto.randomUUID();
  const clone = o => JSON.parse(JSON.stringify(o));
  const tb = (d, t) => (d.t[t] = d.t[t] || []);
  const sess = d => { const u = d.users.find(x => x.id === d.uid); return u ? { access_token: 'x', user: { id: u.id, email: u.email, app_metadata: { provider: u.provider } } } : null; };
  const me_ = d => tb(d,'profiles').find(p => p.id === d.uid) || {};
  const isAdm = d => !!me_(d).is_admin;
  const err = m => ({ data: null, error: { message: m } });

  const friends = (d, a, b) => tb(d, 'friendships').some(f => f.status === 'accepted' && ((f.requester_id === a && f.addressee_id === b) || (f.requester_id === b && f.addressee_id === a)));
  const canView = (d, owner, me) => owner === me || ((tb(d, 'profiles').find(p => p.id === owner) || {}).privacy_profile || 'all') === 'all' || friends(d, owner, me);
  const visible = (d, t, r, me) => {
    if (t === 'call_signals') return r.sender_id === me || r.recipient_id === me;
    if (t === 'messages') return r.sender_id === me || r.recipient_id === me;
    if (t === 'notifications') return r.user_id === me;
    if (t === 'bookmarks') return r.user_id === me;
    if (t === 'support_tickets' || t === 'badge_requests') return r.user_id === me || isAdm(d);
    if (t === 'friendships') return r.status === 'accepted' || r.requester_id === me || r.addressee_id === me;
    if (t === 'posts') return !!r.community_id || canView(d, r.author_id, me);
    if (t === 'albums' || t === 'photos') return canView(d, r.owner_id, me);
    return true;
  };
  const PK = { follows: ['follower_id', 'followee_id'], likes: ['user_id', 'target_type', 'target_id'], community_members: ['community_id', 'user_id'] };
  const allow = (d, op, t, r, me, old) => {
    if (op !== 'insert' && isAdm(d) && ['posts','comments','communities','photos'].includes(t)) return true;
    if (op === 'insert' && me_(d).banned && ['posts','comments','messages','likes','friendships','communities','community_members','photos','albums','follows'].includes(t)) return false;
    switch (t) {
      case 'call_signals': return op === 'insert' ? r.sender_id === me && r.recipient_id !== me : (r.sender_id === me || r.recipient_id === me);
      case 'profiles': return op === 'update' && r.id === me;
      case 'friendships': return op === 'insert' ? r.requester_id === me && r.status === 'pending' : op === 'update' ? r.addressee_id === me : (r.requester_id === me || r.addressee_id === me);
      case 'communities': return r.creator_id === me;
      case 'community_members': return r.user_id === me;
      case 'posts': if (op === 'insert') return r.author_id === me && (!r.community_id || tb(d, 'community_members').some(m => m.community_id === r.community_id && m.user_id === me));
        return r.author_id === me || (!!r.community_id && (tb(d, 'communities').find(c => c.id === r.community_id) || {}).creator_id === me);
      case 'albums': case 'photos': return r.owner_id === me;
      case 'follows': return r.follower_id === me;
      case 'events': return isAdm(d);
      case 'likes': case 'bookmarks': return r.user_id === me;
      case 'comments': if (op === 'insert') return r.author_id === me;
        return r.author_id === me || (r.target_type === 'post' && (tb(d, 'posts').find(p => p.id === r.target_id) || {}).author_id === me) || (r.target_type === 'photo' && (tb(d, 'photos').find(p => p.id === r.target_id) || {}).owner_id === me);
      case 'messages': if (op === 'insert') { const pr = (tb(d, 'profiles').find(p => p.id === r.recipient_id) || {}).privacy_messages || 'all'; return r.sender_id === me && (pr === 'all' || friends(d, me, r.recipient_id)); }
        return op === 'delete' ? r.sender_id === me : r.recipient_id === me;
      case 'support_tickets': return op === 'insert' ? r.user_id === me : isAdm(d);
      case 'badge_requests': return op === 'insert' ? r.user_id === me : isAdm(d);
      case 'notifications': return op === 'insert' ? r.user_id !== me && (r.from_id === me || !r.from_id) : r.user_id === me;
    }
    return false;
  };
  const fkOk = (d, t, r) => {
    const has = (tbl, id) => tb(d, tbl).some(x => x.id === id);
    const need = { posts: [['author_id', 'profiles'], ['community_id', 'communities']], photos: [['owner_id', 'profiles'], ['album_id', 'albums']], messages: [['sender_id', 'profiles'], ['recipient_id', 'profiles']], friendships: [['requester_id', 'profiles'], ['addressee_id', 'profiles']], community_members: [['community_id', 'communities'], ['user_id', 'profiles']], albums: [['owner_id', 'profiles']], communities: [['creator_id', 'profiles']] }[t] || [];
    return need.every(([c, tbl]) => r[c] == null || has(tbl, r[c]));
  };
  const CHECK = { posts: r => (r.body || '') !== '' || (r.photos || []).length || r.repost_of, messages: r => (r.body || '') !== '' || r.photo_url };

  class Q {
    constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.ord = null; this.lim = null; }
    select() { return this; }
    insert(r) { this.op = 'insert'; this.rows = [].concat(r); return this; }
    upsert(r, o) { this.op = 'upsert'; this.rows = [].concat(r); this.o = o || {}; return this; }
    update(p) { this.op = 'update'; this.patch = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push(r => r[c] === v); return this; }
    gte(c, v) { this.f.push(r => r[c] >= v); return this; }
    lte(c, v) { this.f.push(r => r[c] <= v); return this; }
    in(c, a) { this.f.push(r => a.includes(r[c])); return this; }
    match(o) { Object.keys(o).forEach(k => this.eq(k, o[k])); return this; }
    or(s) { const ps = s.split(',').map(x => { const [c, , ...v] = x.split('.'); return r => r[c] === v.join('.'); }); this.f.push(r => ps.some(p => p(r))); return this; }
    order(c, o) { this.ord = [c, !(o && o.ascending === false)]; return this; }
    limit(n) { this.lim = n; return this; }
    then(res, rej) { return new Promise(r => setTimeout(r, 3)).then(() => this.exec()).then(res, rej); }
    exec() {
      const d = load(), me = d.uid, t = this.t, rows = tb(d, t);
      if (!me) return err('JWT: not authenticated');
      const match = r => this.f.every(f => f(r));
      if (this.op === 'select') {
        let out = rows.filter(r => visible(d, t, r, me) && match(r));
        if (this.ord) { const [c, asc] = this.ord; out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
        if (this.lim != null) out = out.slice(0, this.lim);
        return { data: clone(out), error: null };
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        for (const raw of this.rows) {
          const r = Object.assign({ created_at: new Date().toISOString() }, t === 'badge_requests' ? { status: 'pending' } : t === 'support_tickets' ? { status: 'open' } : {}, clone(raw));
          if (!('id' in r) && !PK[t] && t !== 'bookmarks') r.id = uuid();
          if (t === 'bookmarks' && !r.id) r.id = uuid();
          if (!allow(d, 'insert', t, r, me)) return err('new row violates row-level security policy for table "' + t + '"');
          if (CHECK[t] && !CHECK[t](r)) return err('new row for relation "' + t + '" violates check constraint');
          if (!fkOk(d, t, r)) return err('insert or update on table "' + t + '" violates foreign key constraint');
          const dup = rows.some(x => PK[t] ? PK[t].every(c => x[c] === r[c]) : t === 'bookmarks' && r.target_id ? (x.user_id === r.user_id && x.kind === r.kind && x.target_id === r.target_id) : x.id === r.id)
            || (t === 'friendships' && rows.some(x => [x.requester_id, x.addressee_id].sort().join() === [r.requester_id, r.addressee_id].sort().join()));
          if (dup) { if (this.op === 'upsert' && this.o.ignoreDuplicates) continue; return err('duplicate key value violates unique constraint'); }
          rows.push(r); bc.postMessage({ t, row: clone(r) });
        }
        save(d); return { data: null, error: null };
      }
      if (this.op === 'update') {
        const cols = Object.keys(this.patch);
        if (t === 'profiles' && cols.some(c => ['badge','is_admin','banned','ban_reason'].includes(c))) return err('permission denied for table profiles');
        if (t === 'profiles' && cols.includes('username') && tb(d,'profiles').some(x => x.username === this.patch.username && x.id !== me)) return err('duplicate key value violates unique constraint "profiles_username_uq"');
        if (t === 'messages' && cols.some(c => c !== 'is_read')) return err('permission denied for table messages');
        if (t === 'notifications' && cols.some(c => c !== 'is_read')) return err('permission denied for table notifications');
        let n = 0;
        rows.filter(r => visible(d, t, r, me) && match(r)).forEach(r => { if (allow(d, 'update', t, r, me)) { Object.assign(r, clone(this.patch)); n++; } });
        save(d); return { data: null, error: null, count: n };
      }
      if (this.op === 'delete') {
        d.t[t] = rows.filter(r => !(visible(d, t, r, me) && match(r) && allow(d, 'delete', t, r, me)));
        save(d); return { data: null, error: null };
      }
    }
  }

  const mkProfile = (u) => {
    const m = u.meta || {}; let f = m.first_name || m.given_name, l = m.last_name || m.family_name;
    if (!f) { const full = m.full_name || m.name || (u.email || '').split('@')[0]; f = full.split(' ')[0]; l = full.split(' ').slice(1).join(' '); }
    return { id: u.id, first_name: f || '', last_name: l || '', status: '', about: '', city: '', birth: null, avatar_url: m.avatar_url || m.picture || null, cover_url: null, privacy_profile: 'all', privacy_messages: 'all', show_online: true, username: (/^[a-z][a-z0-9_]{1,31}$/.test((m.username||'').toLowerCase()) && !tb(load(),'profiles').some(x=>x.username===(m.username||'').toLowerCase()) ? m.username.toLowerCase() : null), badge: null, is_admin: false, banned: false, ban_reason: '',
      settings: { theme: 'light', accent: 'blue', notify: {} }, last_seen: new Date().toISOString(), created_at: new Date().toISOString() };
  };
  const createUser = (d, email, password, meta, provider) => { const u = { id: uuid(), email, password, meta, provider }; d.users.push(u); tb(d, 'profiles').push(mkProfile(u)); return u; };

  const auth = {
    async getSession() { return { data: { session: sess(load()) } }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() { } } } }; },
    async signUp({ email, phone, password, options }) {
      const d = load(); if (d.users.some(u => (email && u.email === email) || (phone && u.phone === phone))) return err('User already registered');
      if (password.length < 6) return err('Password should be at least 6 characters');
      const u = createUser(d, email || null, password, (options || {}).data || {}, phone ? 'phone' : 'email'); u.phone = phone || null;
      if (localStorage.getItem('mock_confirm')) { d.pending = { id: u.id, code: '123456' }; d.uid = null; save(d); return { data: { user: { id: u.id, identities: [{}] }, session: null }, error: null }; }
      d.uid = u.id; if (sessionStorage.getItem('mock_multi')) sessionStorage.setItem('mock_uid', u.id); save(d);
      return { data: { user: { id: u.id, identities: [{}] }, session: sess(d) }, error: null };
    },
    async verifyOtp({ email, phone, token, type }) {
      const d = load(); if (!d.pending || token !== d.pending.code) return err('Token has expired or is invalid');
      const u = d.users.find(x => x.id === d.pending.id); if (!u || (email && u.email !== email) || (phone && u.phone !== phone)) return err('Token has expired or is invalid');
      d.uid = u.id; d.pending = null; if (sessionStorage.getItem('mock_multi')) sessionStorage.setItem('mock_uid', u.id); save(d); return { data: { session: sess(d), user: { id: u.id } }, error: null };
    },
    async resend() { const d = load(); d.resent = (d.resent || 0) + 1; save(d); return { data: {}, error: null }; },
    async signInWithPassword({ email, phone, password }) {
      const d = load(), u = d.users.find(x => ((email && x.email === email) || (phone && x.phone === phone)) && x.password === password);
      if (!u) return err('Invalid login credentials'); d.uid = u.id; if (sessionStorage.getItem('mock_multi')) sessionStorage.setItem('mock_uid', u.id); save(d); return { data: { session: sess(d) }, error: null };
    },
    async signInWithOAuth({ provider, options }) {
      const d = load(); let u = d.users.find(x => x.provider === provider);
      if (!u) u = createUser(d, provider + '.user@example.com', null, { name: 'Гугл Пользователь', picture: 'https://mock.supabase.co/ava.png' }, provider);
      d.uid = u.id; save(d); location.href = options.redirectTo; return { data: {}, error: null };
    },
    async signOut() { const d = load(); d.uid = null; sessionStorage.removeItem('mock_uid'); save(d); return { error: null }; },
    async updateUser(p) { const d = load(), u = d.users.find(x => x.id === d.uid); if (!u) return err('not authenticated'); if (p.password) u.password = p.password; if (p.email) d.pendingEmail = p.email; save(d); return { data: {}, error: null }; },
    async resetPasswordForEmail(email, o) { const d = load(); d.resets.push({ email, redirectTo: o.redirectTo }); save(d); return { data: {}, error: null }; }
  };
  const client = {
    auth, from: t => new Q(t),
    storage: { from: () => ({
      async upload(path, blob, o) { const d = load(); d.files.push({ path, type: blob.type, size: blob.size }); save(d); return { data: { path }, error: null }; },
      getPublicUrl: p => ({ data: { publicUrl: 'https://mock.supabase.co/storage/v1/object/public/media/' + p } }) }) },
    async rpc(name, a) {
      a = a || {}; const d = load(), id = d.uid, P = tb(d, 'profiles');
      if (name === 'server_time') return { data: new Date().toISOString(), error: null };
      if (name === 'username_available') { const u = String(a.u || '').toLowerCase(); return { data: /^[a-z][a-z0-9_]{1,31}$/.test(u) && !['admin','support','karakuli'].includes(u) && !P.some(p => p.username === u), error: null }; }
      if (!id) return err('not authenticated');
      if (name === 'post_seen') { const seen = tb(d, 'post_views'); (a.ids || []).forEach(pid => { if (!seen.some(v => v.post_id === pid && v.user_id === id)) { seen.push({ post_id: pid, user_id: id }); const p = tb(d, 'posts').find(x => x.id === pid); if (p) p.views = (p.views || 0) + 1; } }); save(d); return { data: null, error: null }; }
      if (name === 'admin_review_badge') { if (!isAdm(d)) return err('у вас нет прав на это действие'); const q = tb(d, 'badge_requests').find(x => x.id === a.req && x.status === 'pending'); if (q) { q.status = a.approve ? 'approved' : 'rejected'; if (a.approve) { const t = P.find(x => x.id === q.user_id); if (t) t.badge = q.badge; } save(d); } return { data: null, error: null }; }
      if (name === 'delete_my_account') { d.users = d.users.filter(u => u.id !== id); d.uid = null; Object.keys(d.t).forEach(t => { d.t[t] = d.t[t].filter(r => !Object.values(r).includes(id)); }); save(d); return { data: null, error: null }; }
      if (name.startsWith('admin_')) {
        if (!isAdm(d)) return err('forbidden');
        const t = P.find(p => p.id === a.uid);
        if (name === 'admin_stats') { const day = Date.now() - 864e5; return { data: { users: P.length, online: P.filter(p => Date.now() - Date.parse(p.last_seen) < 150000).length, online_hour: P.length, online_day: P.length, new_today: P.length, new_week: P.length, posts: tb(d,'posts').length, comments: tb(d,'comments').length, messages: tb(d,'messages').length, photos: tb(d,'photos').length, likes: tb(d,'likes').length, communities: tb(d,'communities').length, friendships: tb(d,'friendships').length, banned: P.filter(p => p.banned).length, verified: P.filter(p => p.badge === 'verified').length, blogger: P.filter(p => p.badge === 'blogger').length, signups: Array.from({length: 14}, (_, i) => ({ d: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10), n: i === 13 ? P.length : 0 })) }, error: null }; }
        if (name === 'admin_set_badge') { if (t && t.badge !== 'owner') t.badge = a.b || null; }
        if (name === 'admin_set_ban') { if (t && !t.is_admin) { t.banned = a.flag; t.ban_reason = a.flag ? (a.reason || '') : ''; } }
        if (name === 'admin_clear_username') { if (t && !t.is_admin) t.username = null; }
        if (name === 'admin_delete_user') { if (t && !t.is_admin) { d.users = d.users.filter(u => u.id !== t.id); Object.keys(d.t).forEach(k => { d.t[k] = d.t[k].filter(r => !Object.values(r).includes(t.id)); }); } }
        save(d); return { data: null, error: null };
      }

      if (name === 'push_register') { (d.push = d.push || []).push(a); save(d); return { data: null, error: null }; }
      if (name === 'push_unregister') { d.push = (d.push||[]).filter(x => x.p_endpoint !== a.p_endpoint); save(d); return { data: null, error: null }; }
      if (name.startsWith('pb_')) {
        const E = tb(d,'events'), PL = tb(d,'pb_players'), PX = tb(d,'pb_pixels'), ev = E.find(e => e.id === a.p_ev), now = Date.now();
        const scores = () => { const mode = (ev.config||{}).mode || 'team_war', cells = {}, px = [0,0]; PX.filter(p => p.e === ev.id).forEach(p => { const c = Math.floor(p.y/50)*20+Math.floor(p.x/50); (cells[c] = cells[c] || [0,0])[p.team]++; px[p.team]++; });
          let s = px.slice(), z = [0,0]; Object.values(cells).forEach(c => { if (c[0] > c[1]) z[0]++; else if (c[1] > c[0]) z[1]++; });
          if (mode === 'territory_rush') s = z; const own = {}; PX.filter(p => p.e === ev.id).forEach(p => { own[p.u] = (own[p.u]||0)+1; }); const top = Object.entries(own).sort((x,y)=>y[1]-x[1]).slice(0,5).map(([u,n]) => { const q = P.find(x=>x.id===u)||{}; return { id: u, name: ((q.first_name||q.first||'')+' '+(q.last_name||q.last||'')).trim()||'Игрок', owned: n }; }); return { mode, s, pixels: px, zones: z, top }; };
        const players = () => [PL.filter(p => p.event_id === ev.id && p.team === 0).length, PL.filter(p => p.event_id === ev.id && p.team === 1).length];
        const fin = () => { if (ev.finalized || now < Date.parse(ev.ends_at)) return; const sc = scores(); ev.finalized = true; const tp = sc.top[0]; ev.result = Object.assign(sc, { winner_user: (ev.config||{}).mode==='solo' && tp ? tp.id : undefined, winner_name: (ev.config||{}).mode==='solo' && tp ? tp.name : undefined, winner_owned: tp && tp.owned, winner: sc.s[0] > sc.s[1] ? 0 : sc.s[1] > sc.s[0] ? 1 : null, players: players() }); save(d); };
        const pack = since => PX.filter(p => p.e === ev.id && p.seq > since).sort((x,y) => x.seq-y.seq).map(p => ((p.y*1000+p.x)*16+p.color)*2+p.team);
        const maxseq = since => Math.max(since || 0, ...PX.filter(p => p.e === ev.id).map(p => p.seq));
        const me = PL.find(p => p.event_id === a.p_ev && p.user_id === id);
        if (name === 'pb_leaderboard') { const o = {}; PL.filter(p => !a.p_ev || p.event_id === a.p_ev).forEach(p => { const u = P.find(x => x.id === p.user_id) || {}; const r = o[p.user_id] = o[p.user_id] || { user_id: p.user_id, first_name: u.first_name || u.first || 'Игрок', last_name: u.last_name || u.last || '', placed: 0, wins: 0, battles: 0 }; r.placed += p.placed; r.battles++; }); return { data: Object.values(o).sort((x,y) => y.placed - x.placed), error: null }; }
        if (!ev) return err('ивент не найден');
        if (name === 'pb_join') { if (!me) { const n = players(); const team = (ev.config||{}).mode === 'solo' ? 0 : n[0] < n[1] ? 0 : n[1] < n[0] ? 1 : 0; PL.push({ event_id: ev.id, user_id: id, team, placed: 0, last_at: null }); save(d); return { data: { team }, error: null }; } return { data: { team: me.team }, error: null }; }
        if (name === 'pb_state') { fin(); return { data: { now: new Date().toISOString(), event: ev, team: me ? me.team : null, last_at: me && me.last_at, placed: me ? me.placed : 0, owned: PX.filter(p => p.e === ev.id && p.u === id).length, scores: scores(), players: players(), pixels: pack(0), seq: maxseq(0) < 0 ? 0 : (PX.some(p => p.e === ev.id) ? maxseq(0) : 0) }, error: null }; }
        if (name === 'pb_poll') { fin(); return { data: { now: new Date().toISOString(), ends_at: ev.ends_at, finalized: !!ev.finalized, result: ev.result || null, placed: me ? me.placed : 0, owned: PX.filter(p => p.e === ev.id && p.u === id).length, scores: scores(), players: players(), pixels: pack(a.p_since || 0), seq: PX.some(p => p.e === ev.id) ? maxseq(a.p_since) : (a.p_since || 0) }, error: null }; }
        if (name === 'pb_place') {
          if (a.p_x < 0 || a.p_x > 999 || a.p_y < 0 || a.p_y > 999) return err('за пределами поля'); if (a.p_color < 0 || a.p_color > 15) return err('неизвестный цвет');
          if (now < Date.parse(ev.starts_at) || now >= Date.parse(ev.ends_at)) return err('ивент сейчас не идёт'); if (!me) return err('сначала вступите в команду');
          const cdn = ((ev.config||{}).cooldown ?? 30) * 1000; if (me.last_at && Date.parse(me.last_at) + cdn > now) return { data: { ok: false, wait_ms: Date.parse(me.last_at) + cdn - now }, error: null };
          d.seq = (d.seq || 0) + 1; const old = PX.find(p => p.e === ev.id && p.x === a.p_x && p.y === a.p_y); if (old) Object.assign(old, { u: id, color: a.p_color, team: me.team, seq: d.seq }); else PX.push({ e: ev.id, u: id, x: a.p_x, y: a.p_y, color: a.p_color, team: me.team, seq: d.seq });
          me.placed++; me.last_at = new Date().toISOString(); save(d); return { data: { ok: true, seq: d.seq, wait_ms: cdn }, error: null };
        }
        return err('no function');
      }
      return err('no function');
    },
    channel() { const ls = []; const c = { on(kind, cfg, cb) { if (kind === 'postgres_changes') ls.push([cfg, cb]); return c; }, subscribe() { bc.addEventListener('message', ev => { const { t, row } = ev.data; ls.forEach(([cfg, cb]) => { if (cfg.table !== t) return; if (cfg.filter) { const m = cfg.filter.match(/^(\w+)=eq\.(.+)$/); if (m && String(row[m[1]]) !== m[2]) return; } cb({ new: row, eventType: 'INSERT' }); }); }); return c; } }; return c; }
  };
  window.supabase = { createClient: () => client };
})();
