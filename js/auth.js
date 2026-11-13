/* Каракули — регистрация, вход, вход через Google / VK / Яндекс / Apple.
   Демо: всё хранится в LocalStorage. В реальном проекте: POST /api/auth/*, а токены соцсетей проверяет сервер. */
(function (F) {
  'use strict';
  const page = document.body.dataset.page;
  const CFG = window.KARAKULI_CONFIG || {};
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const findByEmail = em => F.allUsers().find(u => u.email.toLowerCase() === String(em).toLowerCase());

  /* ---------- вход через сервисы ---------- */
  const ICON = {
    google: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>',
    vk: '<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" rx="6" fill="#0077ff"/><text x="12" y="16.3" font-family="Arial,sans-serif" font-size="10.5" font-weight="800" fill="#fff" text-anchor="middle">VK</text></svg>',
    yandex: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="12" fill="#fc3f1d"/><text x="12" y="17" font-family="Arial,sans-serif" font-size="14" font-weight="800" fill="#fff" text-anchor="middle">Я</text></svg>',
    apple: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8C6.9 7.4 5.5 8.3 4.7 9.7c-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.9 2.300 1.100 0 1.600-.7 3-.7s1.800.7 3 .7 2-1.100 2.800-2.200c.9-1.300 1.200-2.500 1.300-2.600-.1 0-2.400-.9-2.400-3.800zM14.200 5.800c.6-.8 1.100-1.800.9-2.800-.9 0-2 .6-2.600 1.400-.6.700-1.100 1.700-.9 2.700 1 .1 2-.5 2.600-1.300z"/></svg>'
  };
  const PROV = [['vk', 'VK', 'vkClientId'], ['yandex', 'Яндекс', 'yandexClientId'], ['apple', 'Apple', 'appleClientId']];

  /** Вход или создание страницы по данным от сервиса. */
  F.socialLogin = function (p) {
    const email = String(p.email || '').trim();
    let u = F.allUsers().find(x => x.provider === p.provider && x.providerId === p.providerId) || (email ? findByEmail(email) : null), isNew = false;
    if (!u) { u = F.createUser({ first: p.first || 'Пользователь', last: p.last || '', email, avatar: p.avatar, provider: p.provider, providerId: p.providerId }); isNew = true; }
    else if (!u.provider) { u.provider = p.provider; u.providerId = p.providerId; }
    u.online = true;
    if (!F.save()) { F.reload(); F.toast('Не удалось сохранить данные в браузере'); return false; }
    F.login(u.id); location.href = isNew ? 'profile.html?welcome=1' : 'index.html'; return true;
  };

  function parseJwt(t) {
    const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function demoModal(id, name) {
    F.modal({
      title: 'Вход через ' + name,
      body: `<p class="hint" style="margin:0 0 12px">Ключ «${name}» ещё не подключён в <b>js/config.js</b>, поэтому это демо-вход: введите данные, как будто их передал сервис. После подключения ключа здесь откроется настоящее окно ${name}.</p>
<div class="form-grid"><div class="form-row"><label>Имя</label><input class="input" id="s-f" maxlength="30"></div><div class="form-row"><label>Фамилия</label><input class="input" id="s-l" maxlength="30"></div></div>
<div class="form-row"><label>Электронная почта</label><input class="input" id="s-e" type="email"></div><div class="form-msg err" id="s-m"></div>`,
      onOpen: m => F.$('#s-f', m.body).focus(),
      actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Продолжить', onClick: m => {
        const g = s => F.$(s, m.body).value.trim(), em = g('#s-e'), f = g('#s-f');
        if (!f) { F.$('#s-m', m.body).textContent = 'Введите имя'; return; }
        if (!EMAIL_RE.test(em)) { F.$('#s-m', m.body).textContent = 'Введите корректную почту'; return; }
        F.socialLogin({ provider: id, providerId: 'demo:' + em.toLowerCase(), email: em, first: f, last: g('#s-l') });
      } }]
    });
  }

  function loadGoogle(cb) {
    if (window.google && window.google.accounts) return cb();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = cb;
    s.onerror = () => F.toast('Не удалось загрузить вход Google. Проверьте интернет.'); document.head.appendChild(s);
  }

  function mountSocial() {
    const box = F.$('#social'); if (!box) return;
    box.innerHTML = '<div class="divider"><span>или через</span></div><div id="g-slot"></div><div class="social-grid" id="soc"></div>';
    const slot = F.$('#g-slot', box), grid = F.$('#soc', box);
    if (CFG.googleClientId) {
      loadGoogle(() => {
        window.google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: r => {
          try { const c = parseJwt(r.credential); F.socialLogin({ provider: 'google', providerId: c.sub, email: c.email, first: c.given_name || c.name, last: c.family_name || '', avatar: c.picture || null }); }
          catch (e) { F.toast('Не удалось войти через Google'); }
        } });
        window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'ru', width: Math.min(340, slot.clientWidth || 300) });
      });
    } else {
      grid.insertAdjacentHTML('beforeend', `<button class="soc-btn" type="button" data-p="google">${ICON.google}<span>Google</span></button>`);
    }
    PROV.forEach(p => grid.insertAdjacentHTML('beforeend', `<button class="soc-btn" type="button" data-p="${p[0]}">${ICON[p[0]]}<span>${p[1]}</span></button>`));
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const id = b.dataset.p, name = id === 'google' ? 'Google' : PROV.find(x => x[0] === id)[1];
      demoModal(id, name);
    });
  }

  /* ---------- вход ---------- */
  if (page === 'login') {
    F.publicPage(() => {
      mountSocial();
      const form = F.$('#login-form'), msg = F.$('#msg');
      form.addEventListener('submit', e => {
        e.preventDefault(); msg.textContent = '';
        const email = form.email.value.trim(), pass = form.pass.value;
        if (!EMAIL_RE.test(email)) { msg.textContent = 'Введите корректный адрес электронной почты'; return; }
        if (!pass) { msg.textContent = 'Введите пароль'; return; }
        const u = findByEmail(email);
        if (!u) { msg.textContent = 'Страница с такой почтой не найдена. Создайте её на странице регистрации.'; return; }
        if (u.pass !== F.passHash(email, pass)) { msg.textContent = u.provider ? 'Эта страница создана через ' + u.provider + '. Войдите тем же способом.' : 'Неверный пароль'; return; }
        F.login(u.id); u.online = true; F.save(); location.href = 'index.html';
      });
      F.$('#forgot').addEventListener('click', e => {
        e.preventDefault();
        F.modal({
          title: 'Восстановление пароля',
          body: `<p class="muted small" style="margin-top:0">В этой версии письмо не отправляется: укажите почту и сразу задайте новый пароль. На настоящем сервере здесь будет ссылка из письма.</p>
<div class="form-row"><label>Электронная почта</label><input class="input" id="r-email" type="email"></div>
<div class="form-row"><label>Новый пароль</label><input class="input" id="r-p1" type="password" placeholder="Не короче 6 символов"></div>
<div class="form-row"><label>Повторите пароль</label><input class="input" id="r-p2" type="password"></div><div class="form-msg" id="r-msg"></div>`,
          actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Сохранить пароль', onClick: m => {
            const g = s => F.$(s, m.body), r = g('#r-msg'); r.className = 'form-msg err';
            const u = findByEmail(g('#r-email').value.trim());
            if (!u) { r.textContent = 'Пользователь с такой почтой не найден'; return; }
            if (g('#r-p1').value.length < 6) { r.textContent = 'Пароль должен быть не короче 6 символов'; return; }
            if (g('#r-p1').value !== g('#r-p2').value) { r.textContent = 'Пароли не совпадают'; return; }
            u.pass = F.passHash(u.email, g('#r-p1').value); F.save(); m.close(); F.toast('Пароль изменён. Теперь можно войти.');
            form.email.value = u.email; form.pass.focus();
          } }]
        });
      });
    });
  }

  /* ---------- регистрация ---------- */
  if (page === 'register') {
    F.publicPage(() => {
      mountSocial();
      const form = F.$('#reg-form'), msg = F.$('#msg');
      form.addEventListener('submit', e => {
        e.preventDefault(); msg.textContent = '';
        const first = form.first.value.trim(), last = form.last.value.trim(), email = form.email.value.trim(), p1 = form.pass.value, p2 = form.pass2.value;
        const err = !first || !last ? 'Укажите имя и фамилию' : !EMAIL_RE.test(email) ? 'Введите корректный адрес электронной почты'
          : findByEmail(email) ? 'Эта почта уже зарегистрирована' : p1.length < 6 ? 'Пароль должен быть не короче 6 символов' : p1 !== p2 ? 'Пароли не совпадают' : '';
        if (err) { msg.textContent = err; return; }
        const u = F.createUser({ first, last, email, pass: p1 });
        if (!F.save()) { F.reload(); msg.textContent = 'Не удалось сохранить данные в браузере'; return; }
        F.login(u.id); location.href = 'profile.html?welcome=1';
      });
    });
  }
})(window.Karakuli);
