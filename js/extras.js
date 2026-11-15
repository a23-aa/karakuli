/* Каракули — «приятные мелочи»: эмодзи-панель, кнопка «наверх», счётчик в заголовке вкладки, анимация лайков */
(function (F) {
  'use strict';
  if (!F) return;
  const EMO = '😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😢 😭 😡 👍 👎 👏 🙏 💪 🔥 ✨ 🎉 ❤️ 💔 💯 👀 🙌 😴 🤝 🌸 🍕 ☕ 🎮 🎵'.split(' ');
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  function openPicker(btn, ta) {
    close(); pop = document.createElement('div'); pop.className = 'emo-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Эмодзи');
    pop.innerHTML = EMO.map(e => `<button type="button" aria-label="${e}">${e}</button>`).join('');
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    pop.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    pop.onmousedown = e => e.preventDefault();
    pop.onclick = e => { const b = e.target.closest('button'); if (!b) return; const s = ta.selectionStart || ta.value.length, v = ta.value; ta.value = v.slice(0, s) + b.textContent + v.slice(ta.selectionEnd || s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + b.textContent.length; ta.dispatchEvent(new Event('input', { bubbles: true })); };
  }
  document.addEventListener('click', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.emo-btn')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  function decorate(ta) {
    if (ta.dataset.emo || ta.closest('.modal-ov')) return; ta.dataset.emo = '1';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn emo-btn'; b.title = 'Эмодзи'; b.setAttribute('aria-label', 'Эмодзи'); b.textContent = '😊';
    b.onclick = () => (pop ? close() : openPicker(b, ta)); ta.insertAdjacentElement('afterend', b);
  }
  const scan = () => document.querySelectorAll('.composer textarea, #mt').forEach(decorate);
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); scan();

  // «наверх»
  const up = document.createElement('button'); up.className = 'to-top'; up.setAttribute('aria-label', 'Наверх'); up.title = 'Наверх'; up.hidden = true; up.textContent = '↑';
  up.onclick = () => scrollTo({ top: 0, behavior: 'smooth' }); document.body.appendChild(up);
  addEventListener('scroll', () => { up.hidden = scrollY < 700; }, { passive: true });

  // счётчик непрочитанного в заголовке вкладки
  const base = document.title;
  const tick = () => { try { const c = F.counts && F.counts(); const n = c ? (c.msg || 0) + (c.nt || 0) + (c.fr || 0) : 0; document.title = n ? '(' + (n > 99 ? '99+' : n) + ') ' + base : base; } catch (e) { /* ок */ } };
  setInterval(tick, 3000); tick();

  // анимация лайка
  document.addEventListener('click', e => { const b = e.target.closest('[data-act=like]'); if (!b) return; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); });
})(window.Karakuli);
