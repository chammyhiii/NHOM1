/* ============================================================
   SafeZone-HD — radar.js
   Radar WiFi — Danh sách thiết bị + bản đồ 2D
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { $, el, icon } = utils;

  let refreshTimer = null;
  let devices = [];

  function renderRadar(root) {
    // Dừng timer cũ trước khi render mới — tránh memory leak khi navigate qua lại
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    root.innerHTML = '';

    const wrap = el('div', { class: 'grid-2' });

    const left = el('div');
    left.appendChild(deviceListCard());
    wrap.appendChild(left);

    const right = el('div');
    right.appendChild(map2DCard());
    right.appendChild(statsCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    loadDevices();
    refreshTimer = setInterval(loadDevices, 3000);
  }

  function deviceListCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Thiết bị WiFi quanh hồ đá'
      ]),
      el('div', { style: 'display:flex;gap:8px' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm',
          html: '🔄 Quét ngay',
          onclick: triggerScan
        }),
        el('span', { class: 'badge badge--primary', id: 'deviceCount' }, '0')
      ])
    ]));
    card.appendChild(el('div', { id: 'deviceList' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📡' }),
        el('div', { class: 'empty__title', text: 'Đang quét thiết bị...' })
      ])
    ]));
    return card;
  }

  function map2DCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Bản đồ vị trí ước lượng'
      ])
    ]));

    const wrap = el('div', {
      style: 'position:relative;width:100%;aspect-ratio:1;background:#0a0e1a;border-radius:12px;overflow:hidden'
    });

    const canvas = el('canvas', {
      id: 'radarCanvas',
      style: 'width:100%;height:100%;display:block'
    });
    wrap.appendChild(canvas);

    card.appendChild(wrap);
    return card;
  }

  function statsCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('chart') }),
        'Thống kê'
      ])
    ]));

    const grid = el('div', { class: 'stats' });
    grid.appendChild(statBox('📡', 'Tổng thiết bị', '0', 'totalDevices'));
    grid.appendChild(statBox('🚨', 'Trong vùng cấm', '0', 'dangerDevices'));
    card.appendChild(grid);
    return card;
  }

  function statBox(emoji, label, value, id) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'stat__head' }, [emoji + ' ' + label]),
      el('div', { class: 'stat__val', id, text: value })
    ]);
  }

  // ---- API ----
  async function loadDevices() {
    try {
      const r = await fetch(VC.api.url('/api/radar/devices'));
      const data = await r.json();
      devices = data.items || [];
      renderDeviceList();
      drawRadar();
    } catch (e) {
      console.warn('Load devices failed:', e);
    }
  }

  async function triggerScan() {
    try {
      await fetch(VC.api.url('/api/radar/scan'), { method: 'POST' });
      notify.toast({ title: 'Đang quét...', type: 'info', duration: 1500 });
      setTimeout(loadDevices, 2500);
    } catch (e) {
      notify.toast({ title: 'Lỗi quét', message: e.message, type: 'danger' });
    }
  }

  function renderDeviceList() {
    const container = document.getElementById('deviceList');
    if (!container) return;
    const countEl = document.getElementById('deviceCount');
    const totalEl = document.getElementById('totalDevices');
    const dangerEl = document.getElementById('dangerDevices');
    if (countEl) countEl.textContent = devices.length;
    if (totalEl) totalEl.textContent = devices.length;
    if (dangerEl) dangerEl.textContent = devices.filter(d => d.in_danger_zone).length;

    if (!devices.length) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📡' }),
        el('div', { class: 'empty__title', text: 'Không thấy thiết bị nào' })
      ]));
      return;
    }

    container.innerHTML = '';
    devices.forEach(d => {
      const danger = d.in_danger_zone;
      const item = el('div', {
        style: `display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:${danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-3)'};border-left:3px solid ${danger ? '#ef4444' : 'transparent'};margin-bottom:6px`
      });
      item.appendChild(el('div', {
        style: 'width:32px;height:32px;border-radius:8px;background:var(--bg-2);display:grid;place-items:center;font-size:14px'
      }, danger ? '🚨' : '📶'));

      const info = el('div', { style: 'flex:1;min-width:0' });
      info.appendChild(el('div', {
        style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      }, d.ssid || d.mac_address));
      info.appendChild(el('div', {
        style: 'font-size:11px;color:var(--muted);font-family:monospace'
      }, `${d.mac_address} · ${rssiToDistance(d.rssi)}`));
      item.appendChild(info);

      item.appendChild(el('div', {
        style: `font-family:monospace;font-size:12px;font-weight:700;color:${danger ? '#ef4444' : '#06b6d4'}`
      }, `${d.rssi} dBm`));

      container.appendChild(item);
    });
  }

  function rssiToDistance(rssi) {
    // Công thức path loss: d = 10^((-45 - rssi) / 25)
    if (!rssi) return '?';
    const d = Math.pow(10, (-45 - rssi) / 25);
    return `~${d.toFixed(1)}m`;
  }

  function drawRadar() {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');

    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const scale = Math.min(w, h) / 100; // 100m → cạnh ngắn

    // Clear
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    // Vẽ lưới
    ctx.strokeStyle = 'rgba(6,182,212,0.1)';
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      ctx.beginPath();
      ctx.moveTo(cx + i * scale, 0); ctx.lineTo(cx + i * scale, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy + i * scale); ctx.lineTo(w, cy + i * scale);
      ctx.stroke();
    }

    // Vẽ hồ đá (bán kính 9m)
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,64,175,0.2)';
    ctx.fill();

    // Vẽ bờ đá (bán kính 11m)
    ctx.strokeStyle = '#4a4540';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 11 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Vẽ các thiết bị
    devices.forEach(d => {
      const x = cx + (d.estimated_x || 0) * scale;
      const y = cy + (d.estimated_y || 0) * scale;
      const color = d.in_danger_zone ? '#ef4444' : '#06b6d4';

      // Vòng tròn khoảng cách
      if (d.rssi) {
        const dist = Math.pow(10, (-45 - d.rssi) / 25);
        ctx.strokeStyle = color + '30';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, dist * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Chấm thiết bị
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Viền
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.ssid || d.mac_address.slice(-5), x, y - 10);
    });

    // Tâm
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Compass
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 15);
    ctx.fillText('S', cx, h - 5);
    ctx.fillText('W', 10, cy);
    ctx.fillText('E', w - 10, cy);
  }

  VC.views = VC.views || {};
  VC.views.radar = renderRadar;
})(window.VC);
