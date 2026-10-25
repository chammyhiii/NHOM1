/* ============================================================
   SafeZone-HD — zones.js
   Quản lý vùng cấm: vẽ polygon, lưu, xóa
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { $, el, icon, escape } = utils;

  // ---- State ----
  let zones = [];                     // Danh sách vùng từ API
  let isDrawing = false;              // Đang vẽ polygon?
  let currentPoints = [];             // Các điểm đang vẽ [[x,y],...]
  let videoEl = null;                 // Thẻ <video> (thực tế là <img> MJPEG)
  let canvasEl = null;                // Canvas overlay
  let ctx = null;

  // ---- Render trang ----
  function renderZones(root) {
    // Reset state khi render lại — tránh dirty state từ lần trước
    isDrawing = false;
    currentPoints = [];
    videoEl = null;
    canvasEl = null;
    ctx = null;
    root.innerHTML = '';

    const wrap = el('div', { class: 'grid-2' });

    // === Cột trái: Video + Canvas overlay ===
    const left = el('div');
    left.appendChild(videoCard());
    wrap.appendChild(left);

    // === Cột phải: Danh sách vùng ===
    const right = el('div');
    right.appendChild(zoneListCard());
    right.appendChild(zoneFormCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    // Load danh sách vùng sau khi DOM đã render
    requestAnimationFrame(() => {
      initCanvas();
      loadZones();
    });
  }

  // ---- Card video + canvas vẽ ----
  function videoCard() {
    const card = el('div', { class: 'card' });

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Vẽ vùng cấm trên camera'
      ]),
      el('span', { class: 'badge badge--primary', id: 'drawStatus' }, 'Click để bắt đầu')
    ]));

    const stage = el('div', {
      style: 'position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:16/10'
    });

    const img = el('img', {
      src: VC.api.url('/stream'),
      alt: 'Live',
      style: 'width:100%;height:100%;object-fit:cover;display:block'
    });
    stage.appendChild(img);

    const canvas = el('canvas', {
      id: 'zoneCanvas',
      style: 'position:absolute;inset:0;width:100%;height:100%;cursor:crosshair'
    });
    stage.appendChild(canvas);

    card.appendChild(stage);

    // Nút điều khiển
    card.appendChild(el('div', { class: 'video-controls', style: 'margin-top:12px' }, [
      el('button', {
        class: 'btn btn--primary',
        id: 'startDrawBtn',
        html: '✏️ Bắt đầu vẽ',
        onclick: startDrawing
      }),
      el('button', {
        class: 'btn btn--ghost',
        id: 'finishDrawBtn',
        html: '✓ Hoàn thành',
        disabled: 'disabled',
        onclick: finishDrawing
      }),
      el('button', {
        class: 'btn btn--flat',
        id: 'cancelDrawBtn',
        html: '✕ Hủy',
        disabled: 'disabled',
        onclick: cancelDrawing
      })
    ]));

    return card;
  }

  // ---- Card danh sách vùng ----
  function zoneListCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Danh sách vùng'
      ]),
      el('span', { class: 'badge badge--primary', id: 'zoneCount' }, '0')
    ]));
    card.appendChild(el('div', { id: 'zoneList' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📭' }),
        el('div', { class: 'empty__title', text: 'Chưa có vùng nào' })
      ])
    ]));
    return card;
  }

  // ---- Card form nhập thông tin ----
  function zoneFormCard() {
    const card = el('div', { class: 'card', id: 'zoneFormCard', style: 'display:none' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Thông tin vùng'
      ])
    ]));

    const form = el('form', { id: 'zoneForm' });

    form.appendChild(field('zoneName', 'Tên vùng', 'text', 'Mặt hồ đá'));
    form.appendChild(field('zoneDesc', 'Mô tả', 'text', 'Khu vực nguy hiểm'));

    // Severity
    const sevField = el('div', { class: 'field' });
    sevField.appendChild(el('label', { class: 'field__label' }, 'Mức nguy hiểm'));
    const sevSel = el('select', { class: 'select', id: 'zoneSeverity' });
    ['low', 'medium', 'high', 'critical'].forEach(v => {
      sevSel.appendChild(el('option', { value: v }, v.toUpperCase()));
    });
    sevSel.value = 'high';
    sevField.appendChild(sevSel);
    form.appendChild(sevField);

    form.appendChild(field('zoneDwell', 'Cảnh báo sau (giây)', 'number', '30'));

    form.appendChild(el('button', {
      type: 'submit',
      class: 'btn btn--primary btn--block',
      html: '💾 Lưu vùng'
    }));

    form.addEventListener('submit', saveZone);
    card.appendChild(form);
    return card;
  }

  function field(id, label, type, placeholder) {
    const f = el('div', { class: 'field' });
    f.appendChild(el('label', { class: 'field__label', text: label }));
    f.appendChild(el('input', { class: 'input', id, type, placeholder }));
    return f;
  }

  // ---- Canvas ----
  function initCanvas() {
    videoEl = document.querySelector('.video img') || document.querySelector('img[src*="stream"]');
    canvasEl = document.getElementById('zoneCanvas');
    if (!canvasEl) return;

    // Đặt kích thước canvas = kích thước hiển thị
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width;
    canvasEl.height = rect.height;
    ctx = canvasEl.getContext('2d');

    // Gắn sự kiện click để vẽ điểm
    canvasEl.addEventListener('click', onCanvasClick);
    canvasEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isDrawing && currentPoints.length >= 3) finishDrawing();
    });

    // Vẽ lại các zone đã có
    redraw();
  }

  function onCanvasClick(e) {
    if (!isDrawing) return;

    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentPoints.push([x, y]);
    redraw();
  }

  function redraw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Vẽ các zone đã lưu
    zones.forEach(z => drawPolygon(z.polygon, z.severity === 'critical' ? '#ef4444' : '#f59e0b', 0.2, 2));

    // Vẽ zone đang vẽ
    if (isDrawing && currentPoints.length > 0) {
      // Vẽ đường nối
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      currentPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();

      // Nếu >= 3 điểm, vẽ đường đóng (nối điểm cuối về đầu)
      if (currentPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[currentPoints.length - 1][0], currentPoints[currentPoints.length - 1][1]);
        ctx.lineTo(currentPoints[0][0], currentPoints[0][1]);
        ctx.stroke();
      }

      // Vẽ các điểm
      currentPoints.forEach(p => {
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }

  function drawPolygon(polygon, color, alpha, lineWidth) {
    if (!polygon || polygon.length < 3) return;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    polygon.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  // ---- Vẽ ----
  function startDrawing() {
    isDrawing = true;
    currentPoints = [];
    const startBtn = document.getElementById('startDrawBtn');
    const finishBtn = document.getElementById('finishDrawBtn');
    const cancelBtn = document.getElementById('cancelDrawBtn');
    const statusEl = document.getElementById('drawStatus');
    if (startBtn) startBtn.disabled = true;
    if (finishBtn) finishBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (statusEl) statusEl.textContent = 'Click để thêm điểm';
    redraw();
  }

  function finishDrawing() {
    if (currentPoints.length < 3) {
      notify.toast({ title: 'Cần ít nhất 3 điểm', type: 'warn' });
      return;
    }
    isDrawing = false;
    const startBtn = document.getElementById('startDrawBtn');
    const finishBtn = document.getElementById('finishDrawBtn');
    const cancelBtn = document.getElementById('cancelDrawBtn');
    const statusEl = document.getElementById('drawStatus');
    const formCard = document.getElementById('zoneFormCard');
    if (startBtn) startBtn.disabled = false;
    if (finishBtn) finishBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Đã vẽ xong';
    if (formCard) formCard.style.display = 'block';
  }

  function cancelDrawing() {
    isDrawing = false;
    currentPoints = [];
    const startBtn = document.getElementById('startDrawBtn');
    const finishBtn = document.getElementById('finishDrawBtn');
    const cancelBtn = document.getElementById('cancelDrawBtn');
    const statusEl = document.getElementById('drawStatus');
    const formCard = document.getElementById('zoneFormCard');
    if (startBtn) startBtn.disabled = false;
    if (finishBtn) finishBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (statusEl) statusEl.textContent = 'Đã hủy';
    if (formCard) formCard.style.display = 'none';
    redraw();
  }

  // ---- API ----
  async function loadZones() {
    try {
      const r = await fetch(VC.api.url('/api/zones'));
      const data = await r.json();
      zones = data.items || [];
      renderZoneList();
      redraw();
    } catch (e) {
      console.error('Load zones failed:', e);
    }
  }

  async function saveZone(e) {
    e.preventDefault();
    const nameEl = document.getElementById('zoneName');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      notify.toast({ title: 'Thiếu tên vùng', type: 'warn' });
      return;
    }

    const payload = {
      name,
      description: (document.getElementById('zoneDesc') || {}).value || '',
      polygon: currentPoints,
      severity: (document.getElementById('zoneSeverity') || {}).value || 'high',
      maxDwellSeconds: parseInt((document.getElementById('zoneDwell') || {}).value) || 30
    };

    try {
      const r = await fetch(VC.api.url('/api/zones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);

      notify.toast({ title: 'Đã lưu vùng', message: name, type: 'ok' });

      // Reset
      currentPoints = [];
      const form = document.getElementById('zoneForm');
      const formCard = document.getElementById('zoneFormCard');
      const statusEl = document.getElementById('drawStatus');
      if (form) form.reset();
      if (formCard) formCard.style.display = 'none';
      if (statusEl) statusEl.textContent = 'Click để bắt đầu';

      loadZones();
    } catch (e) {
      notify.toast({ title: 'Lỗi lưu vùng', message: e.message, type: 'danger' });
    }
  }

  async function deleteZone(id, name) {
    // Dùng notify.confirm thay vì native confirm() để nhất quán với UI
    const ok = await notify.confirm(`Xóa vùng "${name}"?`, { danger: true, okLabel: 'Xóa' });
    if (!ok) return;
    try {
      await fetch(VC.api.url(`/api/zones/${id}`), { method: 'DELETE' });
      notify.toast({ title: 'Đã xóa', message: name, type: 'ok' });
      loadZones();
    } catch (e) {
      notify.toast({ title: 'Lỗi xóa', message: e.message, type: 'danger' });
    }
  }

  function renderZoneList() {
    const container = document.getElementById('zoneList');
    const countEl = document.getElementById('zoneCount');
    if (!container) return;
    if (countEl) countEl.textContent = zones.length;

    if (!zones.length) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📭' }),
        el('div', { class: 'empty__title', text: 'Chưa có vùng nào' })
      ]));
      return;
    }

    container.innerHTML = '';
    zones.forEach(z => {
      const item = el('div', {
        style: 'display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:var(--bg-3);margin-bottom:8px'
      });
      item.appendChild(el('div', {
        style: `width:8px;height:36px;border-radius:4px;background:${z.severity === 'critical' ? '#ef4444' : z.severity === 'high' ? '#f59e0b' : '#10b981'}`
      }));
      const info = el('div', { style: 'flex:1;min-width:0' });
      info.appendChild(el('div', { style: 'font-weight:600;font-size:13px' }, z.name));
      info.appendChild(el('div', { style: 'font-size:11px;color:var(--muted)' },
        `${z.polygon.length} điểm · ${z.maxDwellSeconds}s · ${z.severity}`));
      item.appendChild(info);
      item.appendChild(el('button', {
        class: 'btn btn--flat btn--sm',
        html: '🗑️',
        onclick: () => deleteZone(z.id, z.name)
      }));
      container.appendChild(item);
    });
  }

  VC.views = VC.views || {};
  VC.views.zones = renderZones;
})(window.VC);
