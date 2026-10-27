/* ============================================================
   SafeZone Hồ Đá · ĐHQG-HCM — zones.js
   Thiết lập & Quản lý Vùng Cấm Bờ Hồ Đá (Polygon Geofencing)
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { $, el, icon, escape } = utils;

  let zones = [];
  let isDrawing = false;
  let currentPoints = [];
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;

  function renderZones(root) {
    isDrawing = false;
    currentPoints = [];
    videoEl = null;
    canvasEl = null;
    ctx = null;
    root.innerHTML = '';

    // Reordered layout (.command-deck): Left 380px = Danh sách vùng cấm bờ hồ + Form cấu hình; Right Main Stage = Khung vẽ đa giác trên Camera Hồ Đá
    const wrap = el('div', { class: 'command-deck' });

    const left = el('div');
    left.appendChild(zoneListCard());
    left.appendChild(zoneFormCard());
    wrap.appendChild(left);

    const right = el('div');
    right.appendChild(videoCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    requestAnimationFrame(() => {
      initCanvas();
      loadZones();
    });
  }

  function videoCard() {
    const card = el('div', { class: 'card' });
    const fallbackSrc = VC.LAKE_FALLBACK_IMG || '';

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Khoanh Vùng Cấm Đa giác (Geofencing) Trên Bờ Hồ Đá ĐHQG-HCM'
      ]),
      el('span', { class: 'badge badge--primary', id: 'drawStatus' }, 'Sẵn sàng khoanh vùng')
    ]));

    const stage = el('div', {
      style: 'position:relative;border-radius:12px;overflow:hidden;background:#07131d;aspect-ratio:16/10'
    });

    if (VC.camera && VC.camera.isActive()) {
      const localVideo = el('video', {
        autoplay: true,
        muted: true,
        playsinline: true,
        style: 'width:100%;height:100%;object-fit:cover;display:block'
      });
      stage.appendChild(localVideo);
      VC.camera.attach(localVideo, false);
    } else {
      const img = el('img', {
        src: fallbackSrc,
        alt: 'Trạm Camera Hồ Đá (Chế độ Riêng tư)',
        style: 'width:100%;height:100%;object-fit:cover;display:block'
      });
      stage.appendChild(img);
    }

    const canvas = el('canvas', {
      id: 'zoneCanvas',
      style: 'position:absolute;inset:0;width:100%;height:100%;cursor:crosshair'
    });
    stage.appendChild(canvas);

    card.appendChild(stage);

    card.appendChild(el('div', { class: 'video-controls', style: 'margin-top:12px' }, [
      el('button', {
        class: 'btn btn--primary btn--sm',
        id: 'startDrawBtn',
        html: '✏️ Vẽ vùng cấm bờ hồ mới',
        onclick: startDrawing
      }),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        id: 'finishDrawBtn',
        html: '✓ Khép đa giác',
        disabled: 'disabled',
        onclick: finishDrawing
      }),
      el('button', {
        class: 'btn btn--flat btn--sm',
        id: 'cancelDrawBtn',
        html: '✕ Hủy',
        disabled: 'disabled',
        onclick: cancelDrawing
      }),
      el('div', { class: 'video-controls__spacer' }),
      el('span', { class: 'video-controls__info' }, 'Mẹo: Click chấm từng đỉnh dọc mép vực đá · Chuột phải để khép vùng')
    ]));

    return card;
  }

  function zoneListCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('map') }),
        'Các Vùng Cấm Bờ Hồ Đang Bảo Vệ'
      ]),
      el('span', { class: 'badge badge--primary', id: 'zoneCount' }, '0')
    ]));
    card.appendChild(el('div', { id: 'zoneList' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '🌊' }),
        el('div', { class: 'empty__title', text: 'Chưa thiết lập vùng cấm' }),
        el('div', { class: 'empty__desc', text: 'Nhấn "Vẽ vùng cấm bờ hồ mới" bên phải để khoanh mép vực đá.' })
      ])
    ]));
    return card;
  }

  function zoneFormCard() {
    const card = el('div', { class: 'card', id: 'zoneFormCard', style: 'display:none' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Lưu Thông tin Vùng Cấm Bờ Hồ'
      ])
    ]));

    const form = el('form', { id: 'zoneForm' });

    form.appendChild(field('zoneName', 'Tên khu vực bờ hồ', 'text', 'VD: Vách đá dựng đứng Bờ Bắc Hồ Đá'));
    form.appendChild(field('zoneDesc', 'Mô tả nguy cơ', 'text', 'VD: Nước sâu > 30m, cấm vượt rào chụp ảnh'));

    const sevField = el('div', { class: 'field' });
    sevField.appendChild(el('label', { class: 'field__label' }, 'Cấp độ nguy hiểm bờ hồ'));
    const sevSel = el('select', { class: 'select', id: 'zoneSeverity' });
    [
      ['low', 'LOW — Nhắc nhở vành đai ngoài'],
      ['medium', 'MEDIUM — Cảnh báo lối mòn ven hồ'],
      ['high', 'HIGH — Nguy hiểm sát mép đá'],
      ['critical', 'CRITICAL — Tử địa vách đá / nước sâu']
    ].forEach(([v, label]) => {
      sevSel.appendChild(el('option', { value: v }, label));
    });
    sevSel.value = 'critical';
    sevField.appendChild(sevSel);
    form.appendChild(sevField);

    form.appendChild(field('zoneDwell', 'Thời gian đứng tối đa trước khi hú còi (giây)', 'number', '15'));

    form.appendChild(el('button', {
      type: 'submit',
      class: 'btn btn--primary btn--block',
      html: '💾 Lưu vùng cấm Hồ Đá'
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

  function initCanvas() {
    videoEl = document.querySelector('.video img') || document.querySelector('img[src*="stream"]');
    canvasEl = document.getElementById('zoneCanvas');
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width;
    canvasEl.height = rect.height;
    ctx = canvasEl.getContext('2d');

    canvasEl.addEventListener('click', onCanvasClick);
    canvasEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (isDrawing && currentPoints.length >= 3) finishDrawing();
    });

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

    zones.forEach(z => drawPolygon(z.polygon, z.severity === 'critical' ? '#e11d48' : '#f59e0b', 0.24, 2.5));

    if (isDrawing && currentPoints.length > 0) {
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      currentPoints.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();

      if (currentPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[currentPoints.length - 1][0], currentPoints[currentPoints.length - 1][1]);
        ctx.lineTo(currentPoints[0][0], currentPoints[0][1]);
        ctx.stroke();
      }

      currentPoints.forEach(p => {
        ctx.fillStyle = '#0d9488';
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
    if (statusEl) statusEl.textContent = 'Click lên mép hồ để chấm đỉnh đa giác';
    redraw();
  }

  function finishDrawing() {
    if (currentPoints.length < 3) {
      notify.toast({ title: 'Cần ít nhất 3 đỉnh để tạo vùng cấm bờ hồ', type: 'warn' });
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
    if (statusEl) statusEl.textContent = 'Đã khép vùng — Nhập tên bên trái để lưu';
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
    if (statusEl) statusEl.textContent = 'Đã hủy thao tác vẽ';
    if (formCard) formCard.style.display = 'none';
    redraw();
  }

  async function loadZones() {
    try {
      const r = await fetch(VC.api.url('/api/zones'));
      const data = await r.json();
      zones = (data.items || []).map(z => {
        if (z.name === 'TEST1' || z.name === 'TEST4') z.name = 'Mép vực đá Bờ Bắc Hồ Đá';
        return z;
      });
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
      notify.toast({ title: 'Vui lòng nhập tên khu vực bờ hồ', type: 'warn' });
      return;
    }

    const payload = {
      name,
      description: (document.getElementById('zoneDesc') || {}).value || '',
      polygon: currentPoints,
      severity: (document.getElementById('zoneSeverity') || {}).value || 'critical',
      maxDwellSeconds: parseInt((document.getElementById('zoneDwell') || {}).value) || 15
    };

    try {
      const r = await fetch(VC.api.url('/api/zones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);

      notify.toast({ title: 'Đã lưu vùng cấm Hồ Đá', message: name, type: 'ok' });

      currentPoints = [];
      const form = document.getElementById('zoneForm');
      const formCard = document.getElementById('zoneFormCard');
      const statusEl = document.getElementById('drawStatus');
      if (form) form.reset();
      if (formCard) formCard.style.display = 'none';
      if (statusEl) statusEl.textContent = 'Sẵn sàng khoanh vùng';

      loadZones();
    } catch (e) {
      notify.toast({ title: 'Lỗi lưu vùng cấm', message: e.message, type: 'danger' });
    }
  }

  async function deleteZone(id, name) {
    const ok = await notify.confirm(`Xóa vùng cấm "${name}" khỏi bản đồ giám sát Hồ Đá?`, { danger: true, okLabel: 'Xóa vùng' });
    if (!ok) return;
    try {
      await fetch(VC.api.url(`/api/zones/${id}`), { method: 'DELETE' });
      notify.toast({ title: 'Đã xóa vùng cấm', message: name, type: 'ok' });
      loadZones();
    } catch (e) {
      notify.toast({ title: 'Lỗi xóa vùng', message: e.message, type: 'danger' });
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
        el('div', { class: 'empty__icon', text: '🌊' }),
        el('div', { class: 'empty__title', text: 'Chưa có vùng cấm nào' })
      ]));
      return;
    }

    container.innerHTML = '';
    zones.forEach(z => {
      const item = el('div', {
        style: 'display:flex;align-items:center;gap:10px;padding:12px;border-radius:10px;background:var(--bg-2);border:1px solid var(--border);margin-bottom:8px'
      });
      item.appendChild(el('div', {
        style: `width:8px;height:36px;border-radius:4px;background:${z.severity === 'critical' ? '#e11d48' : z.severity === 'high' ? '#f59e0b' : '#0d9488'}`
      }));
      const info = el('div', { style: 'flex:1;min-width:0' });
      info.appendChild(el('div', { style: 'font-weight:700;font-size:13px' }, z.name));
      info.appendChild(el('div', { style: 'font-size:11.5px;color:var(--muted)' },
        `${z.polygon.length} đỉnh đa giác · Báo động sau ${z.maxDwellSeconds}s · Cấp ${String(z.severity).toUpperCase()}`));
      item.appendChild(info);
      item.appendChild(el('button', {
        class: 'btn btn--flat btn--sm',
        html: '🗑️',
        title: 'Xóa vùng cấm này',
        onclick: () => deleteZone(z.id, z.name)
      }));
      container.appendChild(item);
    });
  }

  VC.views = VC.views || {};
  VC.views.zones = renderZones;
})(window.VC);
