/* ===================================================================
   Каракули — ядро: данные (LocalStorage), демо-наполнение, графика,
   оболочка (меню, поиск), общие компоненты (модалки, тосты, лайтбокс).

   Слой данных изолирован в F.db()/F.save() и функциях-операциях
   (sendRequest, sendMessage, notify...). Чтобы подключить backend,
   достаточно заменить их реализацию на fetch()/WebSocket.
   =================================================================== */
(function () {
  'use strict';
  const F = window.Karakuli = {};
  const DB_KEY = 'karakuli_db_v1', SESSION_KEY = 'karakuli_session_v1', PREFS_KEY = 'karakuli_prefs_v1';

  /* ---------- утилиты ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  F.$ = $; F.$$ = $$;
  F.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  F.uid = p => (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  F.plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; if (n > 10 && n < 20) return c; if (m > 1 && m < 5) return b; if (m === 1) return a; return c; };
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const pad = n => String(n).padStart(2, '0');
  F.fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  F.fmtDate = ts => { const d = new Date(ts); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  F.fmtBirth = iso => { if (!iso) return ''; const p = iso.split('-'); if (p.length < 3) return iso; return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; };
  F.timeAgo = ts => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    const d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'сегодня в ' + F.fmtTime(ts);
    if (d.toDateString() === new Date(n - 86400000).toDateString()) return 'вчера в ' + F.fmtTime(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '') + ' в ' + F.fmtTime(ts);
  };
  F.shortTime = ts => {
    const d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return F.fmtTime(ts);
    if (d.toDateString() === new Date(n - 86400000).toDateString()) return 'вчера';
    return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
  };
  F.fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1000 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n);
  F.hashPass = s => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  };
  F.passHash = (email, pass) => F.hashPass(String(email).toLowerCase() + ':' + pass);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  F.pick = pick;

  /* ---------- иконки (рисованные, линейные) ---------- */
  const IC = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    comment: '<path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>',
    repost: '<path d="M4 12v-1a4 4 0 0 1 4-4h11m0 0-3-3m3 3-3 3M20 12v1a4 4 0 0 1-4 4H5m0 0 3 3m-3-3 3-3"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
    bookmark: '<path d="M6 4h12v16l-6-4-6 4z"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
    news: '<path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5"/>',
    chat: '<path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>',
    friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5 M16 4.8a3 3 0 0 1 0 5.6 M18 14.8c2 .7 3.5 2.3 3.5 5.2"/>',
    groups: '<circle cx="12" cy="8" r="3"/><path d="M7 20c0-3 2-5 5-5s5 2 5 5 M5 9.5a2.5 2.5 0 1 0 .5 4.5 M19 9.5a2.5 2.5 0 1 1-.5 4.5"/>',
    photo: '<path d="M4 7h4l2-2.5h4L16 7h4v12H4z"/><circle cx="12" cy="13" r="3.6"/>',
    settings: '<path d="M4 7h9 M17 7h3 M4 17h3 M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
    send: '<path d="M4 12L20 4l-5 16-3-7z M12 13l8-9"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13"/>',
    edit: '<path d="M4 20l1-4L16 5l3 3L8 19z M14 7l3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    logout: '<path d="M10 4H5v16h5 M14 8l4 4-4 4 M18 12H9"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    smile: '<circle cx="12" cy="12" r="8"/><path d="M9 14c1.5 2 4.5 2 6 0 M9.5 10h.01 M14.5 10h.01"/>'
  };
  F.ic = (n, s) => `<svg class="ic" viewBox="0 0 24 24" width="${s || 20}" height="${s || 20}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  F.logoMark = (w) => `<svg viewBox="0 0 40 40" width="${w || 40}" height="${w || 40}" filter="url(#scribble)" aria-hidden="true"><path d="M5 11Q5 5 11 5H29Q35 5 35 11V23Q35 29 29 29H21L13 36V29H11Q5 29 5 23Z" fill="#dfe6ff" stroke="#1d2a5c" stroke-width="2.6" stroke-linejoin="round"/><path d="M10 19q2.500-8 5 0t5 0t5 0t5 0" fill="none" stroke="#6c85ff" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 1.500l1.500 3.300 3.300 1.500-3.300 1.500L34 11l-1.500-3.200L29.200 6.300l3.300-1.500z" fill="#ffd27f" stroke="#1d2a5c" stroke-width="1.400" stroke-linejoin="round"/></svg>`;
  F.logoHTML = () => `<a class="logo" href="index.html">${F.logoMark()}Каракули</a>`;

  /* ---------- процедурная графика: аватары и фотографии ---------- */
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const svgURI = svg => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  F.hashStr = hashStr;

  const INK = '#1d2a5c';
  const roughF = (id, f, s) => `<filter id="${id}" x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${s}"/></filter>`;
  const sparkle = (x, y, k, fill) => `<path d="M${x} ${y - k}Q${x + k * .2} ${y - k * .2} ${x + k} ${y}Q${x + k * .2} ${y + k * .2} ${x} ${y + k}Q${x - k * .2} ${y + k * .2} ${x - k} ${y}Q${x - k * .2} ${y - k * .2} ${x} ${y - k}Z" fill="${fill || '#fff'}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const GRAIN = (w, h, op) => `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .16  0 0 0 0 .4  0 0 0 .55 0"/></filter><rect width="${w}" height="${h}" filter="url(#g)" opacity="${op}"/>`;

  F.avatarFor = function (seed) {
    const r = rng(hashStr(String(seed)));
    const h = Math.floor(r() * 360);
    const skin = ['#ffe3d1', '#f8d3b9', '#efc0a0', '#d9a47f'][Math.floor(r() * 4)];
    const hair = ['#2b2d5b', '#5b3b2b', '#c9784a', '#242424', '#8a5cf0', '#e58fb5', '#3a6fd8'][Math.floor(r() * 7)];
    const shirt = ['#6c85ff', '#b8a6ff', '#ff9fbb', '#7fd8c0', '#ffd27f'][Math.floor(r() * 5)];
    const iris = ['#4f69e6', '#7c63ec', '#2ea88c', '#b5651d', '#d9507a'][Math.floor(r() * 5)];
    const style = Math.floor(r() * 4);
    const st = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
    let back = '', front = '';
    if (style === 0) front = `<path d="M27 50C22 20 78 20 73 50C67 40 58 34 50 34C42 34 33 40 27 50Z" fill="${hair}" ${st}/><path d="M38 28Q50 22 62 28" fill="none" stroke="#fff" stroke-width="2.4" opacity=".5" stroke-linecap="round"/>`;
    else if (style === 1) { back = `<path d="M24 52C20 14 80 14 76 52L77 76L23 76Z" fill="${hair}" ${st}/>`; front = `<path d="M28 48C30 28 70 28 72 48C62 41 53 36 50 36C46 36 37 41 28 48Z" fill="${hair}" ${st}/><path d="M36 28Q50 21 64 28" fill="none" stroke="#fff" stroke-width="2.4" opacity=".5" stroke-linecap="round"/>`; }
    else if (style === 2) front = `<circle cx="50" cy="20" r="8" fill="${hair}" ${st}/><path d="M27 50C22 20 78 20 73 50C70 40 62 31 50 31C38 31 30 40 27 50Z" fill="${hair}" ${st}/>`;
    else front = `<path d="M27 47C24 22 76 22 73 47C66 43 59 34 50 37C44 39 36 45 27 47Z" fill="${hair}" ${st}/><path d="M27 47L24 64 32 54Z M73 47L76 64 68 54Z" fill="${hair}" ${st}/>`;
    const eye = x => `<ellipse cx="${x}" cy="52" rx="4.6" ry="5.8" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="${x}" cy="53" rx="3.3" ry="4.4" fill="${iris}"/><circle cx="${x}" cy="53.5" r="1.8" fill="${INK}"/><circle cx="${x - 1.3}" cy="50.8" r="1.5" fill="#fff"/><path d="M${x - 5.5} 47.5Q${x} 45 ${x + 5.5} 47.5" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 85% 90%)"/><stop offset="1" stop-color="hsl(${(h + 45) % 360} 80% 78%)"/></linearGradient>${roughF('r', .045, 2.4)}</defs><rect width="100" height="100" fill="url(#b)"/>${sparkle(14 + r() * 12, 14 + r() * 10, 5)}${sparkle(80 + r() * 10, 18 + r() * 12, 3.6, '#fff6c8')}<g filter="url(#r)">${back}<path d="M15 102C15 79 33 71 50 71S85 79 85 102Z" fill="${shirt}" ${st}/><path d="M42 74Q50 82 58 74" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><rect x="44" y="60" width="12" height="15" rx="5" fill="${skin}" ${st}/><ellipse cx="50" cy="49" rx="21" ry="22" fill="${skin}" ${st}/>${eye(41)}${eye(59)}<path d="M36 59l3 -1 M37.5 61.5l3 -1 M64 58l-3 -1 M62.5 61.5l-3 -1" stroke="#ff7f9f" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M45 61Q50 66 55 61" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>${front}</g></svg>`;
    return svgURI(svg);
  };
  /* рисованные значки сообществ */
  const GLYPH = {
    '👑': '<path d="M24 68L20 34L38 50L50 28L62 50L80 34L76 68Z"/><path d="M25 77H75"/><circle cx="20" cy="32" r="3"/><circle cx="50" cy="26" r="3"/><circle cx="80" cy="32" r="3"/>',
    '🎮': '<rect x="16" y="36" width="68" height="36" rx="18"/><path d="M34 47V61M27 54H41"/><circle cx="64" cy="50" r="3.4"/><circle cx="73" cy="58" r="3.4"/>',
    '✨': '<path d="M46 20Q50 44 74 48Q50 52 46 76Q42 52 18 48Q42 44 46 20Z"/><path d="M74 18Q76 28 84 30Q76 32 74 42Q72 32 64 30Q72 28 74 18Z"/>',
    '🐱': 'CAT',
    '📷': '<path d="M16 34H32L38 26H62L68 34H84V74H16Z"/><circle cx="50" cy="53" r="14"/><circle cx="50" cy="53" r="5"/>',
    '⭐': '<path d="M50 18L60 40L84 43L66 59L71 83L50 71L29 83L34 59L16 43L40 40Z"/>'
  };
  const catHead = (x, y, k, fur) => `<g transform="translate(${x} ${y}) scale(${k})" fill="${fur}" stroke="${INK}" stroke-width="${3 / k}" stroke-linejoin="round" stroke-linecap="round"><path d="M-34 -12L-30 -46L-8 -30Z M34 -12L30 -46L8 -30Z"/><ellipse cx="0" cy="0" rx="40" ry="34"/><path d="M-30 -36L-26 -28 M30 -36L26 -28" fill="none"/><ellipse cx="-14" cy="-3" rx="5" ry="7" fill="#fff"/><ellipse cx="14" cy="-3" rx="5" ry="7" fill="#fff"/><circle cx="-14" cy="-1" r="3" fill="${INK}"/><circle cx="14" cy="-1" r="3" fill="${INK}"/><path d="M-4 10L4 10L0 15Z" fill="#ff8fa8"/><path d="M0 15Q-6 22 -12 18 M0 15Q6 22 12 18" fill="none"/><path d="M-44 6L-24 10 M-44 16L-24 14 M44 6L24 10 M44 16L24 14" fill="none" stroke-width="${2 / k}"/></g>`;
  F.communityIcon = function (emoji, seed) {
    const h = hashStr(String(seed)) % 360, g = GLYPH[emoji] || GLYPH['⭐'];
    const inner = g === 'CAT' ? catHead(50, 54, .72, '#ffc98a') : `<g fill="#fff" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${g}</g>`;
    return svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 75% 62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 75% 75%)"/></linearGradient>${roughF('r', .05, 2.4)}</defs><rect width="100" height="100" fill="url(#b)"/>${sparkle(84, 16, 5)}${sparkle(14, 84, 3.4, '#fff6c8')}<g filter="url(#r)">${inner}</g></svg>`);
  };
  const sceneCache = {};
  function cloudPath(x, y, k) {
    return `<path d="M${x - k} ${y}q-${k * .05} -${k * .3} ${k * .3} -${k * .32}q${k * .12} -${k * .35} ${k * .5} -${k * .2}q${k * .3} -${k * .25} ${k * .55} .05q${k * .45} -${k * .02} ${k * .5} ${k * .3}q${k * .12} ${k * .2} -${k * .1} ${k * .2}Z" fill="#fff" fill-opacity=".92" stroke="${INK}" stroke-opacity=".6" stroke-width="2.6" stroke-linejoin="round"/>`;
  }
  const clouds = (r, n, w, h) => Array.from({ length: n }, () => cloudPath(40 + r() * (w - 80), 50 + r() * h * .35, 38 + r() * 34)).join('');
  function hills(r, w, h, cols) {
    return cols.map((c, i) => {
      const y = h * (.6 + i * .1); let d = `M-10 ${h + 10}L-10 ${y}`;
      for (let x = -10; x < w + 10; x += 100) d += `Q${x + 50} ${y - 20 - r() * 45} ${x + 100} ${y + (r() - .5) * 30}`;
      let hatch = ''; for (let j = 0; j < 14; j++) { const hx = r() * w, hy = y + 10 + r() * (h - y - 12); hatch += `M${hx} ${hy}l10 -9`; }
      return `<path d="${d}L${w + 10} ${h + 10}Z" fill="${c}" stroke="${INK}" stroke-opacity=".55" stroke-width="2.8" stroke-linejoin="round"/><path d="${hatch}" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    }).join('');
  }
  F.scene = function (kind, seed) {
    const key = kind + '|' + seed;
    if (sceneCache[key]) return sceneCache[key];
    const r = rng(hashStr(key)), W = 600, H = 400;
    const grad = (a, b, c) => `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/>${c ? `<stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>` : `<stop offset="1" stop-color="${b}"/>`}</linearGradient>${roughF('r', .02, 5)}</defs><rect width="${W}" height="${H}" fill="url(#s)"/>`;
    const sun = (x, y, rad, col) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${col}" stroke="${INK}" stroke-opacity=".5" stroke-width="2.6"/>`;
    let body = '';
    if (kind === 'night') {
      body = grad('#161b4a', '#4a4fa8') + Array.from({ length: 22 }, () => sparkle(r() * W, r() * 210, 4 + r() * 7, '#fff6c8')).join('') + sun(380 + r() * 150, 80 + r() * 40, 32, '#fff6d6') + hills(r, W, H, ['#323a8f', '#232a70', '#161b4d']);
    } else if (kind === 'meadow') {
      body = grad('#bfe0ff', '#eaf4ff') + clouds(r, 4, W, H) + hills(r, W, H, ['#a6e0a0', '#80cb8e', '#5db37c']) +
        Array.from({ length: 16 }, () => { const x = r() * W, y = 290 + r() * 100, c = ['#ff9fbb', '#fff', '#ffd27f', '#c8b6ff'][Math.floor(r() * 4)]; return `<path d="M${x} ${y}v14" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="${5 + r() * 3}" fill="${c}" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="2" fill="#ffd27f"/>`; }).join('');
    } else if (kind === 'sea') {
      body = grad('#cfe6ff', '#f4eaff') + sun(200 + r() * 200, 190, 42, '#fff4cf') + clouds(r, 3, W, H) +
        `<rect x="-5" y="230" width="${W + 10}" height="180" fill="#5f8fff" stroke="${INK}" stroke-opacity=".55" stroke-width="2.8"/>` +
        Array.from({ length: 11 }, (_, i) => { const y = 248 + i * 14, x = r() * 500; return `<path d="M${x} ${y}q15 -10 30 0t30 0t30 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`; }).join('');
    } else if (kind === 'cat') {
      body = grad('#d9ccff', '#bcd0ff') + Array.from({ length: 12 }, () => sparkle(r() * W, r() * H, 5 + r() * 9, '#fff')).join('') + catHead(300, 215, 3.3, ['#ffc98a', '#e8e8f4', '#c9a27a', '#ffdca8'][Math.floor(r() * 4)]);
    } else {
      body = grad('#5a6ed6', '#b99cf2', '#ffbba8') + sun(130 + r() * 340, 215 + r() * 30, 34 + r() * 20, '#fff0c8') + clouds(r, 5, W, H);
      if (kind === 'city') {
        let x = -5; const bl = []; while (x < W) { const w = 28 + r() * 46, hh = 70 + r() * 150; bl.push(`<rect x="${x}" y="${H - hh}" width="${w}" height="${hh + 5}" fill="#2a2d6b" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`); for (let wy = H - hh + 12; wy < H - 10; wy += 17) for (let wx = x + 7; wx < x + w - 8; wx += 13) if (r() > .55) bl.push(`<rect x="${wx}" y="${wy}" width="6" height="8" rx="1.5" fill="#ffe9a8"/>`); x += w + 3; }
        body += bl.join('');
      } else body += hills(r, W, H, ['#8179d1', '#515aa8', '#2f3374']);
    }
    return (sceneCache[key] = svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g filter="url(#r)">${body}</g>${GRAIN(W, H, .22)}</svg>`));
  };

  /* ---------- хранилище ---------- */
  let DB = null;
  const defaultSettings = () => ({ theme: 'light', accent: 'blue', privacy: { profile: 'all', messages: 'all', online: true }, notify: { like: true, comment: true, friend_request: true, friend_accept: true, message: true, community_post: true, repost: true } });
  F.defaultSettings = defaultSettings;

  function loadDB() {
    try { const raw = localStorage.getItem(DB_KEY); if (raw) { const d = JSON.parse(raw); if (d && d.users) return d; } } catch (e) { /* повреждённые данные — пересоздаём */ }
    const d = seedDB();
    try { localStorage.setItem(DB_KEY, JSON.stringify(d)); } catch (e) { }
    return d;
  }
  F.db = () => DB || (DB = loadDB());
  F.reload = () => { DB = null; };
  F.save = () => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(F.db())); return true; }
    catch (e) { F.toast('Не хватает места в браузере. Удалите несколько фотографий.'); return false; }
  };
  F.resetDemo = () => { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); DB = null; };
  window.addEventListener('storage', e => { if (e.key === DB_KEY) { DB = null; F.badges(); window.dispatchEvent(new Event('karakuli:update')); } });

  /* ---------- сессия и пользователи ---------- */
  F.sessionId = () => localStorage.getItem(SESSION_KEY);
  F.me = () => { const id = F.sessionId(); return id ? (F.db().users[id] || null) : null; };
  F.login = id => localStorage.setItem(SESSION_KEY, id);
  F.logout = () => { localStorage.removeItem(SESSION_KEY); location.href = 'login.html'; };
  F.user = id => F.db().users[id];
  F.allUsers = () => Object.values(F.db().users);
  F.fullName = u => u ? (u.first + ' ' + u.last).trim() : 'Удалённый пользователь';
  F.community = id => F.db().communities.find(c => c.id === id);
  F.members = c => (c.base || 0) + c.members.length;
  const avCache = {};
  F.avatar = u => { if (!u) return F.avatarFor('deleted'); if (u.avatar) return u.avatar; return avCache[u.id] || (avCache[u.id] = F.avatarFor(u.id + u.first)); };
  F.cover = u => u.cover || F.scene(['sunset', 'night', 'meadow', 'sea', 'city'][hashStr(u.id) % 5], hashStr(u.id) % 50);
  F.cAvatar = c => c.avatar || avCache[c.id] || (avCache[c.id] = F.communityIcon(c.emoji || '★', c.id));
  F.cCover = c => c.cover || F.scene(['sunset', 'night', 'meadow', 'sea', 'city'][hashStr(c.id) % 5], hashStr(c.id) % 50 + 3);
  F.isOnline = u => !!(u && u.online && (!u.settings || !u.settings.privacy || u.settings.privacy.online !== false));
  F.areFriends = (a, b) => !!(F.user(a) && F.user(a).friends.includes(b));
  const addU = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  const rm = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); };

  F.createUser = o => {
    const d = F.db(), id = F.uid('u');
    d.users[id] = { id, first: o.first, last: o.last || '', email: o.email, pass: F.passHash(o.email, o.pass || (F.uid('x') + Math.random())),
      status: '', about: '', city: '', birth: '', avatar: o.avatar || null, cover: null, online: true, bot: false,
      provider: o.provider || null, providerId: o.providerId || null,
      friends: [], incoming: [], outgoing: [], bookmarks: { posts: [], photos: [], links: [] }, settings: F.defaultSettings(), created: Date.now() };
    return d.users[id];
  };

  /* ---------- друзья ---------- */
  F.sendRequest = to => {
    const me = F.me(), u = F.user(to);
    if (!u || to === me.id || me.friends.includes(to) || me.outgoing.includes(to)) return;
    if (me.incoming.includes(to)) return F.acceptRequest(to);
    me.outgoing.push(to); u.incoming.push(me.id);
    F.notify(to, 'friend_request', me.id, { link: 'friends.html?tab=incoming' });
    if (u.bot) F.schedule(6000 + Math.random() * 8000, { t: 'accept', from: to, to: me.id });
    F.save(); F.badges();
  };
  F.acceptRequest = from => {
    const me = F.me(), u = F.user(from); if (!u) return;
    rm(me.incoming, from); rm(u.outgoing, me.id); addU(me.friends, from); addU(u.friends, me.id);
    F.notify(from, 'friend_accept', me.id, { link: 'profile.html?id=' + me.id });
    F.save(); F.badges();
  };
  F.declineRequest = from => { const me = F.me(), u = F.user(from); rm(me.incoming, from); if (u) rm(u.outgoing, me.id); F.save(); F.badges(); };
  F.cancelRequest = to => { const me = F.me(), u = F.user(to); rm(me.outgoing, to); if (u) rm(u.incoming, me.id); F.save(); };
  F.removeFriend = id => { const me = F.me(), u = F.user(id); rm(me.friends, id); if (u) rm(u.friends, me.id); F.save(); };

  /* ---------- сообщения ---------- */
  F.dkey = (a, b) => [a, b].sort().join('_');
  F.dialog = other => F.db().messages[F.dkey(F.sessionId(), other)] || [];
  F.sendMessage = (to, text, photo) => {
    const me = F.me(), u = F.user(to); if (!u) return false;
    if (u.settings && u.settings.privacy.messages === 'friends' && !F.areFriends(me.id, to)) { F.toast('Пользователь принимает сообщения только от друзей'); return false; }
    const k = F.dkey(me.id, to), d = F.db();
    (d.messages[k] = d.messages[k] || []).push({ id: F.uid('m'), from: me.id, to, text: text || '', photo: photo || null, ts: Date.now(), read: false });
    F.notify(to, 'message', me.id, { link: 'messages.html?u=' + me.id });
    if (u.bot) { F.schedule(2500 + Math.random() * 3500, { t: 'reply', from: to, to: me.id }); }
    if (!F.save()) { d.messages[k].pop(); return false; }
    return true;
  };

  /* ---------- уведомления ---------- */
  F.NTYPES = {
    like: { ic: 'heart', cls: 'heart', text: 'оценил(а) вашу запись' },
    comment: { ic: 'comment', text: 'прокомментировал(а) вашу запись' },
    friend_request: { ic: 'friends', text: 'отправил(а) вам заявку в друзья' },
    friend_accept: { ic: 'check', text: 'принял(а) вашу заявку в друзья' },
    message: { ic: 'chat', text: 'отправил(а) вам сообщение' },
    community_post: { ic: 'groups', text: 'опубликовало новую запись' },
    repost: { ic: 'repost', text: 'поделился(ась) вашей записью' }
  };
  F.notify = (to, type, from, extra) => {
    if (to === from) return;
    const u = F.user(to); if (!u || u.bot) return;
    if (u.settings && u.settings.notify && u.settings.notify[type] === false) return;
    extra = extra || {};
    F.db().notifications.unshift({ id: F.uid('n'), userId: to, type, fromId: from, ts: Date.now(), read: false, link: extra.link || '' });
  };
  F.counts = () => {
    const me = F.me(), d = F.db(); if (!me) return {};
    let msg = 0; Object.keys(d.messages).forEach(k => d.messages[k].forEach(m => { if (m.to === me.id && !m.read) msg++; }));
    return { msg, fr: me.incoming.length, nt: d.notifications.filter(n => n.userId === me.id && !n.read).length };
  };
  F.badges = () => {
    if (!F.me()) return; const c = F.counts();
    $$('[data-badge]').forEach(el => { const n = c[el.dataset.badge] || 0; el.textContent = n > 99 ? '99+' : n; el.hidden = !n; });
  };

  /* ---------- «живая» демо-активность друзей (боты) ---------- */
  F.schedule = (ms, a) => { const d = F.db(); (d.pending = d.pending || []).push(Object.assign({ id: F.uid('q'), at: Date.now() + ms }, a)); };
  const REPLIES = ['Привет! Как дела?', 'Ха-ха, понятно 😄', 'Отлично, спасибо!', 'Давай созвонимся вечером', 'Окей 👍', 'Посмотрю и отвечу позже', 'Класс, расскажи подробнее!', 'Ого, круто 😮'];
  const CMTS = ['Классно! 👍', 'Очень красиво 😍', 'Круто!', 'Согласен(на) 😄', 'Ого, супер!', 'Ставлю лайк 💙'];
  function runAction(a) {
    const d = F.db(), bot = F.user(a.from);
    if (!bot) return;
    if (a.t === 'accept') {
      const me = F.user(a.to); if (!me || !me.outgoing.includes(a.from)) return;
      rm(me.outgoing, a.from); rm(bot.incoming, a.to); addU(me.friends, a.from); addU(bot.friends, a.to);
      F.notify(a.to, 'friend_accept', a.from, { link: 'profile.html?id=' + a.from });
    } else if (a.t === 'like') {
      const p = d.posts.find(x => x.id === a.postId); if (!p || p.likes.includes(a.from)) return;
      p.likes.push(a.from); F.notify(p.authorId, 'like', a.from, { link: 'index.html#post-' + p.id });
    } else if (a.t === 'comment') {
      const p = d.posts.find(x => x.id === a.postId); if (!p) return;
      p.comments.push({ id: F.uid('c'), authorId: a.from, text: pick(CMTS), ts: Date.now() });
      F.notify(p.authorId, 'comment', a.from, { link: 'index.html#post-' + p.id });
    } else if (a.t === 'reply') {
      const k = F.dkey(a.from, a.to);
      (d.messages[k] = d.messages[k] || []).push({ id: F.uid('m'), from: a.from, to: a.to, text: pick(REPLIES), photo: null, ts: Date.now(), read: false });
      F.notify(a.to, 'message', a.from, { link: 'messages.html?u=' + a.from });
    }
  }
  F.tick = () => {
    const d = F.db(); if (!d.pending || !d.pending.length) return;
    const now = Date.now(), due = d.pending.filter(a => a.at <= now);
    if (!due.length) return;
    d.pending = d.pending.filter(a => a.at > now);
    due.forEach(runAction);
    F.save(); F.badges(); window.dispatchEvent(new Event('karakuli:update'));
  };
  F.botReactions = post => {
    const me = F.me(); const bots = me.friends.map(F.user).filter(u => u && u.bot).sort(() => Math.random() - .5).slice(0, 3);
    bots.forEach((b, i) => F.schedule(4000 + i * 3500 + Math.random() * 4000, { t: 'like', from: b.id, postId: post.id }));
    if (bots[0] && Math.random() < .8) F.schedule(9000 + Math.random() * 7000, { t: 'comment', from: bots[0].id, postId: post.id });
  };
  F.wallAlbum = uid => {
    const d = F.db(); let a = d.albums.find(x => x.ownerId === uid && x.system === 'wall');
    if (!a) { a = { id: F.uid('a'), ownerId: uid, name: 'Фотографии со стены', ts: Date.now(), system: 'wall' }; d.albums.push(a); }
    return a;
  };

  /* ---------- UI: тосты, модалки, лайтбокс ---------- */
  F.toast = msg => {
    let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2600);
  };
  F.modal = o => {
    const ov = document.createElement('div'); ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal card${o.wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h3>${F.esc(o.title || '')}</h3><button class="icon-btn" data-close aria-label="Закрыть">${F.ic('close')}</button></div><div class="modal-body">${o.body || ''}</div>${o.actions ? '<div class="modal-foot"></div>' : ''}</div>`;
    document.body.appendChild(ov); document.body.classList.add('no-scroll');
    const onKey = e => { if (e.key === 'Escape') api.close(); };
    const api = {
      el: ov.firstElementChild, body: ov.querySelector('.modal-body'),
      close() { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', onKey); if (!$('.modal-ov')) document.body.classList.remove('no-scroll'); if (o.onClose) o.onClose(); }
    };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) api.close(); });
    if (o.actions) {
      const foot = ov.querySelector('.modal-foot');
      o.actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.addEventListener('click', () => a.onClick ? a.onClick(api) : api.close()); foot.appendChild(b); });
    }
    if (o.onOpen) o.onOpen(api);
    return api;
  };
  F.confirm = (text, ok) => new Promise(res => {
    let done = false;
    F.modal({ title: 'Подтвердите', body: `<p style="margin:4px 0">${F.esc(text)}</p>`, actions: [
      { label: 'Отмена', cls: 'btn-ghost', onClick: a => { done = true; a.close(); res(false); } },
      { label: ok || 'Да', cls: 'btn-danger', onClick: a => { done = true; a.close(); res(true); } }], onClose: () => { if (!done) res(false); } });
  });
  F.lightbox = (list, i) => {
    list = [].concat(list); i = i || 0;
    const ov = document.createElement('div'); ov.className = 'lb'; document.body.appendChild(ov); document.body.classList.add('no-scroll');
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); if (!$('.modal-ov')) document.body.classList.remove('no-scroll'); };
    const step = d => { i = (i + d + list.length) % list.length; draw(); };
    const key = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft' && list.length > 1) step(-1); else if (e.key === 'ArrowRight' && list.length > 1) step(1); };
    function draw() { ov.innerHTML = `<button class="icon-btn lb-close" data-a="x" aria-label="Закрыть">${F.ic('close', 24)}</button>${list.length > 1 ? '<button class="lb-nav prev" data-a="p">‹</button><button class="lb-nav next" data-a="n">›</button>' : ''}<img src="${list[i]}" alt="">`; }
    ov.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) { if (a.dataset.a === 'x') close(); else step(a.dataset.a === 'p' ? -1 : 1); } else if (e.target === ov) close(); });
    document.addEventListener('keydown', key); draw();
  };
  F.readImage = (file, maxW, q) => new Promise((res, rej) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return rej(new Error('not image'));
    const fr = new FileReader(); fr.onerror = rej;
    fr.onload = () => {
      const img = new Image(); img.onerror = rej;
      img.onload = () => {
        const k = Math.min(1, (maxW || 900) / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q || .78));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
  F.pickImages = (multiple, maxW) => new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple; inp.style.display = 'none'; document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const out = [];
      for (const f of inp.files) { try { out.push(await F.readImage(f, maxW)); } catch (e) { F.toast('Не удалось прочитать файл «' + f.name + '»'); } }
      inp.remove(); res(out);
    });
    inp.addEventListener('cancel', () => { inp.remove(); res([]); });
    inp.click();
  });

  /* ---------- оформление ---------- */
  F.applyPrefs = () => {
    let p = {}; try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { }
    const me = F.me(); if (me && me.settings) p = { theme: me.settings.theme, accent: me.settings.accent };
    const t = p.theme || 'light', dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = p.accent || 'blue';
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: t, accent: p.accent || 'blue' })); } catch (e) { }
  };
  F.decor = () => {
    if ($('.deco')) return;
    // рукописный шрифт и Nunito (если нет интернета — используются системные шрифты)
    if (!$('#karakuli-fonts')) { const l = document.createElement('link'); l.id = 'karakuli-fonts'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&display=swap&subset=cyrillic'; document.head.appendChild(l); }
    const INKC = 'var(--ink)';
    const doodles = [
      ['<path d="M12 2.5l2.6 6.6 7 .5-5.4 4.5 1.8 6.9L12 17l-6 4 1.8-6.9L2.4 9.6l7-.5z" fill="var(--accent2)" stroke="' + INKC + '" stroke-width="1.5" stroke-linejoin="round"/>', 30],
      ['<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="#ffb3c6" stroke="' + INKC + '" stroke-width="1.5" stroke-linejoin="round"/>', 26],
      ['<path d="M12 2l1.8 8.2L22 12l-8.2 1.8L12 22l-1.8-8.2L2 12l8.2-1.8z" fill="#fff6c8" stroke="' + INKC + '" stroke-width="1.5" stroke-linejoin="round"/>', 24],
      ['<path d="M3 15q4-8 8 0t8 0" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>', 38],
      ['<path d="M6 17a4 4 0 0 1 .8-7.9 5 5 0 0 1 9.6 1A3.5 3.5 0 0 1 17 17z" fill="#fff" stroke="' + INKC + '" stroke-width="1.5" stroke-linejoin="round"/>', 44],
      ['<path d="M12 12m0 0a2 2 0 1 1 3 1.5a5 5 0 1 1-6-6" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linecap="round"/>', 30]
    ];
    const pos = [[1, 12], [94, 9], [47, 2], [97, 55], [1, 66], [58, 91], [27, 95], [92, 88], [1, 40], [70, 3], [36, 92], [96, 30]];
    const items = pos.map((p, i) => { const d = doodles[i % doodles.length]; return `<svg style="left:${p[0]}%;top:${p[1]}%;animation-delay:${(i * .7) % 4}s;animation-duration:${5 + i % 3}s;transform:rotate(${(i * 37) % 40 - 20}deg)" width="${d[1]}" height="${d[1]}" viewBox="0 0 24 24" filter="url(#scribble)">${d[0]}</svg>`; }).join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="wobble" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter><filter id="scribble" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></svg>` +
      `<div class="deco" aria-hidden="true">${items}</div>`);
  };

  /* ---------- оболочка страницы ---------- */
  const NAV = [['index', 'Главная', 'home'], ['profile', 'Моя страница', 'user'], ['news', 'Новости', 'news'], ['messages', 'Сообщения', 'chat', 'msg'], ['friends', 'Друзья', 'friends', 'fr'],
    ['communities', 'Сообщества', 'groups'], ['photos', 'Фотографии', 'photo'], ['bookmarks', 'Закладки', 'bookmark'], ['notifications', 'Уведомления', 'bell', 'nt'], ['settings', 'Настройки', 'settings']];

  F.mount = (key, opts) => {
    opts = opts || {}; const me = F.me();
    const nav = NAV.map(n => `<a class="nav-item${n[0] === key ? ' active' : ''}" href="${n[0]}.html">${F.ic(n[2])}<span>${n[1]}</span>${n[3] ? `<b class="badge" data-badge="${n[3]}" hidden></b>` : ''}</a>`).join('');
    const bn = (h, l, ic, b) => `<a href="${h}.html" class="${key === h ? 'active' : ''}">${F.ic(ic, 22)}<span>${l}</span>${b ? `<b class="badge" data-badge="${b}" hidden></b>` : ''}</a>`;
    document.body.insertAdjacentHTML('beforeend', `
<header class="topbar">
  <button class="icon-btn burger" id="burger" aria-label="Меню">${F.ic('menu', 24)}</button>
  ${F.logoHTML()}
  <div class="search">${F.ic('search', 18)}<input id="gsearch" type="search" placeholder="Поиск…" autocomplete="off"><div class="search-results" id="gres" hidden></div></div>
  <div class="top-right">
    <a class="icon-btn" href="notifications.html" title="Уведомления" aria-label="Уведомления">${F.ic('bell', 22)}<b class="dot-badge" data-badge="nt" hidden></b></a>
    <a class="top-ava" href="profile.html" title="Моя страница"><img src="${F.avatar(me)}" alt=""></a>
  </div>
</header>
<div class="layout${opts.right ? '' : ' no-right'}${opts.rightMobile ? ' show-right-mobile' : ''}">
  <aside class="left" id="left"><div class="drawer-logo" style="display:none;margin-bottom:10px">${F.logoHTML()}</div><nav>${nav}<div class="nav-sep"></div>
    <button class="nav-item nav-btn" id="logout">${F.ic('logout')}<span>Выйти</span></button></nav></aside>
  <main id="content"></main>
  <aside class="right" id="right"></aside>
</div>
<div class="drawer-ov" id="dov"></div>
<nav class="bottom-nav">${bn('index', 'Главная', 'home')}${bn('friends', 'Друзья', 'friends', 'fr')}${bn('messages', 'Сообщения', 'chat', 'msg')}${bn('profile', 'Профиль', 'user')}<button id="more" aria-label="Меню">${F.ic('menu', 22)}<span>Ещё</span></button></nav>`);
    const closeDrawer = () => document.body.classList.remove('drawer-open');
    $('#burger').onclick = $('#more').onclick = () => document.body.classList.toggle('drawer-open');
    $('#dov').onclick = closeDrawer;
    $$('#left a').forEach(a => a.addEventListener('click', closeDrawer));
    $('#logout').onclick = () => F.logout();
    const inp = $('#gsearch'), box = $('#gres');
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase(); if (!q) { box.hidden = true; return; }
      const us = F.allUsers().filter(u => u.id !== me.id && F.fullName(u).toLowerCase().includes(q)).slice(0, 5);
      const cs = F.db().communities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 4);
      box.innerHTML = (us.length ? '<div class="sr-h">Люди</div>' + us.map(u => `<a href="profile.html?id=${u.id}"><img class="ava ava-s" src="${F.avatar(u)}" alt="">${F.esc(F.fullName(u))}</a>`).join('') : '') +
        (cs.length ? '<div class="sr-h">Сообщества</div>' + cs.map(c => `<a href="community.html?id=${c.id}"><img class="ava ava-s" style="border-radius:10px" src="${F.cAvatar(c)}" alt="">${F.esc(c.name)}</a>`).join('') : '') ||
        '<div class="sr-h">Ничего не найдено</div>';
      box.hidden = false;
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) location.href = 'friends.html?tab=search&q=' + encodeURIComponent(inp.value.trim()); });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
    F.badges();
  };

  F.rightPanel = el => {
    const me = F.me(), d = F.db();
    const online = me.friends.map(F.user).filter(u => u && F.isOnline(u)).slice(0, 5);
    const pop = d.communities.slice().sort((a, b) => F.members(b) - F.members(a)).slice(0, 3);
    el.innerHTML = `
<section class="card card-pad"><a href="profile.html" class="rowitem" style="color:inherit"><span class="ava-wrap"><img class="ava ava-l" src="${F.avatar(me)}" alt=""><i class="online-dot"></i></span>
  <span class="grow"><b style="font-size:17px">${F.esc(me.first)}</b><span class="on-text">Online</span></span></a>
  <a class="btn btn-ghost btn-sm" style="width:100%;margin-top:10px" href="profile.html?edit=1">Редактировать профиль</a></section>
<section class="card card-pad"><div class="sec-title">Друзья онлайн <a href="friends.html?tab=online">${online.length ? 'все' : ''}</a></div>
  ${online.length ? online.map(u => `<div class="rowitem"><a class="ava-wrap" href="profile.html?id=${u.id}"><img class="ava ava-s" src="${F.avatar(u)}" alt=""><i class="online-dot" style="width:10px;height:10px"></i></a><a class="grow" style="color:var(--ink)" href="profile.html?id=${u.id}"><b>${F.esc(F.fullName(u))}</b></a><a class="icon-btn" style="width:30px;height:30px" href="messages.html?u=${u.id}" title="Написать">${F.ic('chat', 18)}</a></div>`).join('') : '<div class="muted small">Сейчас никого нет онлайн</div>'}</section>
<section class="card card-pad"><div class="sec-title">Популярные сообщества <a href="communities.html">все</a></div>
  ${pop.length ? '' : '<div class="muted small">Сообществ пока нет. <a href="communities.html">Создать первое</a></div>'}${pop.map(c => `<a class="rowitem" href="community.html?id=${c.id}"><img class="ava ava-m" style="border-radius:14px" src="${F.cAvatar(c)}" alt=""><span class="grow"><b>${F.esc(c.name)}</b><span class="muted small">${F.fmtCount(F.members(c))} подписчиков</span></span></a>`).join('')}</section>`;
  };

  /* ---------- запуск страниц ---------- */
  const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
  F.page = (key, opts, fn) => ready(() => {
    F.applyPrefs(); F.decor();
    if (!F.me()) { location.replace('login.html'); return; }
    F.tick(); F.mount(key, opts || {});
    if (fn) fn(F.$('#content'), F.$('#right'), F.me());
    setInterval(F.tick, 4000);
  });
  F.publicPage = fn => ready(() => {
    F.applyPrefs(); F.decor();
    if (F.me()) { location.replace('index.html'); return; }
    document.querySelectorAll('[data-logo]').forEach(el => { el.outerHTML = F.logoHTML(); });
    document.querySelectorAll('[data-scene]').forEach(el => { el.src = F.scene(el.dataset.scene, 7); });
    if (fn) fn();
  });

  /* ---------- пустая база ---------- */
  function seedDB() {
    return { v: 1, users: {}, posts: [], communities: [], albums: [], photos: [], messages: {}, notifications: [], pending: [] };
  }
})();
