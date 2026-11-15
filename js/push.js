/* Каракули — push-уведомления: приходят на телефон/компьютер, даже когда сайт закрыт.
   Подписка хранится в базе (таблица push_subscriptions), отправляет Edge Function «push». */
(function (F) {
  'use strict';
  const cfg = window.KARAKULI_CONFIG || {}, key = cfg.vapidPublicKey;
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!key;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  let regP = null;
  const reg = () => regP || (regP = navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') reg().catch(() => { });

  async function current() { try { return await (await reg()).pushManager.getSubscription(); } catch (e) { return null; } }
  async function save(sub) {
    const j = sub.toJSON();
    const r = await F.sb.rpc('push_register', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent.slice(0, 200) });
    if (r.error) throw new Error(/push_register|schema cache|function/i.test(r.error.message) ? 'Не выполнена миграция 007 (push) в Supabase' : r.error.message);
  }
  async function status() {
    if (ios && !standalone) return 'install';
    if (!ok) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return (Notification.permission === 'granted' && await current()) ? 'on' : 'off';
  }
  async function enable() {
    if (!ok) throw new Error('Этот браузер не поддерживает push-уведомления');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Уведомления запрещены в настройках браузера');
    const r = await reg(); let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await save(sub);
  }
  async function disable() {
    const sub = await current(); if (!sub) return;
    try { await F.sb.rpc('push_unregister', { p_endpoint: sub.endpoint }); } catch (e) { /* ок */ }
    await sub.unsubscribe();
  }
  /** при каждом заходе подтверждаем, что эта подписка принадлежит текущему аккаунту */
  async function sync() {
    if (!ok || Notification.permission !== 'granted' || !F.sb) return;
    try { if (sessionStorage.getItem('kr-push-sync') === F.sessionId()) return; const s = await current(); if (s) { await save(s); sessionStorage.setItem('kr-push-sync', F.sessionId()); } } catch (e) { /* ок */ }
  }
  function banner() {
    let skip = false; try { skip = !!localStorage.getItem('kr-push-skip'); } catch (e) { /* ок */ }
    const host = document.querySelector('#comp'); if (skip || !host || document.getElementById('push-banner')) return;
    status().then(st => {
      if (st !== 'off' && st !== 'install') return;
      const el = document.createElement('div'); el.id = 'push-banner'; el.className = 'card card-pad push-banner';
      el.innerHTML = st === 'install'
        ? `<div class="grow"><b>Уведомления на iPhone</b><div class="muted small">Нажмите «Поделиться» → «На экран “Домой”», откройте Каракули с иконки и включите уведомления в настройках.</div></div><button class="btn btn-ghost btn-sm" data-pb="skip">Понятно</button>`
        : `<div class="grow"><b>Получать уведомления?</b><div class="muted small">Сообщения, звонки и начало ивентов будут приходить на это устройство, даже когда сайт закрыт.</div></div><button class="btn btn-sm" data-pb="on">Включить</button><button class="btn btn-ghost btn-sm" data-pb="skip">Не сейчас</button>`;
      host.parentNode.insertBefore(el, host);
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-pb]'); if (!b) return;
        if (b.dataset.pb === 'skip') { try { localStorage.setItem('kr-push-skip', '1'); } catch (x) { /* ок */ } el.remove(); return; }
        try { await enable(); F.toast('Уведомления включены'); el.remove(); } catch (err) { F.toast(String(err.message || err)); }
      });
    });
  }
  F.push = { ok, status, enable, disable, init() { sync(); if (document.body.dataset.page === 'index') banner(); } };
})(window.Karakuli);
