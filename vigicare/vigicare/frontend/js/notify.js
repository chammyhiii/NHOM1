(function (VC) {
  'use strict';

  const { $, el, escape } = VC.utils;

  const toastRoot = () => $('#toasts');

  function toast({ title, message = '', type = 'info', duration = 4200 }) {
    const icons = { info: 'ℹ', ok: '✓', warn: '⚠', danger: '⚠' };
    const node = el('div', { class: `toast is-${type}` }, [
      el('div', { class: 'toast__icon', html: `<span style="color:var(--${type === 'info' ? 'primary' : type})">${icons[type] || '•'}</span>` }),
      el('div', { class: 'toast__body' }, [
        el('div', { class: 'toast__title', text: title }),
        message ? el('div', { class: 'toast__msg', html: escape(message) }) : null
      ]),
      el('button', { class: 'toast__close', 'aria-label': 'Đóng', onclick: () => remove() }, '✕')
    ]);

    toastRoot().appendChild(node);

    let timer = null;
    const remove = () => {
      clearTimeout(timer);
      node.style.transition = 'opacity .2s, transform .2s';
      node.style.opacity = '0';
      node.style.transform = 'translateX(40px)';
      setTimeout(() => node.remove(), 220);
    };
    if (duration > 0) timer = setTimeout(remove, duration);
    return remove;
  }

  const modalRoot = () => $('#modal-root');

  function modal({ title, body, actions = [], width = 560 }) {
    return new Promise((resolve) => {
      const root = modalRoot();
      root.innerHTML = '';
      const backdrop = el('div', { class: 'modal-backdrop' });
      const close = (value) => {
        root.classList.remove('is-open');
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };

      const actionBtns = actions.map(a =>
        el('button', {
          class: `btn ${a.class || 'btn--ghost'}`,
          onclick: () => close(a.value !== undefined ? a.value : a.label)
        }, a.label)
      );

      const dialog = el('div', { class: 'modal', style: `width:min(${width}px, calc(100vw - 32px))` }, [
        el('div', { class: 'modal__head' }, [
          el('div', { class: 'modal__title', text: title }),
          el('button', { class: 'icon-btn', onclick: () => close(null), html: '✕' })
        ]),
        el('div', { class: 'modal__body' }, typeof body === 'string' ? [el('div', { html: body })] : [body]),
        actionBtns.length ? el('div', { class: 'modal__foot' }, actionBtns) : null
      ]);

      backdrop.addEventListener('click', () => close(null));
      root.appendChild(backdrop);
      root.appendChild(dialog);
      root.classList.add('is-open');
      document.addEventListener('keydown', onKey);
    });
  }

  function confirm(message, { title = 'Xác nhận', okLabel = 'Đồng ý', cancelLabel = 'Hủy', danger = false } = {}) {
    return modal({
      title,
      body: `<p style="color:var(--text-dim);line-height:1.6">${escape(message)}</p>`,
      actions: [
        { label: cancelLabel, value: false, class: 'btn--ghost' },
        { label: okLabel, value: true, class: danger ? 'btn--danger' : 'btn--primary' }
      ]
    });
  }

  let audioCtx = null;
  function ensureCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep({ freq = 880, duration = 0.14, type = 'sine', volume = 0.14 } = {}) {
    const ctx = ensureCtx(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  function alarm(kind = 'alert') {
    if (!VC.store.state.sound) return;

    if (kind === 'alert') {
      beep({ freq: 988, duration: 0.16, type: 'triangle', volume: 0.18 });
      setTimeout(() => beep({ freq: 740, duration: 0.22, type: 'triangle', volume: 0.2 }), 180);
      setTimeout(() => beep({ freq: 988, duration: 0.16, type: 'triangle', volume: 0.18 }), 460);
    } else if (kind === 'beep') {
      beep({ freq: 440, duration: 0.08, type: 'sine', volume: 0.08 });
    } else if (kind === 'ok') {
      beep({ freq: 660, duration: 0.1, type: 'sine', volume: 0.12 });
      setTimeout(() => beep({ freq: 990, duration: 0.14, type: 'sine', volume: 0.12 }), 120);
    } else {
      beep({ freq: 520, duration: 0.1, type: 'sine', volume: 0.1 });
    }
  }

  VC.notify = { toast, modal, confirm, beep, alarm };
})(window.VC);