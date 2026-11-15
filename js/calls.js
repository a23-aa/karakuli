/* Каракули — аудио- и видеозвонки 1 на 1 (WebRTC). Сигналы (offer/answer/ICE) идут через таблицу call_signals
   и Supabase Realtime; сами звук и видео — напрямую между браузерами. Работает на любой странице сайта. */
(function (F) {
  'use strict';
  if (!window.RTCPeerConnection) { F.calls = { start() { F.toast('Звонки не поддерживаются этим браузером'); }, init() { } }; return; }
  const cfg = window.KARAKULI_CONFIG || {};
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }].concat(cfg.iceServers || []);
  const mm = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  let cur = null, incoming = null, inited = false, ringTimer = null, ringCtx = null;

  // Promise.resolve запускает запрос сразу (билдер supabase-js выполняется только при then/await)
  const sig = (to, callId, kind, payload) => Promise.resolve(F.sb.from('call_signals').insert({ call_id: callId, sender_id: F.sessionId(), recipient_id: to, kind, payload: payload || {} }));

  /* ---------- сигнал звонка ---------- */
  function ring(on) {
    clearInterval(ringTimer); ringTimer = null;
    if (ringCtx) { try { ringCtx.close(); } catch (e) { /* ок */ } ringCtx = null; }
    if (!on) return;
    try {
      ringCtx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = () => { if (!ringCtx) return; const o = ringCtx.createOscillator(), g = ringCtx.createGain(); o.frequency.value = 440; g.gain.value = 0.08; o.connect(g); g.connect(ringCtx.destination); o.start(); o.stop(ringCtx.currentTime + 0.35); };
      beep(); ringTimer = setInterval(() => { beep(); setTimeout(beep, 450); }, 2200);
    } catch (e) { /* без звука */ }
    if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
  }

  /* ---------- окно звонка ---------- */
  function ui(peerId, video, mode) {
    const u = F.user(peerId), ov = document.createElement('div');
    ov.className = 'call-ov' + (mode === 'in' || mode === 'out' ? ' call-ring' : '');
    ov.innerHTML = `<video class="call-remote" autoplay playsinline hidden></video><video class="call-local" autoplay playsinline muted hidden></video>
<div class="call-info"><img class="ava" src="${F.avatar(u)}" alt=""><b>${F.esc(F.fullName(u))}</b><span class="call-st"></span></div><div class="call-bar"></div>`;
    document.body.appendChild(ov); document.body.classList.add('no-scroll');
    return { ov, remote: ov.querySelector('.call-remote'), local: ov.querySelector('.call-local'), st: ov.querySelector('.call-st'), bar: ov.querySelector('.call-bar') };
  }
  const btn = (k, icon, cls, label) => `<button data-k="${k}" class="${cls || ''}" aria-label="${label}" title="${label}">${F.ic(icon, 26)}</button>`;
  function barConnected(c) {
    c.ui.bar.innerHTML = btn('mute', 'mic', '', 'Микрофон') + (c.video ? btn('cam', 'video', '', 'Камера') : '') + btn('end', 'hangup', 'end', 'Завершить');
  }

  async function media(video) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false }); }
    catch (e) { F.toast(e && e.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону' + (video ? ' и камере' : '') + ' в настройках браузера' : 'Не удалось включить микрофон' + (video ? '/камеру' : '')); return null; }
  }
  function makePc(c) {
    const pc = c.pc = new RTCPeerConnection({ iceServers: ICE });
    c.buf = []; c.remoteSet = false;
    pc.onicecandidate = e => { if (e.candidate) sig(c.peer, c.id, 'ice', e.candidate.toJSON()); };
    pc.ontrack = e => {
      c.ui.remote.srcObject = e.streams[0]; c.ui.remote.hidden = !c.video; c.ui.remote.play().catch(() => { });
      if (c.video) c.ui.ov.querySelector('.call-info').style.display = 'none';
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && !c.t0) connected(c);
      else if (pc.connectionState === 'failed') { F.toast('Не удалось соединиться. Возможно, мешает сеть (нужен TURN-сервер)'); hangup(c, 'failed'); }
      else if (pc.connectionState === 'disconnected') setTimeout(() => { if (cur === c && pc.connectionState !== 'connected') hangup(c, 'lost'); }, 7000);
    };
    c.stream.getTracks().forEach(t => pc.addTrack(t, c.stream));
    if (c.video) { c.ui.local.srcObject = c.stream; c.ui.local.hidden = false; }
  }
  function connected(c) {
    clearTimeout(c.to); ring(false); c.t0 = Date.now(); c.ui.ov.classList.remove('call-ring'); barConnected(c);
    c.tick = setInterval(() => { c.ui.st.textContent = mm((Date.now() - c.t0) / 1000); }, 500); c.ui.st.textContent = '0:00';
  }
  async function flush(c) { c.remoteSet = true; for (const x of c.buf.splice(0)) { try { await c.pc.addIceCandidate(x); } catch (e) { /* ок */ } } }

  /* ---------- исходящий ---------- */
  async function start(peerId, video) {
    if (cur || incoming) { F.toast('Вы уже в звонке'); return; }
    const u = F.user(peerId); if (!u) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { F.toast('Для звонков нужен безопасный адрес (https)'); return; }
    const stream = await media(video); if (!stream) return;
    const c = cur = { id: uuid(), peer: peerId, video, stream, role: 'caller', ui: ui(peerId, video, 'out') };
    c.ui.st.textContent = 'Вызываем…'; c.ui.bar.innerHTML = btn('end', 'hangup', 'end', 'Отменить'); bindUi(c); ring(false);
    makePc(c);
    try {
      const off = await c.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: !!video }); await c.pc.setLocalDescription(off);
      const r = await sig(peerId, c.id, 'offer', { sdp: off.sdp, video: !!video });
      if (r.error) { F.toast(/call_signals|schema cache|relation/i.test(r.error.message) ? 'Звонки не настроены: выполните migration_006 в Supabase' : 'Не удалось позвонить'); cleanup(c); return; }
    } catch (e) { F.toast('Не удалось начать звонок'); cleanup(c); return; }
    c.to = setTimeout(() => hangup(c, 'missed'), 45000);
  }

  /* ---------- входящий ---------- */
  function showIncoming(s) {
    if (cur || incoming) { sig(s.sender_id, s.call_id, 'decline', { busy: true }); return; }
    if (!F.user(s.sender_id)) return;
    const video = !!(s.payload && s.payload.video);
    incoming = { id: s.call_id, peer: s.sender_id, video, sdp: s.payload.sdp, ui: ui(s.sender_id, video, 'in') };
    incoming.ui.st.textContent = video ? 'Видеозвонок…' : 'Звонок…';
    incoming.ui.bar.innerHTML = btn('decline', 'hangup', 'end', 'Отклонить') + btn('accept', video ? 'video' : 'phone', 'yes', 'Ответить');
    bindUi(incoming); ring(true);
    incoming.to = setTimeout(() => { if (incoming && incoming.id === s.call_id) dismissIncoming(); }, 45000);
    if (document.hidden && window.Notification && Notification.permission === 'granted') { try { new Notification(F.fullName(F.user(s.sender_id)), { body: video ? 'Видеозвонок' : 'Входящий звонок', tag: 'call' }); } catch (e) { /* ок */ } }
  }
  function dismissIncoming() { if (!incoming) return; clearTimeout(incoming.to); ring(false); incoming.ui.ov.remove(); document.body.classList.remove('no-scroll'); incoming = null; }
  async function accept() {
    const inc = incoming; if (!inc) return; ring(false); clearTimeout(inc.to);
    const stream = await media(inc.video); if (!stream) { decline(); return; }
    const c = cur = { id: inc.id, peer: inc.peer, video: inc.video, stream, role: 'callee', ui: inc.ui }; incoming = null;
    c.ui.ov.classList.remove('call-ring'); c.ui.st.textContent = 'Соединяем…'; c.ui.bar.innerHTML = btn('end', 'hangup', 'end', 'Завершить'); bindUi(c);
    makePc(c);
    try {
      await c.pc.setRemoteDescription({ type: 'offer', sdp: inc.sdp }); await flush(c);
      const ans = await c.pc.createAnswer(); await c.pc.setLocalDescription(ans);
      await sig(c.peer, c.id, 'answer', { sdp: ans.sdp });
    } catch (e) { F.toast('Не удалось ответить на звонок'); hangup(c, 'failed'); }
  }
  function decline() { if (!incoming) return; sig(incoming.peer, incoming.id, 'decline', {}); dismissIncoming(); }

  /* ---------- завершение ---------- */
  function cleanup(c) {
    clearTimeout(c.to); clearInterval(c.tick); ring(false);
    try { c.pc && c.pc.close(); } catch (e) { /* ок */ }
    c.stream.getTracks().forEach(t => t.stop()); c.ui.ov.remove(); document.body.classList.remove('no-scroll');
    if (cur === c) cur = null;
    F.sb.from('call_signals').delete().eq('call_id', c.id).then(() => { }, () => { });
  }
  function hangup(c, reason, remote) {
    if (!c || c.done) return; c.done = true;
    if (!remote) sig(c.peer, c.id, 'end', { reason }).then(() => { }, () => { });
    const secs = c.t0 ? Math.round((Date.now() - c.t0) / 1000) : 0;
    if (c.role === 'caller') { // запись о звонке в чате оставляет тот, кто звонил
      const text = secs ? 'Звонок · ' + mm(secs) : reason === 'declined' ? 'Отклонённый звонок' : reason === 'failed' ? 'Звонок не состоялся' : 'Пропущенный звонок';
      try { if (F.sendMessage(c.peer, text, null, { kind: 'call', dur: secs })) window.dispatchEvent(new Event('karakuli:update')); } catch (e) { /* ок */ }
    }
    cleanup(c);
  }
  function bindUi(c) {
    c.ui.ov.addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
      if (k === 'accept') accept(); else if (k === 'decline') decline();
      else if (k === 'end') hangup(cur || c, c.t0 ? 'end' : 'cancel');
      else if (k === 'mute') { const t = c.stream.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; b.classList.toggle('off', !t.enabled); b.innerHTML = F.ic(t.enabled ? 'mic' : 'micoff', 26); } }
      else if (k === 'cam') { const t = c.stream.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; b.classList.toggle('off', !t.enabled); } }
    });
  }

  /* ---------- входящие сигналы ---------- */
  async function onSignal(s) {
    if (!s || s.recipient_id !== F.sessionId()) return;
    if (s.kind === 'offer') { if (Date.now() - Date.parse(s.created_at) < 50000) showIncoming(s); return; }
    if (incoming && incoming.id === s.call_id && (s.kind === 'end' || s.kind === 'decline')) { dismissIncoming(); return; }
    const c = cur; if (!c || c.id !== s.call_id) return;
    if (s.kind === 'answer' && c.role === 'caller' && !c.remoteSet) { try { await c.pc.setRemoteDescription({ type: 'answer', sdp: s.payload.sdp }); await flush(c); c.ui.st.textContent = 'Соединяем…'; } catch (e) { hangup(c, 'failed'); } }
    else if (s.kind === 'ice') { if (c.remoteSet) { try { await c.pc.addIceCandidate(s.payload); } catch (e) { /* ок */ } } else c.buf.push(s.payload); }
    else if (s.kind === 'decline') { F.toast(s.payload && s.payload.busy ? 'Абонент занят' : 'Звонок отклонён'); hangup(c, 'declined', true); }
    else if (s.kind === 'end') hangup(c, 'end', true);
  }

  async function init() {
    if (inited || !F.sb || !F.sessionId()) return; inited = true;
    const me = F.sessionId();
    try { F.sb.channel('calls-' + me).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals', filter: 'recipient_id=eq.' + me }, p => onSignal(p.new)).subscribe(); } catch (e) { /* без realtime звонки не примутся */ }
    // если звонок начался, пока страница открывалась
    try {
      const since = new Date(Date.now() - 40000).toISOString();
      const r = await F.sb.from('call_signals').select('*').eq('recipient_id', me).gte('created_at', since).order('id');
      if (r.data) { const done = new Set(r.data.filter(x => x.kind === 'end' || x.kind === 'decline').map(x => x.call_id)); r.data.filter(x => x.kind === 'offer' && !done.has(x.call_id)).slice(-1).forEach(showIncoming); }
    } catch (e) { /* таблицы ещё нет */ }
  }
  F.calls = { start, init };
})(window.Karakuli);
