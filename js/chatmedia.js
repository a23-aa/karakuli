/* Каракули — вложения чата: голосовые, кружки (видео-сообщения), плееры.
   Запись — MediaRecorder в браузере; файл сразу уходит в хранилище, в сообщении остаётся ссылка. */
(function (F) {
  'use strict';
  const mm = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const pick = list => { if (!window.MediaRecorder) return ''; for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m; return ''; };
  const micErr = e => F.toast(e && e.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону/камере в настройках браузера' : 'Не удалось включить микрофон/камеру на этом устройстве');

  /* ---------- пузырь сообщения по типу ---------- */
  function bubble(m) {
    const u = F.esc(m.photo || '');
    switch (m.kind) {
      case 'video': return `<video class="mvid" src="${u}#t=0.1" controls playsinline preload="metadata"></video>`;
      case 'voice': return `<div class="voice" data-src="${u}" data-dur="${m.dur || 0}"><button class="vplay" type="button" aria-label="Слушать">${F.ic('play', 18)}</button><div class="vbar"><i></i></div><span class="vt">${mm(m.dur || 0)}</span></div>`;
      case 'circle': return `<div class="circle" data-src="${u}"><video src="${u}#t=0.1" playsinline preload="metadata" loop></video><span class="ctime">${mm(m.dur || 0)}</span><i class="cplay">${F.ic('play', 28)}</i></div>`;
      case 'file': return `<a class="mfile" href="${u}" target="_blank" rel="noopener" download>${F.ic('file', 22)}<span>${F.esc(m.fname || 'Файл')}</span></a>`;
      case 'call': return '';
      default: return m.photo ? `<img src="${u}" alt="Фото" data-lb="${m.id}">` : '';
    }
  }
  F.msgPreview = (m, meId) => {
    const who = m.from === meId ? 'Вы: ' : '';
    const t = { photo: '📷 Фото', video: '🎬 Видео', voice: '🎤 Голосовое', circle: '⭕ Кружок', file: '📎 ' + (m.fname || 'Файл'), call: '📞 ' + (m.text || 'Звонок') }[m.kind || (m.photo ? 'photo' : 'text')];
    return who + (t && !(m.kind === 'photo' && m.text) ? t : F.esc(m.text));
  };

  /* ---------- проигрыватели ---------- */
  let audio = null, audioEl = null;
  function stopAudio() { if (audio) { audio.pause(); audio = null; } if (audioEl) { audioEl.classList.remove('playing'); const b = audioEl.querySelector('.vplay'); if (b) b.innerHTML = F.ic('play', 18); audioEl = null; } }
  function tickBar(el, a) { const d = +el.dataset.dur || (isFinite(a.duration) ? a.duration : 0); el.querySelector('.vbar i').style.width = d ? Math.min(100, a.currentTime / d * 100) + '%' : '0'; el.querySelector('.vt').textContent = mm(a.currentTime > 0 ? a.currentTime : d); }
  function playVoice(el) {
    if (audioEl === el && audio) { stopAudio(); return; }
    stopAudio(); document.querySelectorAll('.circle.on video').forEach(v => v.pause());
    audio = new Audio(el.dataset.src); audioEl = el; el.classList.add('playing'); el.querySelector('.vplay').innerHTML = F.ic('pause', 18);
    const a = audio;
    a.addEventListener('timeupdate', () => { if (audio === a) tickBar(el, a); });
    a.addEventListener('ended', () => { if (audio === a) { el.querySelector('.vbar i').style.width = '0'; el.querySelector('.vt').textContent = mm(+el.dataset.dur || 0); stopAudio(); } });
    a.addEventListener('error', () => { if (audio === a) { F.toast('Не удалось воспроизвести'); stopAudio(); } });
    a.play().catch(() => { F.toast('Не удалось воспроизвести'); stopAudio(); });
  }
  function toggleCircle(el) {
    const v = el.querySelector('video'), on = el.classList.contains('on');
    document.querySelectorAll('.circle.on').forEach(c => { if (c !== el) { c.classList.remove('on'); c.querySelector('video').pause(); } });
    stopAudio();
    if (on && !v.paused) { v.pause(); el.classList.remove('on'); return; }
    el.classList.add('on'); v.currentTime = 0; v.play().catch(() => el.classList.remove('on'));
    v.onended = () => el.classList.remove('on');
  }
  /** Вешается один раз на контейнер сообщений. */
  function bind(root) {
    if (root._cm) return; root._cm = true;
    root.addEventListener('click', e => {
      const v = e.target.closest('.voice'); if (v) { playVoice(v); return; }
      const c = e.target.closest('.circle'); if (c) toggleCircle(c);
    });
  }
  /** После перерисовки возвращает вид «играет» (звук не прерывается). */
  function sync(root) { if (audio && audioEl) { const el = [...root.querySelectorAll('.voice')].find(x => x.dataset.src === audio.src); if (el) { audioEl = el; el.classList.add('playing'); el.querySelector('.vplay').innerHTML = F.ic('pause', 18); tickBar(el, audio); } } }

  /* ---------- запись голосового ---------- */
  async function voice(host, done) {
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { micErr(e); return; }
    const mime = pick(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);
    let rec; try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); F.toast('Запись звука не поддерживается в этом браузере'); return; }
    const chunks = [], t0 = Date.now(); let cancelled = false, tm;
    const bar = document.createElement('div'); bar.className = 'recbar';
    bar.innerHTML = `<button class="icon-btn" data-r="cancel" type="button" aria-label="Отменить">✕</button><i class="recdot"></i><b class="rect">0:00</b><span class="muted small grow">Идёт запись…</span><button class="btn" data-r="send" type="button">${F.ic('send', 18)}</button>`;
    host.appendChild(bar);
    const clean = () => { clearInterval(tm); stream.getTracks().forEach(t => t.stop()); bar.remove(); };
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { const dur = Math.max(1, Math.round((Date.now() - t0) / 1000)); clean(); if (cancelled) return; const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] }); if (blob.size < 800) { F.toast('Слишком короткая запись'); return; } done(blob, dur); };
    rec.start(250);
    tm = setInterval(() => { const s = (Date.now() - t0) / 1000; bar.querySelector('.rect').textContent = mm(s); if (s >= 300) rec.stop(); }, 250);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; if (b.dataset.r === 'cancel') cancelled = true; if (rec.state !== 'inactive') rec.stop(); });
  }

  /* ---------- запись кружка ---------- */
  /* Видео рисуется на квадратный canvas и пишется оттуда: так камеру можно переключать прямо во время записи, запись не прерывается. */
  async function circle(done) {
    let facing = 'user', mic = null, cam = null, rec, chunks = [], t0 = 0, tm, blob = null, dur = 0, cancelled = false, raf = 0, switching = false;
    const SZ = 480, cvs = document.createElement('canvas'); cvs.width = cvs.height = SZ; const g = cvs.getContext('2d');
    const ov = document.createElement('div'); ov.className = 'circ-ov';
    const bar0 = () => `<button class="icon-btn" data-k="close" type="button" aria-label="Закрыть">✕</button><button class="circ-rec" data-k="rec" type="button" aria-label="Запись"><i></i></button><button class="icon-btn" data-k="flip" type="button" aria-label="Сменить камеру" title="Сменить камеру">${F.ic('camflip', 22)}</button>`;
    ov.innerHTML = `<div class="circ-box"><div class="circ-ring"><video class="circ-v" playsinline muted></video><svg class="circ-prog" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47"/></svg></div>
<div class="circ-t">0:00 / 1:00</div><div class="circ-bar">${bar0()}</div></div>`;
    document.body.appendChild(ov); document.body.classList.add('no-scroll');
    const v = ov.querySelector('.circ-v'), prog = ov.querySelector('.circ-prog circle'), $t = ov.querySelector('.circ-t');
    prog.style.strokeDasharray = 295.3; prog.style.strokeDashoffset = 295.3;
    const stopCam = () => { if (cam) cam.getTracks().forEach(t => t.stop()); cam = null; };
    const stopAll = () => { cancelAnimationFrame(raf); clearInterval(tm); stopCam(); if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; };
    function paint() { // кадр с камеры → квадрат (по центру), зеркально для фронтальной камеры
      raf = requestAnimationFrame(paint);
      if (v.readyState < 2 || !v.videoWidth || !cam) return;
      const w = v.videoWidth, h = v.videoHeight, sq = Math.min(w, h);
      g.save(); if (facing === 'user') { g.translate(SZ, 0); g.scale(-1, 1); }
      g.drawImage(v, (w - sq) / 2, (h - sq) / 2, sq, sq, 0, 0, SZ, SZ); g.restore();
    }
    async function openCam(first) { // меняет только видеодорожку; микрофон остаётся
      switching = true;
      try {
        if (first) {
          const st = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 720 } } });
          mic = new MediaStream(st.getAudioTracks()); cam = new MediaStream(st.getVideoTracks());
        } else {
          const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing }, width: { ideal: 720 }, height: { ideal: 720 } } });
          stopCam(); cam = st;
        }
      } catch (e) {
        switching = false;
        if (first) { micErr(e); close(); return false; }
        facing = facing === 'user' ? 'environment' : 'user'; F.toast('Другой камеры на этом устройстве нет'); return false;
      }
      v.srcObject = cam; v.muted = true; v.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none'; await v.play().catch(() => { }); switching = false; return true;
    }
    function close() { stopAll(); ov.remove(); document.body.classList.remove('no-scroll'); }
    function start() {
      const mime = pick(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']);
      let out; try { out = new MediaStream([...cvs.captureStream(30).getVideoTracks(), ...mic.getAudioTracks()]); rec = new MediaRecorder(out, Object.assign({ videoBitsPerSecond: 800000, audioBitsPerSecond: 32000 }, mime ? { mimeType: mime } : {})); } catch (e) { F.toast('Запись видео не поддерживается в этом браузере'); return; }
      chunks = []; cancelled = false; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => { clearInterval(tm); dur = Math.max(1, Math.round((Date.now() - t0) / 1000)); if (cancelled) return; blob = new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] }); review(); };
      t0 = Date.now(); rec.start(500); ov.classList.add('recording'); ov.querySelector('.circ-rec').setAttribute('aria-label', 'Остановить');
      tm = setInterval(() => { const s = (Date.now() - t0) / 1000; $t.textContent = mm(s) + ' / 1:00'; prog.style.strokeDashoffset = 295.3 * (1 - Math.min(1, s / 60)); if (s >= 60) rec.stop(); }, 200);
    }
    function review() {
      cancelAnimationFrame(raf); stopCam(); v.srcObject = null; v.style.transform = 'none'; v.muted = false; v.loop = true;
      v.src = URL.createObjectURL(blob); v.play().catch(() => { });
      ov.classList.remove('recording'); ov.classList.add('review'); ov.querySelector('.circ-bar').innerHTML = `<button class="btn btn-ghost" data-k="again" type="button">Заново</button><button class="btn" data-k="send" type="button">${F.ic('send', 18)} Отправить</button>`;
    }
    ov.addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
      if (k === 'close') { cancelled = true; if (rec && rec.state !== 'inactive') rec.stop(); close(); }
      else if (k === 'flip') { if (switching) return; facing = facing === 'user' ? 'environment' : 'user'; b.classList.add('busy'); await openCam(false); b.classList.remove('busy'); }
      else if (k === 'rec') { if (rec && rec.state === 'recording') rec.stop(); else start(); }
      else if (k === 'again') { ov.classList.remove('review'); ov.querySelector('.circ-bar').innerHTML = bar0(); v.loop = false; v.removeAttribute('src'); $t.textContent = '0:00 / 1:00'; prog.style.strokeDashoffset = 295.3; blob = null; facing = 'user'; mic && mic.getTracks().forEach(t => t.stop()); await openCam(true); paint(); }
      else if (k === 'send') { const bl = blob, d = dur; close(); done(bl, d); }
    });
    if (await openCam(true)) paint();
  }

  F.chatmedia = { bubble, bind, sync, voice, circle, stopAudio };
})(window.Karakuli);
