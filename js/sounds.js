/* CrownNet — звуки интерфейса: синтезируются на лету (Web Audio), файлов не нужно.
   Мягкие «колокольчики» с плавным затуханием и лёгким эхом. Выключаются в Настройки → Уведомления. */
(function (F) {
  'use strict';
  if (!F) return;
  const KEY = 'cn-sound';
  let ctx = null, bus = null, ringT = null;
  const on = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(), master = ctx.createGain(); master.gain.value = 0.9;
    const dl = ctx.createDelay(0.5), fb = ctx.createGain(), wet = ctx.createGain(); dl.delayTime.value = 0.18; fb.gain.value = 0.28; wet.gain.value = 0.22;
    bus = ctx.createGain(); bus.connect(master); bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(master); master.connect(comp); comp.connect(ctx.destination);
    return ctx;
  }
  /** один «колокольчик»: основной тон + мягкие обертоны */
  function bell(f, t, dur, vol) {
    [[1, 1], [2, 0.28], [2.76, 0.12], [4.1, 0.05]].forEach(([m, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (m > 1 ? m * 0.6 : 1));
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  const P = {
    message: t => { bell(988, t, 0.45, 0.16); bell(1480, t + 0.11, 0.6, 0.15); },
    notify: t => { bell(1175, t, 0.8, 0.17); },
    send: t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.09); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2); },
    ok: t => { bell(784, t, 0.4, 0.12); bell(1175, t + 0.09, 0.55, 0.12); },
    ring: t => { [784, 1047, 1319, 1568].forEach((f, i) => bell(f, t + i * 0.16, 0.7, 0.14)); [1319, 1047].forEach((f, i) => bell(f, t + 0.95 + i * 0.16, 0.7, 0.1)); }
  };
  function play(name) {
    if (!on() || !P[name]) return;
    try { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); P[name](ctx.currentTime + 0.02); } catch (e) { /* без звука */ }
  }
  /** звонок: повторяющаяся мелодия, пока не вызовут ring(false) */
  function ring(flag) {
    clearInterval(ringT); ringT = null;
    if (!flag) return;
    play('ring'); ringT = setInterval(() => play('ring'), 2600);
  }
  // браузер разрешает звук только после первого касания страницы
  const unlock = () => { try { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ок */ } };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, { once: true, passive: true }));
  F.sound = { play, ring, enabled: on, set(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { /* ок */ } if (v) play('ok'); } };
})(window.Karakuli);
