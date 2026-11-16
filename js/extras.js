/* CrownNet — «приятные мелочи»: кнопка «наверх», счётчик в заголовке вкладки, анимация лайков */
(function (F) {
  'use strict';
  if (!F) return;
  // «наверх»
  const up = document.createElement('button'); up.className = 'to-top'; up.setAttribute('aria-label', 'Наверх'); up.title = 'Наверх'; up.hidden = true; up.textContent = '↑';
  up.onclick = () => scrollTo({ top: 0, behavior: 'smooth' }); document.body.appendChild(up);
  addEventListener('scroll', () => { up.hidden = scrollY < 700; }, { passive: true });

  // счётчик непрочитанного в заголовке вкладки
  const base = document.title;
  const tick = () => { try { const c = F.counts && F.counts(); const n = c ? (c.msg || 0) + (c.nt || 0) + (c.fr || 0) : 0; document.title = n ? '(' + (n > 99 ? '99+' : n) + ') ' + base : base; } catch (e) { /* ок */ } };
  setInterval(tick, 3000); tick();

  // анимация лайка
  document.addEventListener('click', e => { const b = e.target.closest('[data-act=like]'); if (!b) return; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); });
  // ---------- новые уведомления: звук + небольшая плашка справа внизу (на компьютере) ----------
  const seenN = new Set(), seenM = new Set(); let primed = false;
  const wide = () => window.matchMedia && matchMedia('(min-width: 900px)').matches;
  function stack() { let b = document.querySelector('.ntoasts'); if (!b) { b = document.createElement('div'); b.className = 'ntoasts'; document.body.appendChild(b); } return b; }
  function showToast(ava, title, text, href) {
    if (!wide()) return;
    const box = stack(); while (box.children.length >= 3) box.firstChild.remove();
    const a = document.createElement('a'); a.className = 'ntoast'; if (href) a.href = href;
    a.innerHTML = '<img class="ava ava-m" alt="" src="' + ava + '"><span class="nt-b"><b></b><span></span></span><button type="button" class="nt-x" aria-label="Закрыть">×</button>';
    a.querySelector('b').textContent = title; a.querySelector('.nt-b span').textContent = text;
    a.querySelector('.nt-x').onclick = e => { e.preventDefault(); e.stopPropagation(); a.remove(); };
    box.appendChild(a); setTimeout(() => { a.classList.add('out'); setTimeout(() => a.remove(), 300); }, 5500);
  }
  function watch() {
    let me; try { me = F.me && F.me(); } catch (e) { me = null; } if (!me || !F.db) return;
    const d = F.db(), fresh = [];
    d.notifications.forEach(n => { if (n.userId !== me.id || seenN.has(n.id)) return; seenN.add(n.id); if (primed && !n.read && n.type !== 'message') fresh.push({ k: 'n', n }); });
    Object.values(d.messages).forEach(arr => arr.forEach(m => { if (seenM.has(m.id)) return; seenM.add(m.id); if (primed && m.to === me.id && !m.read && m.kind !== 'call') fresh.push({ k: 'm', m }); }));
    primed = true; if (!fresh.length) return;
    const inChat = document.body.dataset.page === 'messages' && document.visibilityState === 'visible';
    fresh.slice(-3).forEach(f => {
      if (f.k === 'm') { if (inChat) return; const u = F.user(f.m.from); showToast(F.avatar(u), F.fullName(u), F.msgPreview ? F.msgPreview(f.m, me.id) : f.m.text, 'messages.html?u=' + f.m.from); }
      else { const u = F.user(f.n.fromId), t = F.NTYPES[f.n.type]; if (!u || !t) return; showToast(F.avatar(u), F.fullName(u), t.text, f.n.link || 'notifications.html'); }
    });
    if (F.sound) F.sound.play(fresh.some(f => f.k === 'm') ? 'message' : 'notify');
  }
  setInterval(watch, 1500); setTimeout(watch, 400);

  // ---------- установка приложения на компьютер/телефон ----------
  let deferred = null;
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function refreshInstall() { document.querySelectorAll('[data-install]').forEach(b => { b.hidden = standalone(); }); }
  async function install() {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { /* ок */ } deferred = null; refreshInstall(); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    F.modal({ title: 'Установить CrownNet', body: ios
      ? '<p style="margin:0">Нажмите «Поделиться» в Safari и выберите «На экран “Домой”».</p>'
      : '<p style="margin:0">В адресной строке браузера нажмите значок установки (монитор со стрелкой) или откройте меню браузера и выберите «Установить CrownNet».</p>' });
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; refreshInstall(); });
  addEventListener('appinstalled', () => { deferred = null; F.toast('CrownNet установлен'); refreshInstall(); });
  F.install = { run: install };
  function mountInstall() {
    if (standalone()) return;
    const nav = document.querySelector('#left nav');
    if (nav && !nav.querySelector('[data-install]')) { const b = document.createElement('button'); b.className = 'nav-item nav-btn install-btn'; b.setAttribute('data-install', ''); b.innerHTML = F.ic('download') + '<span>Скачать приложение</span>'; b.onclick = install; nav.insertBefore(b, nav.querySelector('.nav-more') || null); }
    const box = document.querySelector('.auth-form');
    if (box && !box.querySelector('[data-install]')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost install-auth'; b.setAttribute('data-install', ''); b.innerHTML = F.ic('download', 18) + ' Скачать приложение'; b.onclick = install; box.appendChild(b); }
  }
  new MutationObserver(mountInstall).observe(document.documentElement, { childList: true, subtree: true }); mountInstall();
})(window.Karakuli);
