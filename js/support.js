/* CrownNet — поддержка: обращение к администраторам и заявка на галочку. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'support') return;
  F.page('support', { right: false }, c => {
    const me = F.me(), sb = F.sb, esc = F.esc;
    const ST = { open: 'Ждёт ответа', answered: 'Есть ответ', closed: 'Закрыто', pending: 'На рассмотрении', approved: 'Одобрена', rejected: 'Отклонена' };
    const BN = { verified: 'Подтверждённый аккаунт', blogger: 'Блогер' };
    const when = s => new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    c.innerHTML = `<h1 class="page-title">Поддержка</h1>
<section class="card card-pad" style="margin-bottom:14px"><h2 class="sec-title">Написать в поддержку</h2>
<div class="form-row"><label for="s-sub">Тема</label><input class="input" id="s-sub" maxlength="120" placeholder="Коротко, о чём вопрос"></div>
<div class="form-row"><label for="s-body">Сообщение</label><textarea class="input" id="s-body" rows="4" maxlength="3000" placeholder="Опишите проблему или вопрос"></textarea></div>
<div class="form-msg" id="s-msg" role="alert"></div><button class="btn" id="s-send">Отправить</button></section>
<section class="card card-pad" style="margin-bottom:14px"><h2 class="sec-title">Мои обращения</h2><div id="s-list" class="muted">Загружаем…</div></section>
<section class="card card-pad"><h2 class="sec-title">Заявка на галочку</h2><div id="b-box"></div></section>`;
    const msg = (el, t, ok) => { el.textContent = t; el.className = 'form-msg ' + (ok ? 'ok' : 'err'); };

    async function tickets() {
      const box = F.$('#s-list', c), r = await sb.from('support_tickets').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(30);
      if (r.error) { box.innerHTML = `<span class="muted small">${esc(F.niceError(r.error.message))}</span>`; return; }
      box.innerHTML = r.data.length ? r.data.map(t => `<div class="tk"><div class="tk-h"><b>${esc(t.subject)}</b><span class="tk-st ${t.status}">${ST[t.status]}</span></div><div class="muted small">${when(t.created_at)}</div><p>${esc(t.body).replace(/\n/g, '<br>')}</p>${t.reply ? `<div class="tk-reply"><b>Ответ поддержки</b><p>${esc(t.reply).replace(/\n/g, '<br>')}</p></div>` : ''}</div>`).join('') : 'Обращений пока нет.';
    }
    F.$('#s-send', c).onclick = async e => {
      const m = F.$('#s-msg', c), sub = F.$('#s-sub', c).value.trim(), body = F.$('#s-body', c).value.trim();
      if (!sub || !body) { msg(m, 'Заполните тему и сообщение'); return; }
      e.target.disabled = true;
      const r = await sb.from('support_tickets').insert({ user_id: me.id, subject: sub, body });
      e.target.disabled = false;
      if (r.error) { msg(m, F.niceError(/support_tickets|schema cache/i.test(r.error.message) ? 'Не выполнена миграция 008 в Supabase' : r.error.message)); return; }
      F.$('#s-sub', c).value = ''; F.$('#s-body', c).value = ''; msg(m, 'Отправлено. Ответ появится в списке ниже.', true); tickets();
    };

    async function badge() {
      const box = F.$('#b-box', c);
      if (me.badge) { box.innerHTML = `<p style="margin:0">У вас уже есть галочка: <b>${esc((BN[me.badge]) || 'особый статус')}</b>.</p>`; return; }
      const r = await sb.from('badge_requests').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(1);
      if (r.error) { box.innerHTML = `<span class="muted small">${esc(F.niceError(r.error.message))}</span>`; return; }
      const last = r.data[0];
      if (last && last.status === 'pending') { box.innerHTML = `<p style="margin:0">Заявка «${esc(BN[last.badge])}» от ${when(last.created_at)} на рассмотрении. Мы сообщим о решении здесь.</p>`; return; }
      box.innerHTML = `${last ? `<p class="muted small" style="margin-top:0">Прошлая заявка: ${esc(BN[last.badge])} — ${ST[last.status].toLowerCase()}.</p>` : ''}
<div class="form-row"><label for="b-k">Какая галочка</label><select class="input" id="b-k"><option value="verified">Подтверждённый аккаунт</option><option value="blogger">Блогер</option></select></div>
<div class="form-row"><label for="b-r">Почему вам нужна галочка</label><textarea class="input" id="b-r" rows="3" maxlength="1500" placeholder="Расскажите о себе и о том, чем занимаетесь"></textarea></div>
<div class="form-row"><label for="b-l">Ссылка на ваши другие страницы (необязательно)</label><input class="input" id="b-l" maxlength="300" placeholder="https://"></div>
<div class="form-msg" id="b-m" role="alert"></div><button class="btn" id="b-send">Подать заявку</button>`;
      F.$('#b-send', box).onclick = async e => {
        const m = F.$('#b-m', box), why = F.$('#b-r', box).value.trim(); if (!why) { msg(m, 'Расскажите, почему вам нужна галочка'); return; }
        e.target.disabled = true;
        const rr = await sb.from('badge_requests').insert({ user_id: me.id, badge: F.$('#b-k', box).value, reason: why, link: F.$('#b-l', box).value.trim() });
        if (rr.error) { e.target.disabled = false; msg(m, F.niceError(/badge_requests|schema cache/i.test(rr.error.message) ? 'Не выполнена миграция 008 в Supabase' : rr.error.message)); return; }
        F.toast('Заявка отправлена'); badge();
      };
    }
    tickets(); badge();
  });
})(window.Karakuli);
