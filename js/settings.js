/* Каракули — настройки: основные, аккаунт, приватность, уведомления, безопасность, внешний вид. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'settings') return;
  F.page('settings', { right: false }, c => {
    const me = F.me(), s = me.settings, q = new URLSearchParams(location.search);
    let tab = q.get('tab') || 'general';
    const T = [['general', 'Основные'], ['account', 'Аккаунт'], ['privacy', 'Приватность'], ['notify', 'Уведомления'], ['security', 'Безопасность'], ['look', 'Внешний вид']];
    c.innerHTML = `<h1 class="page-title">Настройки</h1><div class="settings"><nav class="card settings-nav" id="sn"></nav><section class="card card-pad" id="sb"></section></div>`;
    const nav = F.$('#sn', c), box = F.$('#sb', c);
    const row = (key, grp, title, hint) => `<div class="switch-row"><div><b>${title}</b>${hint ? `<div class="muted small">${hint}</div>` : ''}</div><label class="switch"><input type="checkbox" data-s="${grp}.${key}"${s[grp][key] ? ' checked' : ''}><span></span></label></div>`;
    const msg = (el, t, ok) => { el.textContent = t; el.className = 'form-msg ' + (ok ? 'ok' : 'err'); };

    function draw() {
      nav.innerHTML = T.map(t => `<button class="${tab === t[0] ? 'active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('');
      if (tab === 'general') {
        box.innerHTML = `<h2 class="sec-title">Основные настройки</h2>
<div class="form-grid"><div class="form-row"><label>Имя</label><input class="input" id="g-f" maxlength="30" value="${F.esc(me.first)}"></div><div class="form-row"><label>Фамилия</label><input class="input" id="g-l" maxlength="30" value="${F.esc(me.last)}"></div></div>
<div class="form-row"><label>Юзернейм</label><input class="input" id="g-u" maxlength="32" autocomplete="off" autocapitalize="off" spellcheck="false" value="${F.esc(me.username || '')}" placeholder="например, ivan_petrov"><div class="form-msg" id="g-um" style="min-height:18px;margin-top:4px"></div></div>
<div class="form-grid"><div class="form-row"><label>Дата рождения</label><input class="input" id="g-b" type="date" value="${F.esc(me.birth || '')}"></div><div class="form-row"><label>Город</label><input class="input" id="g-c" maxlength="50" value="${F.esc(me.city || '')}"></div></div>
<div class="form-row"><label>Аватар</label><div style="display:flex;align-items:center;gap:12px"><img class="ava ava-l" id="g-av" src="${F.avatar(me)}" alt=""><button class="btn btn-ghost btn-sm" id="g-avb">Загрузить</button><button class="link-btn small" id="g-avr">Сбросить</button></div></div>
<div class="form-msg" id="g-m"></div><button class="btn" id="g-save">Сохранить изменения</button>`;
        let av = me.avatar;
        F.$('#g-avb', box).onclick = async () => { const r = await F.pickImages(false, 400); if (r[0]) { av = r[0]; F.$('#g-av', box).src = av; } };
        F.$('#g-avr', box).onclick = () => { av = null; F.$('#g-av', box).src = F.avatarFor(me.id + me.first); };
        let ut = null; const gu = F.$('#g-u', box), gum = F.$('#g-um', box);
        gu.addEventListener('input', () => { clearTimeout(ut); const v = gu.value.trim().toLowerCase(); if (!v || v === me.username) { gum.textContent = ''; return; }
          ut = setTimeout(async () => { const r = await F.checkUsername(v); msg(gum, r.text, r.ok); }, 350); });
        F.$('#g-save', box).onclick = async () => {
          const f = F.$('#g-f', box).value.trim(), l = F.$('#g-l', box).value.trim(), m = F.$('#g-m', box);
          if (!f || !l) { msg(m, 'Имя и фамилия обязательны'); return; }
          const nu = gu.value.trim().toLowerCase();
          if (nu && nu !== me.username) { const r = await F.setUsername(nu); if (!r.ok) { msg(gum, r.text); msg(m, 'Юзернейм не сохранён'); return; } gum.textContent = ''; }
          Object.assign(me, { first: f, last: l, birth: F.$('#g-b', box).value, city: F.$('#g-c', box).value.trim(), avatar: av });
          if (F.save()) { msg(m, 'Изменения сохранены', true); F.$('.top-ava img').src = F.avatar(me); }
        };
      } else if (tab === 'account') {
        box.innerHTML = `<h2 class="sec-title">Аккаунт</h2>
<div class="form-row"><label>Электронная почта</label><input class="input" id="a-e" type="email" value="${F.esc(me.email)}"></div>
<div class="form-msg" id="a-m"></div><button class="btn" id="a-save">Изменить почту</button>
<p class="muted small">Мы отправим письмо со ссылкой подтверждения. Почта сменится после перехода по ссылке.</p>
<div class="nav-sep" style="margin:20px 0"></div>
<h3 class="sec-title" style="color:var(--danger)">Удаление страницы</h3><p class="muted small">Страница, записи, фотографии и переписка будут удалены без возможности восстановления.</p>
<button class="btn btn-danger" id="a-del">Удалить мою страницу</button>`;
        F.$('#a-save', box).onclick = async () => {
          const em = F.$('#a-e', box).value.trim(), m = F.$('#a-m', box);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { msg(m, 'Введите корректную почту'); return; }
          if (em.toLowerCase() === String(me.email).toLowerCase()) { msg(m, 'Это ваша текущая почта'); return; }
          const r = await F.sb.auth.updateUser({ email: em }, { emailRedirectTo: new URL('settings.html', location.href).href });
          if (r.error) msg(m, F.niceError(r.error.message)); else msg(m, 'Письмо отправлено на ' + em + '. Подтвердите смену почты по ссылке.', true);
        };
        F.$('#a-del', box).onclick = () => F.confirm('Удалить страницу навсегда? Это действие нельзя отменить.', 'Удалить навсегда').then(ok => {
          if (!ok) return;
          F.deleteAccount().catch(e => F.toast('Не удалось удалить: ' + F.niceError(e.message)));
        });
      } else if (tab === 'privacy') {
        const p = s.privacy;
        box.innerHTML = `<h2 class="sec-title">Приватность</h2>
<div class="form-row"><label>Кто видит мою страницу</label><select class="input" id="p-pr"><option value="all"${p.profile === 'all' ? ' selected' : ''}>Все пользователи</option><option value="friends"${p.profile === 'friends' ? ' selected' : ''}>Только друзья</option></select></div>
<div class="form-row"><label>Кто может писать мне сообщения</label><select class="input" id="p-ms"><option value="all"${p.messages === 'all' ? ' selected' : ''}>Все пользователи</option><option value="friends"${p.messages === 'friends' ? ' selected' : ''}>Только друзья</option></select></div>
${row('online', 'privacy', 'Показывать, что я онлайн', 'Если выключить, вы будете выглядеть «не в сети»')}`;
        F.$('#p-pr', box).onchange = e => { p.profile = e.target.value; F.save(); F.toast('Сохранено'); };
        F.$('#p-ms', box).onchange = e => { p.messages = e.target.value; F.save(); F.toast('Сохранено'); };
      } else if (tab === 'notify') {
        box.innerHTML = `<h2 class="sec-title">Уведомления</h2>${row('like', 'notify', 'Лайки')}${row('comment', 'notify', 'Комментарии')}${row('repost', 'notify', 'Репосты')}${row('friend_request', 'notify', 'Заявки в друзья')}${row('follow', 'notify', 'Новые подписчики')}${row('friend_accept', 'notify', 'Принятые заявки')}${row('message', 'notify', 'Новые сообщения')}${row('community_post', 'notify', 'Записи сообществ')}`;
      } else if (tab === 'security') {
        const prov = ((F.authUser() || {}).app_metadata || {}).provider || 'email', byMail = prov === 'email';
        box.innerHTML = `<h2 class="sec-title">Безопасность</h2>
${byMail ? '<div class="form-row"><label>Текущий пароль</label><input class="input" id="s-o" type="password" autocomplete="current-password"></div>' : `<p class="muted small">Вы вошли через ${F.esc(prov)}. Можно задать пароль, чтобы входить ещё и по почте.</p>`}
<div class="form-row"><label>Новый пароль</label><input class="input" id="s-n" type="password" autocomplete="new-password" placeholder="Не короче 6 символов"></div>
<div class="form-row"><label>Повторите новый пароль</label><input class="input" id="s-r" type="password" autocomplete="new-password"></div>
<div class="form-msg" id="s-m"></div><button class="btn" id="s-save">${byMail ? 'Изменить пароль' : 'Задать пароль'}</button>
<div class="nav-sep" style="margin:20px 0"></div><button class="btn btn-ghost" id="s-out">${F.ic('logout', 16)} Выйти из аккаунта</button>`;
        F.$('#s-save', box).onclick = async () => {
          const m = F.$('#s-m', box), n = F.$('#s-n', box).value;
          if (n.length < 6) { msg(m, 'Новый пароль должен быть не короче 6 символов'); return; }
          if (n !== F.$('#s-r', box).value) { msg(m, 'Пароли не совпадают'); return; }
          if (byMail) {
            const chk = await F.sb.auth.signInWithPassword({ email: me.email, password: F.$('#s-o', box).value });
            if (chk.error) { msg(m, 'Неверный текущий пароль'); return; }
          }
          const r = await F.sb.auth.updateUser({ password: n });
          if (r.error) { msg(m, F.niceError(r.error.message)); return; }
          msg(m, 'Пароль изменён', true); ['#s-o', '#s-n', '#s-r'].forEach(i => { const el = F.$(i, box); if (el) el.value = ''; });
        };
        F.$('#s-out', box).onclick = () => F.logout();
      } else {
        const th = [['light', 'Светлая'], ['dark', 'Тёмная'], ['auto', 'Как в системе']], ac = [['blue', 'Голубой', '#6c85ff'], ['lavender', 'Лавандовый', '#9a82ff'], ['mint', 'Мятный', '#46c3a7']];
        box.innerHTML = `<h2 class="sec-title">Внешний вид</h2><div class="form-row"><label>Тема</label><div class="theme-opts">${th.map(t => `<div class="opt${s.theme === t[0] ? ' sel' : ''}" data-th="${t[0]}">${t[1]}</div>`).join('')}</div></div>
<div class="form-row"><label>Цвет оформления</label><div class="theme-opts">${ac.map(a => `<div class="opt${s.accent === a[0] ? ' sel' : ''}" data-ac="${a[0]}"><span class="swatch" style="background:${a[2]}"></span>${a[1]}</div>`).join('')}</div></div>`;
      }
    }
    c.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; draw(); return; }
      const th = e.target.closest('[data-th]'); if (th) { s.theme = th.dataset.th; F.save(); F.applyPrefs(); draw(); return; }
      const ac = e.target.closest('[data-ac]'); if (ac) { s.accent = ac.dataset.ac; F.save(); F.applyPrefs(); draw(); }
    });
    c.addEventListener('change', e => {
      const k = e.target.dataset && e.target.dataset.s; if (!k) return; const [g, n] = k.split('.'); s[g][n] = e.target.checked; F.save(); F.toast('Сохранено');
    });
    draw();
  });
})(window.Karakuli);
