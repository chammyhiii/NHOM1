/* ============================================================
   SafeZone Hồ Đá · ĐHQG-HCM — radar.js
   Radar Quét Tín hiệu Vành đai Bờ Hồ Đá & Bản đồ Tọa độ 2D
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { $, el, icon } = utils;

  let refreshTimer = null;
  let devices = [];

  function renderRadar(root) {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    root.innerHTML = '';

    // 1. TOP ROW: 3-KPI Perimeter Strip (replaces old right-bottom stats card)
    root.appendChild(el('div', { class: 'kpi-strip', style: 'grid-template-columns:repeat(3,1fr)' }, [
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-primary', text: '📡' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Tín hiệu Thiết bị Quanh Hồ Đá' }),
          el('div', { class: 'kpi-tile__val is-primary', id: 'totalDevices', text: '0' }),
          el('div', { class: 'kpi-tile__sub', text: 'Quét tự động chu kỳ 3 giây' })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-danger', text: '🚨' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Tín hiệu Sát Vách Đá / Vùng Cấm' }),
          el('div', { class: 'kpi-tile__val is-danger', id: 'dangerDevices', text: '0' }),
          el('div', { class: 'kpi-tile__sub', text: 'Khoảng cách < 11m tính từ mép hồ' })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-ok', text: '🌊' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Bán kính Vành đai Quét Bờ Hồ' }),
          el('div', { class: 'kpi-tile__val is-ok', text: '100m' }),
          el('div', { class: 'kpi-tile__sub', text: 'Cụm Hồ Đá Trung tâm ĐHQG-HCM' })
        ])
      ])
    ]));

    // 2. BOTTOM ROW: Command Deck (Left 380px = Danh sách tín hiệu ven hồ; Right Main Stage = Radar 2D đồng tâm Hồ Đá)
    const wrap = el('div', { class: 'command-deck' });

    const left = el('div');
    left.appendChild(deviceListCard());
    wrap.appendChild(left);

    const right = el('div');
    right.appendChild(map2DCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    loadDevices();
    refreshTimer = setInterval(loadDevices, 3000);
  }

  function deviceListCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Tín hiệu Thiết bị Di động Ven Hồ Đá'
      ]),
      el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
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
        el('div', { class: 'empty__title', text: 'Đang quét tín hiệu bờ hồ...' })
      ])
    ]));
    return card;
  }

  function map2DCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('map') }),
        'Radar 2D Định vị Khoảng cách quanh Lòng Hồ Đá ĐHQG-HCM'
      ]),
      el('span', { class: 'badge badge--ok' }, 'Path-Loss RSSI')
    ]));

    const wrap = el('div', {
      style: 'position:relative;width:100%;aspect-ratio:16/10;background:#07131d;border-radius:12px;overflow:hidden'
    });

    const canvas = el('canvas', {
      id: 'radarCanvas',
      style: 'width:100%;height:100%;display:block'
    });
    wrap.appendChild(canvas);

    card.appendChild(wrap);
    return card;
  }

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
      notify.toast({ title: 'Đang quét vành đai bờ Hồ Đá...', type: 'info', duration: 1500 });
      setTimeout(loadDevices, 2500);
    } catch (e) {
      notify.toast({ title: 'Lỗi quét radar', message: e.message, type: 'danger' });
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
        el('div', { class: 'empty__title', text: 'Chưa phát hiện thiết bị gần mép hồ' })
      ]));
      return;
    }

    container.innerHTML = '';
    devices.forEach(d => {
      const danger = d.in_danger_zone;
      const item = el('div', {
        style: `display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:${danger ? 'rgba(225,29,72,0.1)' : 'var(--bg-2)'};border-left:3px solid ${danger ? '#e11d48' : '#0d9488'};margin-bottom:6px`
      });
      item.appendChild(el('div', {
        style: 'width:32px;height:32px;border-radius:8px;background:var(--bg-3);display:grid;place-items:center;font-size:14px'
      }, danger ? '🚨' : '📶'));

      const info = el('div', { style: 'flex:1;min-width:0' });
      info.appendChild(el('div', {
        style: 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      }, d.ssid || d.mac_address));
      info.appendChild(el('div', {
        style: 'font-size:11px;color:var(--muted);font-family:monospace'
      }, `${d.mac_address} · Cách trạm ${rssiToDistance(d.rssi)}`));
      item.appendChild(info);

      item.appendChild(el('div', {
        style: `font-family:monospace;font-size:12px;font-weight:700;color:${danger ? '#e11d48' : '#0d9488'}`
      }, `${d.rssi} dBm`));

      container.appendChild(item);
    });
  }

  function rssiToDistance(rssi) {
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
    const scale = Math.min(w, h) / 100;

    ctx.fillStyle = '#07131d';
    ctx.fillRect(0, 0, w, h);

    // Lưới tọa độ đồng tâm
    ctx.strokeStyle = 'rgba(13,148,136,0.14)';
    ctx.lineWidth = 1;
    for (let i = -50; i <= 50; i += 10) {
      ctx.beginPath();
      ctx.moveTo(cx + i * scale, 0); ctx.lineTo(cx + i * scale, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy + i * scale); ctx.lineTo(w, cy + i * scale);
      ctx.stroke();
    }

    // Vẽ Lòng Hồ Đá (bán kính 12m mô phỏng tâm quét)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 12 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(2,132,199,0.28)';
    ctx.fill();

    // Vẽ Vành đai Vách Đá nguy hiểm (bán kính 16m)
    ctx.strokeStyle = '#e11d48';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nhãn tâm Hồ Đá
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Be Vietnam Pro, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LÒNG HỒ ĐÁ ĐHQG', cx, cy + 4);

    devices.forEach(d => {
      const x = cx + (d.estimated_x || 0) * scale;
      const y = cy + (d.estimated_y || 0) * scale;
      const color = d.in_danger_zone ? '#e11d48' : '#2dd4bf';

      if (d.rssi) {
        const dist = Math.pow(10, (-45 - d.rssi) / 25);
        ctx.strokeStyle = color + '30';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, dist * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Be Vietnam Pro, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.ssid || d.mac_address.slice(-5), x, y - 10);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 11px Be Vietnam Pro, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BẮC (Bờ Vách Đá)', cx, 18);
    ctx.fillText('NAM (Viện CNSH)', cx, h - 8);
    ctx.fillText('TÂY', 24, cy);
    ctx.fillText('ĐÔNG (Đ. Nguyễn Du)', w - 65, cy);
  }

  VC.views = VC.views || {};
  VC.views.radar = renderRadar;
})(window.VC);
