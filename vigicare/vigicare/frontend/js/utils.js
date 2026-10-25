(function (VC) {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function escape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const fmtTimeShort = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDate = (d = new Date()) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const fmtDateTime = (d = new Date()) => `${fmtTime(d)} — ${fmtDate(d)}`;
  const fmtDateInput = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  function fmtRelative(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'vừa xong';
    if (diff < 60) return `${diff} giây trước`;
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  const storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch {} }
  };

  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  function throttle(fn, wait = 100) {
    let last = 0, timer = null;
    return function (...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, wait - (now - last));
      }
    };
  }

  function debounce(fn, wait = 250) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function toCSV(rows, columns) {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = columns.map(c => esc(c.label)).join(',');
    const body = rows.map(r => columns.map(c => esc(c.get(r))).join(',')).join('\n');
    return `${head}\n${body}`;
  }

  function download(filename, content, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob(['\ufeff' + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }

  function icon(name, cls = '') {
    const path = VC.ICONS[name] || '';
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
      const k = keyFn(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  VC.utils = {
    $, $$, el, escape, icon,
    fmtTime, fmtTimeShort, fmtDate, fmtDateTime, fmtDateInput, fmtRelative, fmtBytes,
    storage, rand, randInt, pick, uid,
    throttle, debounce, toCSV, download, groupBy
  };
})(window.VC);