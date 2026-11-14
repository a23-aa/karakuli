/* Каракули — регистрация, вход, вход через сервисы, восстановление пароля (Supabase Auth). */
(function (F) {
  'use strict';
  const page = document.body.dataset.page;
  const CFG = window.KARAKULI_CONFIG || {};
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const here = file => new URL(file, location.href).href;

  const authErr = m => {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
    if (/Email not confirmed/i.test(m)) return 'Почта не подтверждена. Откройте письмо от Каракулей и перейдите по ссылке.';
    if (/already registered|already been registered/i.test(m)) return 'Эта почта уже зарегистрирована';
    if (/at least \d+ characters/i.test(m)) return 'Пароль должен быть не короче 6 символов';
    if (/rate limit|For security purposes|too many/i.test(m)) return 'Слишком много попыток. Подождите минуту и повторите.';
    if (/Unsupported provider|provider is not enabled/i.test(m)) return 'Этот способ входа ещё не включён в настройках Supabase.';
    if (/Signups not allowed|signup.*disabled/i.test(m)) return 'Регистрация сейчас отключена.';
    return F.niceError(m);
  };

  /* ---------- вход через сервисы ---------- */
  const PROV = {
    google: { name: 'Google', icon: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>' },
    github: { name: 'GitHub', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>' },
    discord: { name: 'Discord', icon: '<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" rx="6" fill="#5865F2"/><path d="M7 8.5c1.4-.7 3-.9 5-.9s3.6.2 5 .9l1 8c-1.2.9-2.4 1.4-3.6 1.6l-.7-1.3c.5-.2 1-.4 1.4-.7-1.2.5-2.4.8-3.1.8s-1.9-.3-3.1-.8c.4.3.9.5 1.4.7l-.7 1.3C8.4 17.9 7.2 17.4 6 16.5z" fill="#fff"/><circle cx="9.8" cy="13" r="1.2" fill="#5865F2"/><circle cx="14.2" cy="13" r="1.2" fill="#5865F2"/></svg>' },
    apple: { name: 'Apple', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8C6.9 7.4 5.5 8.3 4.7 9.7c-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.4-.9-2.4-3.8zM14.2 5.8c.6-.8 1.1-1.8.9-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3z"/></svg>' }
  };

  function oauth(id) {
    F.sb.auth.signInWithOAuth({ provider: id, options: { redirectTo: here('index.html') } })
      .then(r => { if (r.error) F.toast(authErr(r.error.message)); })
      .catch(e => F.toast(authErr(e.message)));
  }
  function mountSocial() {
    const box = F.$('#social'); if (!box) return;
    const list = (CFG.providers || []).filter(p => PROV[p]);
    if (!list.length) return;
    box.innerHTML = `<div class="divider"><span>или через</span></div><div class="social-grid">${list.map(p => `<button class="soc-btn" type="button" data-p="${p}">${PROV[p].icon}<span>${PROV[p].name}</span></button>`).join('')}</div>`;
    box.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) oauth(b.dataset.p); });
  }

  /* ---------- вход ---------- */
  if (page === 'login') {
    F.publicPage(ctx => {
      const form = F.$('#login-form'), msg = F.$('#msg'), btn = F.$('button[type=submit]', form);
      mountSocial();
      if (ctx.recovery) newPasswordModal();
      form.addEventListener('submit', async e => {
        e.preventDefault(); msg.textContent = '';
        const email = form.email.value.trim(), pass = form.pass.value;
        if (!EMAIL_RE.test(email)) { msg.textContent = 'Введите корректный адрес электронной почты'; return; }
        if (!pass) { msg.textContent = 'Введите пароль'; return; }
        btn.disabled = true;
        const r = await F.sb.auth.signInWithPassword({ email, password: pass });
        if (r.error) { btn.disabled = false; msg.textContent = authErr(r.error.message); return; }
        location.href = 'index.html';
      });
      F.$('#forgot').addEventListener('click', e => {
        e.preventDefault();
        F.modal({
          title: 'Восстановление пароля',
          body: `<p class="muted small" style="margin-top:0">Укажите почту: мы отправим письмо со ссылкой для нового пароля.</p>
<div class="form-row"><label>Электронная почта</label><input class="input" id="r-email" type="email" value="${F.esc(form.email.value.trim())}"></div><div class="form-msg err" id="r-msg"></div>`,
          actions: [{ label: 'Отмена', cls: 'btn-ghost' }, { label: 'Отправить письмо', onClick: async m => {
            const em = F.$('#r-email', m.body).value.trim(), r = F.$('#r-msg', m.body);
            if (!EMAIL_RE.test(em)) { r.textContent = 'Введите корректную почту'; return; }
            const res = await F.sb.auth.resetPasswordForEmail(em, { redirectTo: here('login.html') });
            if (res.error) { r.textContent = authErr(res.error.message); return; }
            m.close(); F.toast('Если такая почта зарегистрирована, письмо уже в пути.');
          } }]
        });
      });
    });
  }

  /** Окно нового пароля после перехода по ссылке из письма. */
  function newPasswordModal() {
    F.modal({
      title: 'Новый пароль',
      body: `<div class="form-row"><label>Новый пароль</label><input class="input" id="n-p1" type="password" autocomplete="new-password" placeholder="Не короче 6 символов"></div>
<div class="form-row"><label>Повторите пароль</label><input class="input" id="n-p2" type="password" autocomplete="new-password"></div><div class="form-msg err" id="n-msg"></div>`,
      actions: [{ label: 'Сохранить пароль', onClick: async m => {
        const a = F.$('#n-p1', m.body).value, r = F.$('#n-msg', m.body);
        if (a.length < 6) { r.textContent = 'Пароль должен быть не короче 6 символов'; return; }
        if (a !== F.$('#n-p2', m.body).value) { r.textContent = 'Пароли не совпадают'; return; }
        const res = await F.sb.auth.updateUser({ password: a });
        if (res.error) { r.textContent = authErr(res.error.message); return; }
        location.href = 'index.html';
      } }]
    });
  }

  /* ---------- регистрация ---------- */
  if (page === 'register') {
    F.publicPage(() => {
      mountSocial();
      const form = F.$('#reg-form'), msg = F.$('#msg'), btn = F.$('button[type=submit]', form);
      form.addEventListener('submit', async e => {
        e.preventDefault(); msg.className = 'form-msg err'; msg.textContent = '';
        const first = form.first.value.trim(), last = form.last.value.trim(), email = form.email.value.trim(), p1 = form.pass.value, p2 = form.pass2.value;
        const err = !first || !last ? 'Укажите имя и фамилию' : !EMAIL_RE.test(email) ? 'Введите корректный адрес электронной почты'
          : p1.length < 6 ? 'Пароль должен быть не короче 6 символов' : p1 !== p2 ? 'Пароли не совпадают' : '';
        if (err) { msg.textContent = err; return; }
        btn.disabled = true;
        const r = await F.sb.auth.signUp({ email, password: p1, options: { data: { first_name: first, last_name: last }, emailRedirectTo: here('index.html') } });
        btn.disabled = false;
        if (r.error) { msg.textContent = authErr(r.error.message); return; }
        if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) { msg.textContent = 'Эта почта уже зарегистрирована'; return; }
        if (r.data.session) { location.href = 'profile.html?welcome=1'; return; }
        msg.className = 'form-msg ok'; msg.textContent = 'Почти готово! Мы отправили письмо на ' + email + '. Перейдите по ссылке в нём, затем войдите.';
        form.reset();
      });
    });
  }
})(window.Karakuli);
