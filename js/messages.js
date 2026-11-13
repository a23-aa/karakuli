/* Каракули — личные сообщения: диалоги, история, отправка текста и фото.
   В реальном проекте обновление в реальном времени делается через WebSocket (см. событие karakuli:update). */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'messages') return;
  F.page('messages', { right: false }, c => {
    const me = F.me(), q = new URLSearchParams(location.search);
    let cur = q.get('u') && F.user(q.get('u')) && q.get('u') !== me.id ? q.get('u') : null, filter = 'all', text = '', attach = null;

    c.innerHTML = `<section class="card chat${cur ? ' open' : ''}" id="chat">
<div class="chat-list"><div class="chat-list-top"><div style="display:flex;gap:8px"><input class="input" id="dq" placeholder="Поиск по диалогам…" autocomplete="off"><button class="btn btn-sm" id="newd" title="Новое сообщение" aria-label="Новое сообщение">${F.ic('plus', 18)}</button></div>
<div style="display:flex;gap:6px"><button class="tab active" data-f="all">Все чаты</button><button class="tab" data-f="unread">Непрочитанные <span class="cnt" id="unc" hidden></span></button></div></div><div class="dialogs" id="dlgs"></div></div>
<div class="chat-pane" id="pane"></div></section>`;
    const chat = F.$('#chat', c), dlgs = F.$('#dlgs', c), pane = F.$('#pane', c);

    const threads = () => {
      const d = F.db(), out = {};
      Object.keys(d.messages).forEach(k => { const arr = d.messages[k]; if (!arr.length) return; const m = arr[arr.length - 1]; const other = m.from === me.id ? m.to : m.from; if (k.split('_').includes(me.id)) out[other] = { other, last: m, unread: arr.filter(x => x.to === me.id && !x.read).length }; });
      if (cur && !out[cur]) out[cur] = { other: cur, last: null, unread: 0 };
      return Object.values(out).sort((a, b) => (b.last ? b.last.ts : Date.now()) - (a.last ? a.last.ts : Date.now()));
    };
    function renderList() {
      const th = threads(), un = th.reduce((s, t) => s + (t.unread ? 1 : 0), 0);
      const uc = F.$('#unc', c); uc.textContent = un; uc.hidden = !un;
      const arr = th.filter(t => { const u = F.user(t.other); if (!u) return false; if (filter === 'unread' && !t.unread) return false; return !text || F.fullName(u).toLowerCase().includes(text); });
      dlgs.innerHTML = arr.length ? arr.map(t => {
        const u = F.user(t.other), l = t.last;
        return `<div class="dlg${t.other === cur ? ' active' : ''}" data-u="${t.other}"><span class="ava-wrap"><img class="ava ava-m" src="${F.avatar(u)}" alt="">${F.isOnline(u) ? '<i class="online-dot" style="width:11px;height:11px"></i>' : ''}</span>
<div class="grow"><div class="top"><b>${F.esc(F.fullName(u))}</b><span class="time">${l ? F.shortTime(l.ts) : ''}</span></div><div class="bt"><span class="last">${l ? (l.from === me.id ? 'Вы: ' : '') + (l.photo && !l.text ? '📷 Фото' : F.esc(l.text)) : 'Новый диалог'}</span>${t.unread ? `<b class="badge" style="margin:0">${t.unread}</b>` : ''}</div></div></div>`;
      }).join('') : `<div class="chat-empty">${filter === 'unread' ? 'Непрочитанных нет' : 'Диалогов пока нет'}</div>`;
    }
    function renderPane(keepInput) {
      if (!cur) { pane.innerHTML = `<div class="chat-empty">${F.ic('chat', 48)}<div>Выберите диалог слева или нажмите «+», чтобы написать другу</div></div>`; return; }
      const u = F.user(cur); if (!u) { cur = null; return renderPane(); }
      const msgs = F.dialog(cur); let changed = false;
      msgs.forEach(m => { if (m.to === me.id && !m.read) { m.read = true; changed = true; } });
      if (changed) { F.save(); F.badges(); }
      let last = '', html = '';
      msgs.forEach(m => {
        const day = F.fmtDate(m.ts); if (day !== last) { html += `<div class="day">${day === F.fmtDate(Date.now()) ? 'Сегодня' : day}</div>`; last = day; }
        html += `<div class="msg${m.from === me.id ? ' mine' : ''}">${m.photo ? `<img src="${m.photo}" alt="Фото" data-lb="${m.id}">` : ''}${m.text ? F.esc(m.text).replace(/\n/g, '<br>') : ''}<div class="mt">${F.fmtTime(m.ts)}</div></div>`;
      });
      if (keepInput && F.$('#msgs', pane)) { const box = F.$('#msgs', pane), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80; box.innerHTML = html || '<div class="chat-empty">Напишите первое сообщение 👋</div>'; if (atEnd) box.scrollTop = box.scrollHeight; return; }
      pane.innerHTML = `<div class="chat-head"><button class="icon-btn chat-back" id="back" aria-label="Назад">${F.ic('back')}</button><a href="profile.html?id=${u.id}"><img class="ava ava-m" src="${F.avatar(u)}" alt=""></a>
<div class="grow"><a href="profile.html?id=${u.id}" style="color:var(--ink);font-weight:800">${F.esc(F.fullName(u))}</a><div>${F.isOnline(u) ? '<span class="on-text">online</span>' : '<span class="muted small">был(а) в сети недавно</span>'}</div></div></div>
<div class="msgs" id="msgs">${html || '<div class="chat-empty">Напишите первое сообщение 👋</div>'}</div>
<div class="chat-attach" id="att" hidden></div>
<div class="chat-input"><button class="icon-btn" id="pick" title="Прикрепить фото" aria-label="Прикрепить фото">${F.ic('photo', 22)}</button><textarea class="input" id="mt" rows="1" maxlength="2000" placeholder="Написать сообщение…"></textarea><button class="btn" id="send" aria-label="Отправить">${F.ic('send', 18)}</button></div>`;
      const box = F.$('#msgs', pane); box.scrollTop = box.scrollHeight; drawAttach();
    }
    function drawAttach() { const a = F.$('#att', pane); if (!a) return; a.hidden = !attach; a.innerHTML = attach ? `<div class="prev"><img src="${attach}" alt=""><button data-rmatt type="button">×</button></div>` : ''; }
    function send() {
      const ta = F.$('#mt', pane), t = ta.value.trim(); if (!t && !attach) return;
      if (F.sendMessage(cur, t, attach)) { ta.value = ''; attach = null; renderPane(); renderList(); }
    }
    function open(id) { cur = id; attach = null; chat.classList.add('open'); renderList(); renderPane(); history.replaceState(null, '', 'messages.html?u=' + id); }

    c.addEventListener('click', e => {
      const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; F.$$('.chat-list-top .tab', c).forEach(t => t.classList.toggle('active', t === f)); renderList(); return; }
      const d = e.target.closest('[data-u]'); if (d) { open(d.dataset.u); return; }
      if (e.target.closest('#back')) { chat.classList.remove('open'); cur = null; renderList(); renderPane(); history.replaceState(null, '', 'messages.html'); return; }
      if (e.target.closest('#send')) { send(); return; }
      if (e.target.closest('#pick')) { F.pickImages(false, 900).then(r => { if (r[0]) { attach = r[0]; drawAttach(); } }); return; }
      if (e.target.closest('[data-rmatt]')) { attach = null; drawAttach(); return; }
      const im = e.target.closest('[data-lb]'); if (im) { F.lightbox(im.src); return; }
      if (e.target.closest('#newd')) {
        const fr = me.friends.map(F.user).filter(Boolean);
        F.modal({ title: 'Новое сообщение', body: fr.length ? fr.map(u => `<div class="rowitem" style="cursor:pointer" data-pick="${u.id}"><img class="ava ava-m" src="${F.avatar(u)}" alt=""><span class="grow"><b>${F.esc(F.fullName(u))}</b></span></div>`).join('') : '<div class="muted">Сначала добавьте друзей</div>',
          onOpen: m => m.body.addEventListener('click', ev => { const p = ev.target.closest('[data-pick]'); if (p) { m.close(); open(p.dataset.pick); } }) });
      }
    });
    c.addEventListener('keydown', e => { if (e.target.id === 'mt' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    F.$('#dq', c).addEventListener('input', e => { text = e.target.value.trim().toLowerCase(); renderList(); });
    window.addEventListener('karakuli:update', () => { renderList(); if (cur) renderPane(true); });
    renderList(); renderPane();
  });
})(window.Karakuli);
