/* Каракули — уведомления: список, отметка прочитанных, переход к источнику. */
(function (F) {
  'use strict';
  if (document.body.dataset.page !== 'notifications') return;
  F.page('notifications', { right: false }, c => {
    const me = F.me();
    let only = false;
    const mine = () => F.db().notifications.filter(n => n.userId === me.id).sort((a, b) => b.ts - a.ts);

    function who(n) {
      if (n.type === 'community_post') { const cm = F.community(n.fromId); return cm ? { name: 'Сообщество ' + cm.name, ava: F.cAvatar(cm), round: '50%' } : null; }
      const u = F.user(n.fromId); return u ? { name: F.fullName(u), ava: F.avatar(u), round: '50%' } : null;
    }
    function render() {
      const all = mine(), list = only ? all.filter(n => !n.read) : all, unread = all.filter(n => !n.read).length;
      c.innerHTML = `<div class="toolbar"><h1 class="page-title">Уведомления</h1><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-a="filter">${only ? 'Показать все' : 'Только новые' + (unread ? ' (' + unread + ')' : '')}</button><button class="btn btn-sm" data-a="readall"${unread ? '' : ' disabled'}>${F.ic('check', 16)} Прочитать все</button></div></div>
<section class="card" style="overflow:hidden">${list.length ? list.map(n => {
        const w = who(n); if (!w) return ''; const t = F.NTYPES[n.type] || { ic: 'bell', text: '' };
        const txt = n.type === 'community_post' ? `<b>${F.esc(w.name)}</b> ${t.text}` : `<b>${F.esc(w.name)}</b> ${t.text}`;
        return `<a class="notif${n.read ? '' : ' unread'}" href="${F.esc(n.link || '#')}" data-n="${n.id}"><span class="n-ic ${t.cls || ''}"><img src="${w.ava}" alt="" style="border-radius:${w.round}"></span><span class="grow"><div>${txt}</div><div class="muted small">${F.timeAgo(n.ts)}</div></span><span style="color:var(--accent)">${F.ic(t.ic, 20)}</span></a>`;
      }).join('') : `<div class="empty">${F.ic('bell', 40)}<div>${only ? 'Новых уведомлений нет' : 'Уведомлений пока нет'}</div></div>`}</section>`;
    }
    c.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'readall') { mine().forEach(n => n.read = true); F.save(); F.badges(); F.toast('Все уведомления прочитаны'); }
        else only = !only;
        render(); return;
      }
      const n = e.target.closest('[data-n]');
      if (n) { const x = F.db().notifications.find(i => i.id === n.dataset.n); if (x && !x.read) { x.read = true; F.save(); } }
    });
    window.addEventListener('karakuli:update', render);
    render();
  });
})(window.Karakuli);
