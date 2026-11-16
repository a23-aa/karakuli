#!/usr/bin/env node
/* CrownNet — QA-клиент: «живой посетитель», который ходит по всем страницам сайта на компьютере и телефоне,
   нажимает кнопки и ищет проблемы: ошибки в консоли, битые картинки и ссылки, горизонтальную прокрутку,
   мелкие кнопки на телефоне, кнопки без подписи, плохую контрастность, пустые и сломанные состояния.

   Запуск:   cd qa && npm i && node client.js            (локально, с тестовой базой-подделкой, без доступа в интернет)
             node client.js --live https://a23-aa.github.io/karakuli/   (боевой сайт, только публичные страницы)
   Отчёт:    qa/out/report.md  +  скриншоты qa/out/*.png                                                              */
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { console.error('Нужен playwright: cd qa && npm i'); process.exit(2); }
const args = process.argv.slice(2), live = args.indexOf('--live') >= 0, liveUrl = live ? (args[args.indexOf('--live') + 1] || '') : '';
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const AUTH_PAGES = ['index', 'news', 'profile', 'friends', 'messages', 'communities', 'photos', 'bookmarks', 'notifications', 'settings', 'events', 'support'];
const PUBLIC_PAGES = ['login', 'register'];
const DANGER = /удал|выйти|выход|блок|бан|заблок|отписа|пожаловат|очист|logout|delete|remove|ban/i;
const issues = []; const add = (sev, page, vp, what, extra) => issues.push({ sev, page, vp, what, extra: extra || '' });

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html'; if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
    srv.listen(0, () => res([srv, 'http://localhost:' + srv.address().port + '/']));
  });
}

/* ---------- проверки одной страницы ---------- */
async function audit(p, name, vp, mobile) {
  const r = await p.evaluate(mob => {
    const out = { emoji: [], overflow: [], imgs: [], noname: [], small: [], contrast: [], empty: false, title: document.title };
    const vw = document.documentElement.clientWidth, vis = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && +s.opacity > 0.05; };
    const desc = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    if (document.documentElement.scrollWidth > vw + 1) {
      document.querySelectorAll('body *').forEach(e => { if (out.overflow.length < 5 && vis(e) && getComputedStyle(e).position !== 'fixed') { const b = e.getBoundingClientRect(); if (b.right > vw + 2 && b.width < vw * 3) out.overflow.push(desc(e) + ' → ' + Math.round(b.right) + 'px'); } });
      out.overflowW = document.documentElement.scrollWidth;
    }
    document.querySelectorAll('img').forEach(i => { if (vis(i) && i.complete && !i.naturalWidth) out.imgs.push(i.src.slice(-60)); else if (!i.hasAttribute('alt')) out.noname.push('img без alt: ' + i.src.slice(-40)); });
    document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach(e => {
      if (!vis(e)) return; const b = e.getBoundingClientRect();
      const label = (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.getAttribute('placeholder') || '').trim() || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label') || (e.tagName === 'A' && e.querySelector('img[alt]:not([alt=""])'));
      if (!label && !(e.tagName === 'INPUT' && ['checkbox', 'radio', 'file'].includes(e.type))) out.noname.push('без подписи: ' + desc(e));
      if (mob && (e.tagName === 'BUTTON' || e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.getAttribute('role') === 'button') && (b.height < 32 || b.width < 32) && !(e.type === 'checkbox' || e.type === 'radio')) out.small.push(desc(e) + ' ' + Math.round(b.width) + '×' + Math.round(b.height));
    });
    const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const rgba = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
    const bgOf = e => { for (let n = e; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c && c[3] > .95) return c; } return [255, 255, 255, 1]; };
    const seen = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n, k = 0; (n = w.nextNode()) && k < 900; k++) {
      const t = n.textContent.trim(); if (t.length < 2) continue; const e = n.parentElement; if (!e || !vis(e) || seen.has(e)) continue; seen.add(e);
      if (getComputedStyle(e).backgroundImage !== 'none' || e.closest('.nav-event,.portal-btn,.btn-primary')) continue; const fg = rgba(getComputedStyle(e).color), bg = bgOf(e); if (!fg) continue;
      const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05), fs = parseFloat(getComputedStyle(e).fontSize);
      if (ratio < (fs >= 18 ? 2.2 : 3.0) && out.contrast.length < 6) out.contrast.push(desc(e) + ' «' + t.slice(0, 24) + '» ' + ratio.toFixed(1) + ':1');
    }
    const em = document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu); if (em) out.emoji = [...new Set(em)].slice(0, 6);
    const c = document.querySelector('#content'); out.empty = !!c && c.textContent.trim().length < 3;
    return out;
  }, mobile);
  if (r.overflow.length || r.overflowW) add('high', name, vp, 'Горизонтальная прокрутка (ширина ' + r.overflowW + ')', r.overflow.join('; '));
  if (r.imgs.length) add('high', name, vp, 'Битые картинки', r.imgs.slice(0, 4).join(', '));
  if (r.emoji.length) add('med', name, vp, 'Смайлики на странице (в CrownNet их быть не должно)', r.emoji.join(' '));
  if (r.empty) add('high', name, vp, 'Пустой контент страницы');
  const uniq = a => [...new Set(a)];
  if (r.noname.length) add('low', name, vp, 'Элементы без подписи (доступность)', uniq(r.noname).slice(0, 6).join('; '));
  if (r.small.length) add('med', name, vp, 'Мелкие элементы для пальца (<32px)', uniq(r.small).slice(0, 6).join('; '));
  if (r.contrast.length) add('med', name, vp, 'Низкая контрастность текста', r.contrast.join('; '));
}

/* ---------- «нажать всё» ---------- */
async function poke(p, name, vp, errors) {
  const labels = await p.evaluate(() => [...document.querySelectorAll('#content button, #left button, .topbar button, #content a.btn, #content .tab, #content summary')].filter(e => { const b = e.getBoundingClientRect(), s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden'; }).map((e, i) => ({ i, t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) })));
  const url = p.url(); let n = 0;
  for (const l of labels.slice(0, 35)) {
    if (DANGER.test(l.t)) continue;
    const before = errors.length;
    try {
      const el = (await p.$$('#content button, #left button, .topbar button, #content a.btn, #content .tab, #content summary'))[l.i]; if (!el) continue;
      if (!(await el.isVisible())) continue;
      await el.click({ timeout: 1500, trial: false, noWaitAfter: true }).catch(() => { }); await p.waitForTimeout(120); n++;
      if (errors.length > before) add('high', name, vp, 'Ошибка после нажатия «' + (l.t || 'кнопка') + '»', errors.slice(before).join(' | ').slice(0, 200));
      if (p.url() !== url) { await p.goto(url, { waitUntil: 'load' }); }
      else { await p.keyboard.press('Escape'); const m = await p.$('.modal-ov'); if (m) await m.evaluate(e => e.remove()); await p.evaluate(() => document.body.classList.remove('no-scroll')); }
    } catch (e) { /* страница могла перезагрузиться */ }
  }
  return n;
}

(async () => {
  let srv, base;
  if (live) base = liveUrl.endsWith('/') ? liveUrl : liveUrl + '/'; else [srv, base] = await serve();
  const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const viewports = [['компьютер', { viewport: { width: 1366, height: 800 } }, false], ['телефон', Object.assign({}, pw.devices['iPhone 12']), true]];
  let pagesChecked = 0, clicks = 0;
  for (const [vpName, opts, mobile] of viewports) {
    const ctx = await browser.newContext(Object.assign({ permissions: ['camera', 'microphone'] }, opts)); const errors = [];
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (!live) { await ctx.route(/cdn\.jsdelivr\.net.*supabase/, r => r.abort()); await ctx.addInitScript({ path: path.join(__dirname, 'mock-supabase.js') }); }
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('JS: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|Failed to load resource.*(font|supabase\.co)/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push('HTTP ' + r.status() + ' ' + r.url().replace(base, '')); });
    const visit = async name => {
      const before = errors.length; await page.goto(base + name + '.html', { waitUntil: 'load' }).catch(e => add('high', name, vpName, 'Страница не открылась', e.message)); await page.waitForTimeout(700);
      pagesChecked++; await audit(page, name, vpName, mobile); clicks += await poke(page, name, vpName, errors);
      await page.screenshot({ path: path.join(OUT, name + '-' + (mobile ? 'tel' : 'pc') + '.png'), fullPage: false }).catch(() => { });
      if (errors.length > before) add('high', name, vpName, 'Ошибки при загрузке/работе страницы', [...new Set(errors.slice(before))].slice(0, 4).join(' | '));
    };
    for (const n of PUBLIC_PAGES) { await ctx.clearCookies(); await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ок */ } }).catch(() => { }); await visit(n); }
    if (!live) {
      // регистрируемся как новый посетитель и пользуемся сайтом
      const reg = async (first, last, uname, mail) => { await page.goto(base + 'register.html'); await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__mock_sb__') || '{"t":{},"users":[],"uid":null}'); d.uid = null; localStorage.setItem('__mock_sb__', JSON.stringify(d)); }); await page.goto(base + 'register.html'); await page.fill('#uname', uname); await page.fill('#email', mail); await page.fill('#pass', 'secret1'); await page.fill('#pass2', 'secret1'); await page.click('#reg-form button[type=submit]'); await page.waitForURL(/profile/, { timeout: 8000 }).catch(() => add('high', 'register', vpName, 'Регистрация не завершилась')); await page.waitForTimeout(500); };
      await reg('Борис', 'Орлов', 'boris_qa', 'b@qa.ru');
      await page.goto(base + 'index.html'); await page.waitForSelector('.composer textarea').catch(() => { }); await page.fill('.composer textarea', 'Всем привет! #каракули #тест @anya_qa').catch(() => { }); await page.click('[data-c=send]').catch(() => { }); await page.waitForTimeout(500);
      await reg('Аня', 'Смирнова', 'anya_qa', 'a@qa.ru');
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__mock_sb__')); const ids = d.t.profiles.map(x => x.id), me = d.uid, o = ids.find(x => x !== me); if (o) (d.t.friendships = d.t.friendships || []).push({ requester_id: o, addressee_id: me, status: 'accepted', created_at: new Date().toISOString() }); localStorage.setItem('__mock_sb__', JSON.stringify(d)); });
      for (const n of AUTH_PAGES) await visit(n);
      // длинное имя и текст — ищем поломки вёрстки
      await page.goto(base + 'settings.html'); await page.waitForTimeout(500);
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__mock_sb__')); const u = d.t.profiles.find(x => x.id === d.uid) || d.t.profiles[d.t.profiles.length - 1]; d.uid = u.id; u.first_name = 'Константинопольский-Длинноимённый'; u.last_name = 'Вольфшлегельштейнхаузенбергердорф'; localStorage.setItem('__mock_sb__', JSON.stringify(d)); });
      for (const n of ['index', 'profile', 'friends']) { await visit(n); }
    }
    await ctx.close();
  }
  await browser.close(); if (srv) srv.close();
  // ссылки между страницами
  const dead = []; fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); (t.match(/(?:href|src)="([^"#?]+)/g) || []).map(x => x.replace(/^(?:href|src)="/, '')).filter(x => !/^(https?:|mailto:|data:|javascript:)/.test(x)).forEach(x => { if (!fs.existsSync(path.join(ROOT, x))) dead.push(f + ' → ' + x); }); });
  if (dead.length) add('high', '(все)', '-', 'Ссылки на несуществующие файлы', dead.join('; '));
  // отчёт
  const order = { high: 0, med: 1, low: 2 }, names = { high: '🔴 Серьёзно', med: '🟠 Средне', low: '🟡 Мелочи' };
  const uniqKey = i => [i.sev, i.page, i.what, i.extra].join('|'), seen = new Set(), list = issues.filter(i => !seen.has(uniqKey(i)) && seen.add(uniqKey(i))).sort((a, b) => order[a.sev] - order[b.sev]);
  let md = `# Отчёт QA-клиента\n\nПроверено страниц: ${pagesChecked} (компьютер + телефон), нажато кнопок: ${clicks}. Найдено замечаний: ${list.length}.\n`;
  for (const sev of ['high', 'med', 'low']) { const g = list.filter(i => i.sev === sev); if (!g.length) continue; md += `\n## ${names[sev]} (${g.length})\n` + g.map(i => `- **${i.page}** (${i.vp}): ${i.what}${i.extra ? ' — ' + i.extra : ''}`).join('\n') + '\n'; }
  if (!list.length) md += '\nЗамечаний нет 🎉\n';
  fs.writeFileSync(path.join(OUT, 'report.md'), md); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(list, null, 1));
  console.log(md); process.exit(list.some(i => i.sev === 'high') ? 1 : 0);
})();
