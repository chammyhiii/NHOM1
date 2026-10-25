(function (VC) {
  'use strict';

  const { utils, store, api, notify } = VC;
  const { $, el, icon, escape, fmtDateTime, fmtTime, fmtDateInput, toCSV, download } = utils;

  /* ---------------- OVERVIEW ---------------- */
  function renderOverview(root) {
    const s = store.state;
    const latest = s.alerts[0];
    root.innerHTML = '';

    // Quick start banner for first-time users
    if (VC.guide && VC.guide.renderQuickStartBanner) {
      const banner = VC.guide.renderQuickStartBanner();
      if (banner) root.appendChild(banner);
    }

    const wrap = el('div', { class: 'grid-2' });
    const left = el('div');
    left.appendChild(videoCard(s.activeCamera));
    left.appendChild(featureStrip());
    left.appendChild(statusBar());

    const right = el('div', { id: 'overviewRightCol' });
    right.appendChild(alertCard(latest));
    right.appendChild(statsCard(s.metrics));
    right.appendChild(recentCard());

    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);

    bindVideoControls(root);
  }

  function videoCard(camId) {
    const cam = VC.CAMERAS.find(c => c.id === camId) || VC.CAMERAS[0];
    const paused = store.state.livePaused;

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        `CAMERA · ${escape(cam.name)}`
      ]),
      el('span', { class: `badge badge--${cam.online ? 'ok' : 'muted'}` },
        cam.online ? '● Trực tuyến' : '○ Ngoại tuyến')
    ]));

    card.appendChild(cameraPicker());
    const video = createCameraSurface(cam, 'Live');
    card.appendChild(video);

    card.appendChild(el('div', { class: 'video-controls' }, [
      el('button', {
        class: `icon-btn ${paused ? 'is-active' : ''}`,
        'data-action': 'pause',
        title: paused ? 'Tiếp tục' : 'Tạm dừng',
        html: icon(paused ? 'play' : 'pause')
      }),
      el('button', {
        class: `icon-btn ${store.state.sound ? 'is-active' : ''}`,
        'data-action': 'sound',
        title: 'Bật/tắt âm thanh',
        html: icon(store.state.sound ? 'volume' : 'mute')
      }),
      el('button', { class: 'icon-btn is-active', html: 'HD', title: 'Chất lượng' }),
      el('button', { class: 'icon-btn', 'data-action': 'fullscreen', title: 'Toàn màn hình', html: icon('expand') }),
      el('div', { class: 'video-controls__spacer' }),
      el('span', { class: 'video-controls__info' }, 'YOLOv8x-Pose · ~30 FPS · AI 15–24 FPS · conf 96%')
    ]));

    return card;
  }

  function cameraPicker() {
    const devices = VC.camera.getDevices();
    const select = el('select', {
      class: 'camera-picker__select',
      'aria-label': 'Chọn camera của thiết bị'
    });
    if (!devices.length) {
      select.appendChild(el('option', {}, 'Camera mặc định của thiết bị'));
    } else {
      devices.forEach((device, index) => {
        select.appendChild(el('option', {
          value: device.deviceId,
          selected: device.deviceId === VC.camera.currentDeviceId()
        }, device.label || `Camera ${index + 1}`));
      });
    }
    select.addEventListener('change', async () => {
      try {
        await VC.camera.enable(select.value);
        VC.app.rerender();
        notify.toast({ title: 'Đã chuyển camera', message: select.options[select.selectedIndex].text, type: 'ok' });
      } catch (error) {
        notify.toast({ title: 'Không thể mở camera', message: error.message, type: 'danger' });
      }
    });

    const isCamActive = VC.camera.isActive();
    const button = el('button', {
      class: `btn ${isCamActive ? 'btn--primary' : 'btn--ghost'} btn--sm`,
      type: 'button',
      disabled: !VC.camera.isSupported(),
      onclick: async () => {
        if (isCamActive) {
          VC.camera.stop();
          VC.app.rerender();
          notify.toast({ title: 'Đã chuyển sang AI Server', message: 'Đang hiển thị luồng AI từ backend.', type: 'info' });
          return;
        }
        try {
          await VC.camera.enable(select.value);
          VC.app.rerender();
          notify.toast({ title: 'Webcam đã bật', message: 'Đang truyền trực tiếp hình ảnh vào AI backend.', type: 'ok' });
        } catch (error) {
          notify.toast({
            title: 'Không thể mở camera',
            message: `${error.message} Hãy cấp quyền camera và dùng HTTPS hoặc localhost.`,
            type: 'danger',
            duration: 5000
          });
        }
      }
    }, isCamActive ? 'Tắt camera (dùng AI Server)' : 'Bật camera của tôi');

    return el('div', { class: 'camera-picker' }, [
      el('span', { class: 'camera-picker__label', text: 'Camera thiết bị:' }),
      select,
      button
    ]);
  }

  const SKELETON_PAIRS = [
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
    [5, 11], [6, 12], [11, 12],
    [11, 13], [13, 15], [12, 14], [14, 16],
    [0, 1], [0, 2], [1, 3], [2, 4]
  ];

  const JOINT_COLORS = [
    '#f43f5e', '#fb923c', '#facc15', '#4ade80', '#2dd4bf',
    '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185',
    '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#e879f9',
    '#f87171', '#4ade80'
  ];

  let unbindDetections = null;
  function bindCanvasDrawer(canvas, video) {
    if (unbindDetections) {
      unbindDetections();
      unbindDetections = null;
    }
    const ctx = canvas.getContext('2d');

    unbindDetections = VC.api.onRealtimeDetections((data) => {
      if (!canvas || !video) return;
      const rect = video.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const fw = data.frame_w || 640;
      const fh = data.frame_h || 480;
      // C?n ch?nh ch?nh x?c v?i video object-fit: cover
      const scale = Math.max(canvas.width / fw, canvas.height / fh);
      const offsetX = (canvas.width - fw * scale) / 2;
      const offsetY = (canvas.height - fh * scale) / 2;
      const mapX = (x) => x * scale + offsetX;
      const mapY = (y) => y * scale + offsetY;

      const dets = data.detections || [];
      const events = data.events || [];
      const zones = data.zones || [];
      zones.forEach((z) => {
        const poly = z.polygon || [];
        if (poly.length < 3) return;
        const isCrit = z.severity === 'critical';
        ctx.save();
        ctx.beginPath();
        poly.forEach((p, idx) => {
          const zx = mapX((p[0] * fw) / 1280);
          const zy = mapY((p[1] * fh) / 720);
          if (idx === 0) ctx.moveTo(zx, zy);
          else ctx.lineTo(zx, zy);
        });
        ctx.closePath();
        ctx.fillStyle = isCrit ? 'rgba(244, 63, 94, 0.25)' : 'rgba(245, 158, 11, 0.25)';
        ctx.fill();
        ctx.strokeStyle = isCrit ? '#f43f5e' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`ZONE: ${z.name || ''}`, mapX((poly[0][0] * fw) / 1280) + 6, mapY((poly[0][1] * fh) / 720) + 18);
        ctx.restore();
      });

      // 1. V? ng??i, t? th? v? x??ng kh?p 17 ?i?m
      dets.forEach((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        const bx = mapX(x1);
        const by = mapY(y1);
        const bw = (x2 - x1) * scale;
        const bh = (y2 - y1) * scale;
        const score = d.score || 0.9;
        const posture = d.posture || 'normal';
        const isFall = posture === 'fall' || posture === 'faint';

        const boxColor = isFall ? '#ff2e4c' : '#00ff00';
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);

        const tag = posture === 'faint' ? 'FAINT' : (posture === 'fall' ? 'FALL' : 'PERSON');
        const label = `${tag} ${score.toFixed(2)}`;
        ctx.font = 'bold 12px Inter, monospace';
        const tw = ctx.measureText(label).width;
        const labelY = Math.max(4, by - 22);
        ctx.fillStyle = boxColor;
        ctx.fillRect(bx, labelY, tw + 12, 22);
        ctx.fillStyle = isFall ? '#ffffff' : '#000000';
        ctx.fillText(label, bx + 6, labelY + 15);

        // Skeleton
        const kpts = d.keypoints;
        if (kpts && kpts.length >= 17) {
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2.5;
          SKELETON_PAIRS.forEach(([i, j]) => {
            const ka = kpts[i];
            const kb = kpts[j];
            if (ka && kb && ka[2] > 0.18 && kb[2] > 0.18) {
              ctx.beginPath();
              ctx.moveTo(mapX(ka[0]), mapY(ka[1]));
              ctx.lineTo(mapX(kb[0]), mapY(kb[1]));
              ctx.stroke();
            }
          });

          kpts.forEach((k, idx) => {
            if (k && k[2] > 0.18) {
              ctx.beginPath();
              ctx.arc(mapX(k[0]), mapY(k[1]), 4.5, 0, Math.PI * 2);
              ctx.fillStyle = JOINT_COLORS[idx % JOINT_COLORS.length];
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          });
        }
      });

      // 2. V? nh?n c?nh b?o (T? NG? / NG?T X?U / ??T QU?)
      let evY = 32;
      events.forEach((ev) => {
        const type = (ev.type || '').toUpperCase();
        const conf = Math.round((ev.confidence || 0.8) * 100);
        const text = `? ${type} ${conf}%`;

        ctx.font = 'bold 15px Inter, sans-serif';
        const ew = ctx.measureText(text).width;
        ctx.fillStyle = ev.type === 'fall' || ev.type === 'stroke' ? 'rgba(244, 63, 94, 0.92)' : 'rgba(245, 158, 11, 0.92)';
        ctx.fillRect(canvas.width - ew - 24, evY - 20, ew + 16, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, canvas.width - ew - 16, evY);
        evY += 32;
      });

      // 3. C?p nh?t nh?n tr?ng th?i tr?c ti?p tr?n Video & StatusBar
      const badgeEl = document.getElementById('aiLiveBadge');
      const badgeTextEl = document.getElementById('aiLiveBadgeText');
      const statusTextEl = document.getElementById('aiStatusText');
      const statusDotEl = document.getElementById('aiStatusDot');

      const hasFall = dets.some(d => d.posture === 'fall' || d.posture === 'faint') ||
                      events.some(e => e.type === 'fall' || e.type === 'stroke');

      if (dets.length > 0) {
        const bestScore = Math.round(Math.max(...dets.map(d => d.score || 0.85)) * 100);
        if (hasFall) {
          if (badgeEl) badgeEl.style.background = 'rgba(244, 63, 94, 0.95)';
          if (badgeTextEl) badgeTextEl.textContent = `⚠ CẢNH BÁO: Phát hiện ${dets.length} người — TƯ THẾ TÉ NGÃ / NGẤT XỈU (${bestScore}%)`;
          if (statusTextEl) statusTextEl.textContent = `⚠ CẢNH BÁO KHẨN: Phát hiện ${dets.length} người có dấu hiệu té ngã / ngất xỉu!`;
          if (statusDotEl) statusDotEl.className = 'status-pill is-warn';
        } else {
          if (badgeEl) badgeEl.style.background = 'rgba(16, 185, 129, 0.92)';
          if (badgeTextEl) badgeTextEl.textContent = `✅ Đã nhận diện: ${dets.length} người · Tư thế: Bình thường (${bestScore}%)`;
          if (statusTextEl) statusTextEl.textContent = `✅ Đã nhận diện ${dets.length} người trong phòng · Tư thế: Bình thường (An toàn)`;
          if (statusDotEl) statusDotEl.className = 'status-pill';
        }
      } else {
        if (badgeEl) badgeEl.style.background = 'rgba(59, 130, 246, 0.88)';
        if (badgeTextEl) badgeTextEl.textContent = 'Chưa thấy người trong khung hình — Hãy đứng/ngồi trước camera';
        if (statusTextEl) statusTextEl.textContent = 'Chưa phát hiện người trong khung hình (0 người)';
      }
    });
  }

  function createCameraSurface(cam, label) {
    const surface = el('div', { class: 'video' });
    if (VC.camera.isActive()) {
      const localVideo = el('video', {
        class: 'video__local',
        autoplay: true,
        muted: true,
        playsinline: true,
        'aria-label': `Camera ${cam.name}`
      });
      surface.appendChild(localVideo);
      VC.camera.attach(localVideo);

      // Canvas overlay vẽ khung & xương AI trực tiếp trên webcam y hệt ảnh 2
      const canvas = el('canvas', {
        class: 'video__canvas',
        style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3'
      });
      surface.appendChild(canvas);
      bindCanvasDrawer(canvas, localVideo);

      surface.appendChild(el('div', {
        id: 'aiLiveBadge',
        style: 'position:absolute;bottom:12px;left:14px;background:rgba(16,185,129,0.92);color:#fff;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:6px;z-index:5;transition:background 0.2s'
      }, [
        el('span', { class: 'dot' }),
        el('span', { id: 'aiLiveBadgeText' }, 'YOLOv8x-Pose sẵn sàng — Hãy xuất hiện trước camera')
      ]));
    } else {
      const fallback = el('img', {
        src: VC.api.streamUrl(),
        alt: 'Live',
        onerror: () => { fallback.src = 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80'; }
      });
      surface.appendChild(fallback);
    }
    surface.appendChild(el('div', { class: 'video__top' }, [
      el('span', { class: 'video__tag' }, label === 'Live' ? fmtDateTime() : 'LIVE'),
      el('span', { class: 'video__tag' }, 'YOLOv8x-POSE · ' + escape(cam.id.toUpperCase()))
    ]));
    return surface;
  }

  function bindVideoControls(root) {
    root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'pause') { store.set({ livePaused: !store.state.livePaused }); VC.app.rerender(); }
        else if (a === 'sound') { store.set({ sound: !store.state.sound }); VC.app.rerender(); }
        else if (a === 'fullscreen') {
          const v = root.querySelector('.video');
          if (!document.fullscreenElement) v?.requestFullscreen?.();
          else document.exitFullscreen?.();
        }
      });
    });
  }

  function alertCard(alert) {
    if (!alert) {
      const card = el('div', { class: 'card' });
      card.appendChild(el('div', { class: 'card__head' }, [
        el('div', { class: 'card__title' }, [
          el('div', { class: 'ico', html: icon('shield') }),
          'Cảnh báo gần nhất'
        ]),
        el('span', { class: 'badge badge--ok' }, 'An toàn')
      ]));
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', html: '🛡️' }),
        el('div', { class: 'empty__title', text: 'Không có cảnh báo nào' }),
        el('div', { class: 'empty__desc', text: 'Hệ thống đang giám sát 24/7.' })
      ]));
      return card;
    }

    const isCritical = alert.type === 'fall' || alert.type === 'stroke';
    const card = el('div', { class: `card ${isCritical ? 'alert-card card--glow-danger' : ''}` });

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: `ico ${isCritical ? 'is-danger' : ''}`, html: icon('alert') }),
        'CẢNH BÁO · ' + escape(alert.typeLabel).toUpperCase()
      ]),
      el('span', { class: `badge badge--${alert.status === 'pending' ? 'danger' : 'warn'}` },
        alert.status === 'pending' ? 'Đang chờ' : 'Đang xử lý')
    ]));

    card.appendChild(el('div', { class: 'alert-body' }, [
      el('div', { class: 'alert-thumb', text: alert.typeIcon || '⚠' }),
      el('div', { class: 'alert-info' }, [
        el('div', { class: 'alert-title' }, `${escape(alert.cameraName)} · ${escape(alert.zone)}`),
        el('div', { class: 'alert-meta', html: icon('clock') + ' ' + escape(fmtDateTime(new Date(alert.ts))) }),
        el('div', { class: 'alert-meta', html: icon('activity') + ` Độ tin cậy: <b>${(alert.confidence * 100).toFixed(0)}%</b>` }),
        el('div', { class: 'progress', style: 'margin-top:6px' }, [
          el('div', { class: `progress__fill ${isCritical ? 'is-danger' : 'is-warn'}`, style: `width:${alert.confidence * 100}%` })
        ]),
        el('div', { style: 'margin-top:8px' }, [
          el('span', { class: `pill pill--${isCritical ? 'danger' : 'warn'}` }, '🔔 Đã gửi thông báo')
        ])
      ])
    ]));

    card.appendChild(el('div', { class: 'alert-actions' }, [
      el('button', { class: 'btn btn--primary', 'data-act': 'detail', 'data-id': alert.id }, 'Xem chi tiết'),
      el('button', { class: 'btn btn--ghost', 'data-act': 'resolve', 'data-id': alert.id }, 'Đánh dấu xử lý'),
      el('button', { class: 'btn btn--flat', 'data-act': 'dismiss', 'data-id': alert.id, title: 'Báo nhầm' }, 'Báo nhầm')
    ]));

    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleAlertAction(btn.dataset.act, btn.dataset.id));
    });
    return card;
  }

  async function handleAlertAction(act, id) {
    const alert = store.state.alerts.find(a => a.id === id);
    if (!alert) return;

    if (act === 'detail') {
      const v = await notify.modal({
        title: `Chi tiết cảnh báo ${alert.id}`,
        body: `
          <div style="display:grid;grid-template-columns:120px 1fr;gap:12px 16px;font-size:13px;color:var(--text-dim)">
            <div style="color:var(--muted)">Loại</div><div><b>${escape(alert.typeLabel)}</b></div>
            <div style="color:var(--muted)">Camera</div><div>${escape(alert.cameraName)} — ${escape(alert.zone)}</div>
            <div style="color:var(--muted)">Thời gian</div><div>${escape(fmtDateTime(new Date(alert.ts)))}</div>
            <div style="color:var(--muted)">Độ tin cậy</div><div>${(alert.confidence * 100).toFixed(1)}%</div>
            <div style="color:var(--muted)">Trạng thái</div><div>${escape((VC.STATUS[alert.status] || {}).label || alert.status)}</div>
            <div style="color:var(--muted)">Ghi chú</div><div>${escape(alert.note || '—')}</div>
          </div>
        `,
        actions: [
          { label: 'Đóng', value: 'close', class: 'btn--ghost' },
          { label: 'Đánh dấu xử lý', value: 'resolve', class: 'btn--primary' }
        ]
      });
      if (v === 'resolve') handleAlertAction('resolve', id);
      return;
    }

    if (act === 'resolve') {
      store.updateAlert(id, { status: 'resolved', resolvedAt: Date.now() });
      notify.toast({ title: 'Đã xử lý', message: `Cảnh báo ${id} đã được đánh dấu xử lý.`, type: 'ok' });
      notify.alarm('ok');
      VC.app.rerender();
      return;
    }

    if (act === 'dismiss') {
      const ok = await notify.confirm('Đánh dấu cảnh báo này là báo nhầm?', { danger: true, okLabel: 'Báo nhầm' });
      if (!ok) return;
      store.updateAlert(id, { status: 'dismissed', resolvedAt: Date.now() });
      notify.toast({ title: 'Đã đánh dấu', message: `Cảnh báo ${id} được đánh dấu là báo nhầm.`, type: 'warn' });
      VC.app.rerender();
    }
  }

  function statsCard(m) {
    const riskLabel = { low: 'THẤP', medium: 'TRUNG BÌNH', high: 'CAO' }[m.riskLevel] || 'THẤP';
    const riskColor = { low: 'ok', medium: 'warn', high: 'danger' }[m.riskLevel] || 'ok';
    const riskPct = { low: 25, medium: 60, high: 90 }[m.riskLevel] || 25;

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('chart') }),
        'Thống kê hệ thống'
      ]),
      el('span', { class: 'card__sub', text: 'Cập nhật realtime' })
    ]));

    card.appendChild(el('div', { class: 'stats' }, [
      statBox('🚨', 'Tổng cảnh báo', m.totalAlerts, 'danger', 'Trong hôm nay'),
      statBox('📡', 'Đang giám sát', `${m.activeCameras}/${m.totalCameras}`, 'ok', 'Camera online'),
      statBox('⏱️', 'Hoạt động', ((Date.now() - m.uptimeStart) / 86400000).toFixed(2), 'primary', 'ngày'),
      el('div', { class: 'stat stat--wide' }, [
        el('div', { class: 'stat__head' }, ['🛡️', ' Mức độ nguy cơ hiện tại']),
        el('div', { class: `stat__val is-${riskColor}`, text: riskLabel }),
        el('div', { class: 'progress', style: 'margin-top:6px' }, [
          el('div', { class: `progress__fill is-${riskColor}`, style: `width:${riskPct}%` })
        ])
      ])
    ]));
    return card;
  }

  function statBox(emoji, label, value, color, sub) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'stat__head' }, [emoji + ' ' + label]),
      el('div', { class: `stat__val is-${color}`, text: String(value) }),
      el('div', { class: 'stat__sub', text: sub })
    ]);
  }

  function recentCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('clock') }),
        'Cảnh báo gần đây'
      ]),
      el('button', { class: 'btn btn--flat btn--sm', onclick: () => VC.app.go('history') }, 'Xem tất cả →')
    ]));

    const items = store.state.alerts.slice(0, 5);
    if (!items.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📭' }), 'Chưa có cảnh báo'
      ]));
      return card;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>ID</th><th>Thời gian</th><th>Loại</th><th>Camera</th><th>Trạng thái</th></tr></thead>
      <tbody>
        ${items.map(a => `
          <tr>
            <td><span class="kbd">${escape(a.id)}</span></td>
            <td class="table__mono">${fmtTime(new Date(a.ts))}</td>
            <td><span class="pill pill--${a.severity === 'danger' ? 'danger' : a.severity === 'warn' ? 'warn' : 'ok'}">${escape(a.typeLabel)}</span></td>
            <td>${escape(a.cameraName)}</td>
            <td><span class="pill pill--${statusColor(a.status)}">${escape(statusLabel(a.status))}</span></td>
          </tr>
        `).join('')}
      </tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
    return card;
  }

  function statusColor(s) {
    return { pending: 'warn', processing: 'warn', resolved: 'ok', dismissed: 'muted' }[s] || 'muted';
  }
  function statusLabel(s) {
    return (VC.STATUS[s] || {}).label || s;
  }

  function featureStrip() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'VigiCare hoạt động thế nào'
      ]),
      el('span', { class: 'card__sub', text: 'YOLOv8x-Pose · ByteTrack · AI' })
    ]));

    const items = [
      ['🎯', 'Nhận diện 17 điểm khớp', 'YOLOv8x-Pose phân tích tư thế cơ thể 17 khớp theo thời gian thực, chính xác cao.'],
      ['🧠', 'Phân tích chuỗi thời gian', 'Transformer + Pose Autoencoder phân biệt ngã thật với cúi nhặt đồ.'],
      ['🔔', 'Cảnh báo tức thời', 'Còi báo + toast + ghi log, đồng thời gửi thông báo cho người thân.'],
      ['🌙', 'Chạy hoàn toàn offline', 'Không gửi dữ liệu ra ngoài. Bảo mật tuyệt đối cho gia đình bạn.'],
      ['👥', 'Theo dõi nhiều người', 'ByteTrack theo dõi đồng thời nhiều người trong cùng khung hình.'],
      ['⚡', 'Nhẹ & nhanh', 'Chạy trên máy cá nhân, ~30 FPS camera loop, 15–24 FPS AI inference.']
    ];
    const grid = el('div', { class: 'quick-grid' });
    items.forEach(([ico, title, desc]) => {
      grid.appendChild(el('div', { class: 'quick' }, [
        el('div', { class: 'quick__ico', text: ico }),
        el('div', {}, [
          el('h4', { text: title }),
          el('p', { text: desc })
        ])
      ]));
    });
    card.appendChild(grid);
    return card;
  }

  function statusBar() {
    const s = store.state;
    const pending = s.alerts.filter(a => a.status === 'pending' || a.status === 'processing').length;
    return el('div', { class: 'statusbar' }, [
      el('div', { class: 'statusbar__group' }, [
        el('span', { class: 'status-pill' }),
        el('span', { text: 'Hệ thống hoạt động ổn định' }),
        el('span', { class: 'kbd', text: 'v' + VC.APP.version })
      ]),
      el('div', { class: 'statusbar__group' }, [
        el('span', { id: 'aiStatusDot', class: `status-pill ${pending ? 'is-warn' : ''}` }),
        el('span', { id: 'aiStatusText', text: pending ? `${pending} cảnh báo đang chờ xử lý` : 'YOLOv8x-Pose đang giám sát phòng theo thời gian thực' })
      ])
    ]);
  }

  /* ---------------- LIVE ---------------- */
  function renderLive(root) {
    const s = store.state;
    root.innerHTML = '';

    const head = el('div', { class: 'card' });
    head.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Giám sát đa camera'
      ]),
      el('span', { class: 'card__sub', text: `${store.activeCameras()} / ${s.cameras.length} đang hoạt động` })
    ]));
    const grid = el('div', { class: 'cam-grid' });
    s.cameras.forEach(cam => {
      const tile = el('div', { class: `cam-tile ${cam.id === s.activeCamera ? 'is-active' : ''}` }, [
                el('img', { src: VC.api.streamUrl(), alt: cam.name, loading: 'lazy', onerror: "this.src='https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=70'" }),
        el('div', { class: 'cam-tile__overlay' }, [
          el('div', { class: 'cam-tile__name', text: `${cam.name} · ${cam.zone}` }),
          el('div', { class: `cam-tile__status ${cam.online ? '' : 'is-off'}` })
        ]),
        !cam.online ? el('div', {
          style: 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,0.6);color:var(--muted);font-size:12px'
        }, 'Ngoại tuyến') : null
      ]);
      tile.addEventListener('click', () => {
        store.set({ activeCamera: cam.id });
        notify.toast({ title: 'Đã chuyển camera', message: `${cam.name} · ${cam.zone}`, type: 'info', duration: 2200 });
        VC.app.rerender();
      });
      grid.appendChild(tile);
    });
    const wrapper = el('div', { class: 'card' });
    wrapper.appendChild(grid);
    root.appendChild(head);
    root.appendChild(wrapper);

    const single = el('div', { class: 'card' });
    const cam = s.cameras.find(c => c.id === s.activeCamera) || s.cameras[0];
    single.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        `${escape(cam.name)} · ${escape(cam.zone)}`
      ]),
      el('span', { class: `badge badge--${cam.online ? 'ok' : 'muted'}` }, cam.online ? '● Trực tuyến' : '○ Ngoại tuyến')
    ]));
    single.appendChild(cameraPicker());
    const video = createCameraSurface(cam, 'Live');
    single.appendChild(video);
    root.appendChild(single);
  }

  /* ---------------- HISTORY ---------------- */
  function renderHistory(root) {
    const s = store.state;
    root.innerHTML = '';

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('clock') }),
        'Lịch sử cảnh báo'
      ]),
      el('div', { style: 'display:flex;gap:8px' }, [
        el('button', { class: 'btn btn--ghost btn--sm', onclick: exportCSV, html: icon('download') + ' Xuất CSV' }),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: () => { store.state.filters.page = 1; VC.app.rerender(); },
          html: icon('refresh')
        })
      ])
    ]));

    const f = s.filters;
    const filters = el('div', { class: 'filters' });
    filters.appendChild(mkInput({ placeholder: 'Tìm kiếm ID, camera, loại…', value: f.search, oninput: utils.debounce(v => {
      store.state.filters.search = v; store.state.filters.page = 1;
      VC.app.rerender();
    }, 250) }));
    filters.appendChild(mkSelect({
      value: f.type,
      options: [{ v: 'all', l: 'Mọi loại' }, ...Object.values(VC.ALERT_TYPES).map(t => ({ v: t.id, l: t.label }))],
      onchange: v => { store.state.filters.type = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(mkSelect({
      value: f.camera,
      options: [{ v: 'all', l: 'Mọi camera' }, ...s.cameras.map(c => ({ v: c.id, l: c.name }))],
      onchange: v => { store.state.filters.camera = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(mkSelect({
      value: f.status,
      options: [{ v: 'all', l: 'Mọi trạng thái' }, ...Object.values(VC.STATUS).map(x => ({ v: x.id, l: x.label }))],
      onchange: v => { store.state.filters.status = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(mkInput({ type: 'date', value: f.from, onchange: v => { store.state.filters.from = v; VC.app.rerender(); } }));
    filters.appendChild(mkInput({ type: 'date', value: f.to, onchange: v => { store.state.filters.to = v; VC.app.rerender(); } }));
    filters.appendChild(el('button', {
      class: 'btn btn--flat btn--sm',
      onclick: () => {
        store.set({ filters: { search: '', type: 'all', camera: 'all', status: 'all', from: '', to: '', page: 1, pageSize: s.filters.pageSize } });
        VC.app.rerender();
      }
    }, 'Xóa lọc'));
    card.appendChild(filters);

    const { items, total, page, totalPages } = store.paginatedAlerts();
    if (!items.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '🔍' }),
        el('div', { class: 'empty__title', text: 'Không tìm thấy cảnh báo' }),
        el('div', { class: 'empty__desc', text: 'Thử thay đổi bộ lọc hoặc xóa tìm kiếm.' })
      ]));
    } else {
      const table = el('table', { class: 'table' });
      table.innerHTML = `
        <thead>
          <tr><th>ID</th><th>Thời gian</th><th>Loại</th><th>Camera</th><th>Độ tin cậy</th><th>Trạng thái</th><th></th></tr>
        </thead>
        <tbody>
          ${items.map(a => `
            <tr>
              <td><span class="kbd">${escape(a.id)}</span></td>
              <td class="table__mono">${escape(fmtDateTime(new Date(a.ts)))}</td>
              <td><span class="pill pill--${a.severity === 'danger' ? 'danger' : a.severity === 'warn' ? 'warn' : 'ok'}">${escape(a.typeLabel)}</span></td>
              <td>${escape(a.cameraName)}</td>
              <td class="table__mono">${(a.confidence * 100).toFixed(0)}%</td>
              <td><span class="pill pill--${statusColor(a.status)}">${escape(statusLabel(a.status))}</span></td>
              <td><button class="btn btn--flat btn--sm" data-view="${escape(a.id)}">Xem</button></td>
            </tr>
          `).join('')}
        </tbody>`;
      card.appendChild(el('div', { class: 'table-wrap' }, [table]));

      const pages = el('div', { class: 'pagination__pages' });
      const mkPage = (n, label, disabled, active) => el('button', {
        class: `page-btn ${active ? 'is-active' : ''}`,
        disabled: disabled || false,
        onclick: () => {
          if (disabled || active) return;
          store.state.filters.page = n;
          VC.app.rerender();
        }
      }, label);

      pages.appendChild(mkPage(page - 1, '‹', page <= 1));
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
          pages.appendChild(mkPage(i, String(i), false, i === page));
        } else if (Math.abs(i - page) === 3) {
          pages.appendChild(el('span', { style: 'padding:0 4px;color:var(--muted-2)' }, '…'));
        }
      }
      pages.appendChild(mkPage(page + 1, '›', page >= totalPages));

      card.appendChild(el('div', { class: 'pagination' }, [
        el('div', {}, `Hiển thị ${items.length} / ${total} bản ghi · Trang ${page} / ${totalPages}`),
        pages
      ]));
    }

    card.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => handleAlertAction('detail', btn.dataset.view));
    });

    root.appendChild(card);
  }

  function mkInput({ type = 'text', placeholder = '', value = '', oninput, onchange }) {
    const input = el('input', { class: 'input', type, placeholder, value });
    if (oninput) input.addEventListener('input', e => oninput(e.target.value));
    if (onchange) input.addEventListener('change', e => onchange(e.target.value));
    return input;
  }

  function mkSelect({ value, options, onchange }) {
    const sel = el('select', { class: 'select' });
    options.forEach(o => {
      const opt = el('option', { value: o.v }, o.l);
      if (o.v === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', e => onchange(e.target.value));
    return sel;
  }

  function exportCSV() {
    const rows = store.filteredAlerts();
    if (!rows.length) {
      notify.toast({ title: 'Không có dữ liệu', message: 'Không có cảnh báo nào để xuất.', type: 'warn' });
      return;
    }
    const columns = [
      { label: 'ID', get: r => r.id },
      { label: 'Thời gian', get: r => new Date(r.ts).toISOString() },
      { label: 'Loại', get: r => r.typeLabel },
      { label: 'Camera', get: r => r.cameraName },
      { label: 'Khu vực', get: r => r.zone },
      { label: 'Độ tin cậy', get: r => (r.confidence * 100).toFixed(1) + '%' },
      { label: 'Trạng thái', get: r => statusLabel(r.status) },
      { label: 'Ghi chú', get: r => r.note || '' }
    ];
    const csv = toCSV(rows, columns);
    const fn = `vigicare-history-${fmtDateInput()}.csv`;
    download(fn, csv);
    notify.toast({ title: 'Đã xuất CSV', message: `Lưu ${rows.length} bản ghi vào ${fn}`, type: 'ok' });
  }

  /* ---------------- ANALYTICS ---------------- */
  const CHART_REGISTRY = [];

  function renderAnalytics(root) {
    const s = store.state;
    root.innerHTML = '';

    const wrap = el('div', { class: 'grid-2' });
    const left = el('div');
    const right = el('div');

    const byDay = api.aggregateByDay(s.alerts, 7);
    left.appendChild(chartCard('Cảnh báo 7 ngày qua', 'line', byDay, { color: '#ec4899' }));

    const byHour = api.aggregateByHour(s.alerts.filter(a => a.ts > Date.now() - 7 * 86400000));
    left.appendChild(chartCard('Phân bố theo giờ (7 ngày)', 'bar', byHour, { color: '#4facfe' }));

    const byCam = api.aggregateByCamera(s.alerts, s.cameras);
    const camCard = el('div', { class: 'card' });
    camCard.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Phân bố theo camera'
      ])
    ]));
    const max = Math.max(1, ...byCam.map(c => c.value));
    const bars = el('div', { class: 'bars' });
    byCam.forEach(c => {
      bars.appendChild(el('div', { class: 'bar-row' }, [
        el('div', { class: 'bar-row__label', text: c.name }),
        el('div', { class: 'bar-row__track' }, [
          el('div', { class: 'bar-row__fill', style: `width:${(c.value / max * 100).toFixed(1)}%` })
        ]),
        el('div', { class: 'bar-row__val', text: String(c.value) })
      ]));
    });
    camCard.appendChild(bars);
    right.appendChild(camCard);

    const byType = api.aggregateByType(s.alerts);
    right.appendChild(donutCard('Phân loại cảnh báo', byType));

    const kpi = el('div', { class: 'card' });
    kpi.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Chỉ số chính'
      ])
    ]));
    const grid = el('div', { class: 'stats' });
    const total = s.alerts.length;
    const resolvedRate = total ? Math.round(s.alerts.filter(a => a.status === 'resolved').length / total * 100) : 0;
    const avgConf = total ? (s.alerts.reduce((x, a) => x + a.confidence, 0) / total * 100).toFixed(1) : '0.0';
    grid.appendChild(statBox('📊', 'Tổng sự kiện', total, 'primary', 'Toàn bộ lịch sử'));
    grid.appendChild(statBox('✅', 'Tỷ lệ xử lý', resolvedRate + '%', 'ok', 'Đã đánh dấu'));
    grid.appendChild(statBox('🎯', 'Conf trung bình', avgConf + '%', 'primary', 'Toàn bộ cảnh báo'));
    kpi.appendChild(grid);
    right.appendChild(kpi);

    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);

    requestAnimationFrame(() => drawAllCharts());
  }

  function chartCard(title, type, data, { color = '#06b6d4' } = {}) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('chart') }),
        title
      ])
    ]));
    const wrap = el('div', { class: 'chart-wrap' });
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    CHART_REGISTRY.push({ canvas, type, data, color });
    return card;
  }

  function donutCard(title, data) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('chart') }),
        title
      ])
    ]));
    const wrap = el('div', { class: 'chart-wrap' });
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const total = data.reduce((s, d) => s + d.value, 0);
    const legend = el('div', { class: 'legend' });
   const palette = ['#4facfe', '#ec4899', '#a855f7', '#f59e0b', '#10b981'];
    data.forEach((d, i) => {
      legend.appendChild(el('div', { class: 'legend__item' }, [
        el('div', { class: 'legend__dot', style: `background:${palette[i % palette.length]}` }),
        `${d.label} · ${d.value} (${total ? Math.round(d.value / total * 100) : 0}%)`
      ]));
    });
    card.appendChild(legend);

    CHART_REGISTRY.push({ canvas, type: 'donut', data, palette });
    return card;
  }

  function drawAllCharts() {
    while (CHART_REGISTRY.length) {
      const c = CHART_REGISTRY.shift();
      if (!c.canvas.isConnected) continue;
      const rect = c.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.canvas.width = rect.width * dpr;
      c.canvas.height = rect.height * dpr;
      const ctx = c.canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);

      if (c.type === 'line') drawLine(ctx, w, h, c.data, c.color);
      else if (c.type === 'bar') drawBars(ctx, w, h, c.data, c.color);
      else if (c.type === 'donut') drawDonut(ctx, w, h, c.data, c.palette);
    }
  }

  function drawLine(ctx, w, h, data, color) {
    if (!data.length) return;
    const pad = { l: 34, r: 12, t: 14, b: 26 };
    const maxV = Math.max(1, ...data.map(d => d.value));
    const stepX = (w - pad.l - pad.r) / Math.max(1, data.length - 1);
    const stepY = (h - pad.t - pad.b) / maxV;

    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(maxV * (1 - i / 4))), pad.l - 6, y);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = pad.l + stepX * i;
      const y = pad.t + (h - pad.t - pad.b) - d.value * stepY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
grad.addColorStop(0, color + 'AA');
grad.addColorStop(0.5, color + '55');
grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = pad.l + stepX * i;
      const y = pad.t + (h - pad.t - pad.b) - d.value * stepY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.closePath();
    ctx.fill();

    data.forEach((d, i) => {
      const x = pad.l + stepX * i;
      const y = pad.t + (h - pad.t - pad.b) - d.value * stepY;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(d.label, x, h - pad.b + 6);
    });
  }

  function drawBars(ctx, w, h, data, color) {
    if (!data.length) return;
    const pad = { l: 34, r: 12, t: 14, b: 26 };
    const maxV = Math.max(1, ...data.map(d => d.value));
    const inner = w - pad.l - pad.r;
    const bw = inner / data.length;

    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    }

    data.forEach((d, i) => {
      const bh = (d.value / maxV) * (h - pad.t - pad.b);
      const x = pad.l + bw * i + bw * 0.15;
      const y = h - pad.b - bh;
      const g = ctx.createLinearGradient(0, y, 0, h - pad.b);
      g.addColorStop(0, color);
      g.addColorStop(1, color + '55');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, bw * 0.7, bh, [4, 4, 0, 0]);
      ctx.fill();

      if (i % Math.ceil(data.length / 12) === 0) {
        ctx.fillStyle = 'rgba(148,163,184,0.8)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(d.label, x + bw * 0.35, h - pad.b + 6);
      }
    });
  }

  function drawDonut(ctx, w, h, data, palette) {
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 12;
    const r = R * 0.6;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let start = -Math.PI / 2;

    data.forEach((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = palette[i % palette.length];
      ctx.fill();
      start += angle;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-3').trim() || '#161b25';
    ctx.fill();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e6eaf2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 20px Inter, sans-serif';
    ctx.fillText(String(total), cx, cy - 4);
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('sự kiện', cx, cy + 14);
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings(root) {
    const s = store.state;
    root.innerHTML = '';

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('settings') }),
        'Cài đặt hệ thống'
      ])
    ]));

    const secGen = el('div', { class: 'settings-section' });
    secGen.appendChild(el('div', { class: 'settings-section__title', text: 'Chung' }));
    secGen.appendChild(settingRow({
      title: 'Chế độ tối',
      desc: 'Chuyển giữa giao diện sáng / tối.',
      control: switchControl(s.theme === 'dark', v => {
        store.set({ theme: v ? 'dark' : 'light' });
        document.documentElement.dataset.theme = v ? 'dark' : 'light';
        utils.storage.set(VC.STORAGE.theme, v ? 'dark' : 'light');
        VC.app.rerenderTopbar();
      })
    }));
    secGen.appendChild(settingRow({
      title: 'Âm thanh cảnh báo',
      desc: 'Phát âm thanh khi có cảnh báo nghiêm trọng.',
      control: switchControl(s.sound, v => {
        store.set({ sound: v });
        utils.storage.set(VC.STORAGE.sound, v);
        VC.app.rerenderTopbar();
      })
    }));
    secGen.appendChild(settingRow({
      title: 'Ngôn ngữ',
      desc: 'Ngôn ngữ hiển thị của giao diện.',
      control: mkSelect({
        value: 'vi',
        options: [{ v: 'vi', l: 'Tiếng Việt' }, { v: 'en', l: 'English' }],
        onchange: v => notify.toast({ title: 'Ngôn ngữ', message: 'Đã chọn: ' + v, type: 'info' })
      })
    }));
    card.appendChild(secGen);

    const secAI = el('div', { class: 'settings-section' });
    secAI.appendChild(el('div', { class: 'settings-section__title', text: 'AI & Phát hiện' }));
    secAI.appendChild(settingRow({
      title: 'Ngưỡng tin cậy phát hiện ngã',
      desc: `Hiện tại: ${(s.thresholds.fallConfidence * 100).toFixed(0)}%`,
      control: rangeControl(s.thresholds.fallConfidence, 0.5, 0.99, 0.01, v => {
        store.state.thresholds.fallConfidence = v;
        utils.storage.set(VC.STORAGE.settings, s.thresholds);
        notify.toast({ title: 'Đã cập nhật', message: `Ngưỡng: ${(v * 100).toFixed(0)}%`, type: 'ok', duration: 1800 });
      })
    }));
    secAI.appendChild(settingRow({
      title: 'Thời gian bất động (giây)',
      desc: `Cảnh báo sau ${s.thresholds.inactivitySeconds}s bất động.`,
      control: rangeControl(s.thresholds.inactivitySeconds, 10, 120, 1, v => {
        store.state.thresholds.inactivitySeconds = v;
      })
    }));
    secAI.appendChild(settingRow({
      title: 'Cooldown cảnh báo (giây)',
      desc: `Chống spam cảnh báo trùng lặp trong ${s.thresholds.alertCooldown}s.`,
      control: rangeControl(s.thresholds.alertCooldown, 5, 60, 1, v => {
        store.state.thresholds.alertCooldown = v;
      })
    }));
    card.appendChild(secAI);

    const secCam = el('div', { class: 'settings-section' });
    secCam.appendChild(el('div', { class: 'settings-section__title', text: 'Camera' }));
    s.cameras.forEach(cam => {
      secCam.appendChild(settingRow({
        title: `${cam.name} · ${cam.zone}`,
        desc: `${cam.id.toUpperCase()} — ${cam.online ? `Đang hoạt động · ${cam.fps} FPS` : 'Ngoại tuyến'}`,
        control: switchControl(cam.online, v => {
          cam.online = v;
          cam.fps = v ? 30 : 0;
          notify.toast({ title: 'Đã cập nhật', message: `${cam.name} → ${v ? 'Bật' : 'Tắt'}`, type: 'ok', duration: 1800 });
          VC.app.rerender();
        })
      }));
    });
    card.appendChild(secCam);

    const secData = el('div', { class: 'settings-section' });
    secData.appendChild(el('div', { class: 'settings-section__title', text: 'Dữ liệu & Bảo mật' }));
    secData.appendChild(settingRow({
      title: 'Xuất lịch sử',
      desc: 'Tải về toàn bộ lịch sử cảnh báo dưới dạng CSV.',
      control: el('button', { class: 'btn btn--ghost btn--sm', onclick: exportCSV, html: icon('download') + ' Xuất' })
    }));
    secData.appendChild(settingRow({
      title: 'Xóa lịch sử',
      desc: 'Xóa toàn bộ cảnh báo đã lưu khỏi hệ thống.',
      control: el('button', {
        class: 'btn btn--danger btn--sm',
        onclick: async () => {
          const ok = await notify.confirm('Xóa toàn bộ lịch sử cảnh báo?', { danger: true, okLabel: 'Xóa' });
          if (!ok) return;
          store.set({ alerts: [] });
          notify.toast({ title: 'Đã xóa', message: 'Toàn bộ lịch sử đã được xóa.', type: 'ok' });
          VC.app.rerender();
        }
      }, 'Xóa')
    }));
    secData.appendChild(settingRow({
      title: 'Thông tin hệ thống',
      desc: `${VC.APP.name} v${VC.APP.version} · Build ${VC.APP.build}`,
      control: el('span', { class: 'badge badge--primary' }, 'Ổn định')
    }));
    card.appendChild(secData);

    const secAbout = el('div', { class: 'settings-section' });
    secAbout.appendChild(el('div', { class: 'settings-section__title', text: 'Về VigiCare' }));
    secAbout.appendChild(el('p', {
      style: 'font-size:12.5px;color:var(--text-dim);line-height:1.7;max-width:680px',
      html: `VigiCare là giải pháp AI giám sát an toàn cho người cao tuổi — phát hiện té ngã và các dấu hiệu bất thường theo thời gian thực. Hệ thống chạy hoàn toàn offline, sử dụng mô hình <b>RTMO</b>, <b>ByteTrack</b> và <b>Transformer</b> để phân tích chuỗi hành vi.`
    }));
    card.appendChild(secAbout);

    // ========== SECTION: USER GUIDE & HELP ==========
    const secGuide = el('div', { class: 'settings-section' });
    secGuide.appendChild(el('div', { class: 'settings-section__title', text: 'Hướng dẫn & Trợ giúp' }));
    secGuide.appendChild(settingRow({
      title: 'Màn hình chào mừng (Onboarding)',
      desc: 'Mở lại hướng dẫn 5 bước dành cho người dùng lần đầu sử dụng.',
      control: el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => VC.guide && VC.guide.showOnboarding({ startStep: 0 })
      }, '🚀 Mở Onboarding')
    }));
    secGuide.appendChild(settingRow({
      title: 'Tour giao diện tương tác',
      desc: 'Làm nổi bật trực quan từng khu vực quan trọng trên màn hình.',
      control: el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => VC.guide && VC.guide.startSpotlightTour()
      }, '🎯 Tour giao diện')
    }));
    secGuide.appendChild(settingRow({
      title: 'Trung tâm Trợ giúp & FAQ',
      desc: 'Xem chi tiết các tính năng, bảng phím tắt và câu hỏi thường gặp.',
      control: el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: () => VC.guide && VC.guide.showHelpCenter('start')
      }, '📖 Cẩm nang trợ giúp')
    }));
    secGuide.appendChild(settingRow({
      title: 'Đặt lại trạng thái người dùng mới',
      desc: 'Bật lại banner hướng dẫn nhanh và tự động mở onboarding khi tải lại trang.',
      control: el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => {
          utils.storage.remove(VC.STORAGE.guideSeen);
          utils.storage.remove(VC.STORAGE.guideBannerDismissed);
          notify.toast({
            title: 'Đã đặt lại',
            message: 'Đã khôi phục trạng thái người dùng mới. Tải lại trang để xem hướng dẫn chào mừng.',
            type: 'ok'
          });
        }
      }, '🔄 Đặt lại')
    }));
    card.appendChild(secGuide);

    // ========== SECTION: EMAIL TRIGGERS ==========
    const secEmail = el('div', { class: 'settings-section' });
    secEmail.appendChild(el('div', { class: 'settings-section__title', text: 'Gửi email cảnh báo' }));
    secEmail.appendChild(el('p', {
      style: 'font-size:11.5px;color:var(--muted);margin-bottom:12px',
      text: 'Chọn loại cảnh báo sẽ gửi qua Gmail khi được phát hiện.'
    }));

    fetch(api.url('/api/settings/email'))
      .then(r => r.json())
      .then(data => {
        const triggers = [
          { key: 'email_on_fall',          label: '🚨 Té ngã',           desc: 'Người ngã — ưu tiên cao' },
          { key: 'email_on_stroke',        label: '⚕️ Nghi đột quỵ',      desc: 'Dấu hiệu đột quỵ — cực kỳ khẩn cấp' },
          { key: 'email_on_zone_dwell',    label: '⚠️ Đứng lâu vùng cấm', desc: 'Ở trong vùng cấm 5-30 giây' },
          { key: 'email_on_zone_critical', label: '🚨 Khẩn cấp vùng cấm',  desc: 'Ở trong vùng cấm > 30 giây' },
        ];

        triggers.forEach(t => {
          secEmail.appendChild(settingRow({
            title: t.label,
            desc: t.desc,
            control: switchControl(data[t.key], async (v) => {
              const newData = { ...data, [t.key]: v };
              try {
                const r = await fetch(api.url('/api/settings/email'), {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newData)
                });
                const updated = await r.json();
                Object.assign(data, updated);
                notify.toast({
                  title: 'Đã cập nhật',
                  message: `${t.label}: ${v ? 'BẬT' : 'TẮT'}`,
                  type: v ? 'ok' : 'warn',
                  duration: 2000
                });
              } catch (err) {
                notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
              }
            })
          }));
        });
      })
      .catch(err => {
        secEmail.appendChild(el('div', {
          style: 'padding:10px;font-size:12px;color:var(--danger)',
          text: 'Không load được cấu hình: ' + err.message
        }));
      });

    card.appendChild(secEmail);
    root.appendChild(card);
  }

  function settingRow({ title, desc, control }) {
    return el('div', { class: 'settings-row' }, [
      el('div', { class: 'settings-row__info' }, [
        el('div', { class: 'settings-row__title', text: title }),
        el('div', { class: 'settings-row__desc', text: desc })
      ]),
      el('div', { style: 'flex-shrink:0' }, [control])
    ]);
  }

  function switchControl(checked, onchange) {
    const wrap = el('label', { class: 'switch' });
    const input = el('input', { type: 'checkbox' });
    input.checked = !!checked;
    input.addEventListener('change', e => onchange(e.target.checked));
    wrap.appendChild(input);
    wrap.appendChild(el('span', { class: 'switch__track' }));
    return wrap;
  }

  function rangeControl(value, min, max, step, oninput) {
    return el('input', {
      type: 'range', min, max, step, value,
      style: 'width:180px',
      oninput: e => oninput(parseFloat(e.target.value))
    });
  }

  function refreshOverviewRight() {
    const right = document.getElementById('overviewRightCol');
    if (!right) return false;
    const s = store.state;
    right.innerHTML = '';
    right.appendChild(alertCard(s.alerts[0]));
    right.appendChild(statsCard(s.metrics));
    right.appendChild(recentCard());
    return true;
  }

  VC.views = {
    refreshOverviewRight,
    overview: renderOverview,
    live: renderLive,
    history: renderHistory,
    analytics: renderAnalytics,
    settings: renderSettings,
    drawAllCharts
  };
})(window.VC);