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

    // 1. TOP ROW: 4-KPI Command Strip (replaces old right-side stats box & top banner)
    root.appendChild(overviewKpiStrip(s.metrics));

    // 2. MIDDLE ROW: Reversed Command Deck (Left 380px = Alert Dispatch + Recent Log; Right Main Stage = AI Camera + 6 Lake Stations)
    const deck = el('div', { class: 'command-deck' });

    const leftCol = el('div', { id: 'overviewRightCol' });
    leftCol.appendChild(alertCard(latest));
    leftCol.appendChild(recentCard());

    const rightStage = el('div');
    rightStage.appendChild(videoCard(s.activeCamera));
    rightStage.appendChild(stationStrip());

    deck.appendChild(leftCol);
    deck.appendChild(rightStage);
    root.appendChild(deck);

    // 3. BOTTOM ROW: 3-Pillar Hồ Đá AI Architecture & Status Bar
    root.appendChild(featureStrip());
    root.appendChild(statusBar());

    bindVideoControls(root);
  }

  function overviewKpiStrip(m) {
    const riskLabel = { low: 'AN TOÀN', medium: 'CHÚ Ý VEN HỒ', high: 'BÁO ĐỘNG ĐỎ' }[m.riskLevel] || 'AN TOÀN';
    const riskColor = { low: 'ok', medium: 'warn', high: 'danger' }[m.riskLevel] || 'ok';
    const plan = (VC.auth && VC.auth.plan()) || 'free';
    const user = VC.auth && VC.auth.user;

    return el('div', { class: 'kpi-strip' }, [
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-' + riskColor, text: '🌊' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Mức độ An toàn Bờ Hồ Đá' }),
          el('div', { class: `kpi-tile__val is-${riskColor}`, text: riskLabel }),
          el('div', { class: 'kpi-tile__sub', text: 'Giám sát vách đá & mép nước 24/7' })
        ])
      ]),
      el('div', { class: 'kpi-tile', style: 'cursor:pointer', onclick: () => VC.app.go('history') }, [
        el('div', { class: 'kpi-tile__icon is-danger', text: '🚨' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Sự cố Phát hiện Hôm nay' }),
          el('div', { class: 'kpi-tile__val is-danger', text: String(m.totalAlerts) }),
          el('div', { class: 'kpi-tile__sub', text: 'Nhấn để tra cứu nhật ký →' })
        ])
      ]),
      el('div', { class: 'kpi-tile', style: 'cursor:pointer', onclick: () => VC.app.go('live') }, [
        el('div', { class: 'kpi-tile__icon is-primary', text: '📹' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Trạm Camera Quanh Hồ Đá' }),
          el('div', { class: 'kpi-tile__val is-primary', text: `${m.activeCameras}/${m.totalCameras} Trạm` }),
          el('div', { class: 'kpi-tile__sub', text: 'Khu đô thị ĐHQG TP.HCM' })
        ])
      ]),
      el('div', { class: 'kpi-tile', style: 'cursor:pointer', onclick: () => VC.app.go('upgrade') }, [
        el('div', { class: 'kpi-tile__icon is-warn', text: '👑' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Gói Vận hành & Thương mại' }),
          el('div', { class: 'kpi-tile__val', style: 'font-size:16px', text: plan === 'free' ? 'Miễn phí (1/6 Trạm)' : (user ? user.planName : 'Gói Pro') }),
          el('div', { class: 'kpi-tile__sub', style: 'color:var(--primary);font-weight:600', text: plan === 'free' ? 'Nâng cấp Pro 10.000đ / Đa lĩnh vực →' : 'Đã mở khóa bản quyền trọn đời' })
        ])
      ])
    ]);
  }

  function stationStrip() {
    const s = store.state;
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('map') }),
        'Chuyển nhanh 6 Trạm Camera Vành đai Hồ Đá ĐHQG-HCM'
      ]),
      el('button', { class: 'btn btn--flat btn--sm', onclick: () => VC.app.go('live') }, 'Mở lưới 6 trạm →')
    ]));

    const grid = el('div', { class: 'station-grid' });
    s.cameras.forEach(cam => {
      const locked = Boolean(cam.locked);
      const active = cam.id === s.activeCamera;
      const chip = el('div', {
        class: `station-chip ${active ? 'is-active' : ''}`,
        onclick: () => {
          if (locked && VC.auth) {
            VC.auth.upsell(
              `Mở khóa trạm "${cam.name}"`,
              'Gói Miễn phí hỗ trợ 1 trạm camera bờ hồ. Nâng cấp Pro (10.000đ) hoặc Business (599.000đ) để giám sát toàn bộ các trạm quanh Hồ Đá hoặc triển khai cho Trường mầm non / Viện dưỡng lão.'
            );
            return;
          }
          store.set({ activeCamera: cam.id });
          VC.app.rerender();
        }
      }, [
        el('span', { class: `dot ${cam.online && !locked ? '' : 'is-off'}`, style: `width:8px;height:8px;border-radius:50%;background:${locked ? '#f59e0b' : (cam.online ? 'var(--ok)' : 'var(--muted)')}` }),
        el('div', { style: 'min-width:0;flex:1' }, [
          el('div', { class: 'station-chip__name', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text: (locked ? '🔒 ' : '') + cam.name }),
          el('div', { class: 'station-chip__zone', text: cam.zone })
        ])
      ]);
      grid.appendChild(chip);
    });
    card.appendChild(grid);
    return card;
  }

  function videoCard(camId) {
    const cam = VC.CAMERAS.find(c => c.id === camId) || VC.CAMERAS[0];
    const paused = store.state.livePaused;

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        `TRẠM AI · ${escape(cam.name)} (${escape(cam.zone)})`
      ]),
      el('span', { class: `badge badge--${cam.online ? 'ok' : 'muted'}` },
        cam.online ? '● Trực tuyến' : '○ Ngoại tuyến')
    ]));

    card.appendChild(cameraPicker());
    const video = createCameraSurface(cam, 'Live');
    card.appendChild(video);

    card.appendChild(el('div', { class: 'video-controls' }, [
      el('button', {
        class: `btn btn--ghost btn--sm ${paused ? 'is-active' : ''}`,
        'data-action': 'pause',
        title: paused ? 'Tiếp tục luồng video' : 'Tạm dừng khung hình',
        html: icon(paused ? 'play' : 'pause') + (paused ? ' Tiếp tục' : ' Tạm dừng')
      }),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        'data-action': 'fullscreen',
        title: 'Phóng to toàn màn hình',
        html: icon('expand') + ' Toàn màn hình'
      }),
      el('div', { class: 'video-controls__spacer' }),
      el('span', { class: 'video-controls__info' }, 'YOLOv8x-Pose · ByteTrack · Giám sát Bờ Hồ Đá ĐHQG-HCM')
    ]));

    return card;
  }

  function cameraPicker() {
    const devices = VC.camera.getDevices();
    const select = el('select', {
      class: 'camera-picker__select',
      'aria-label': 'Chọn nguồn camera thu hình'
    });
    if (!devices.length) {
      select.appendChild(el('option', {}, 'Camera mặc định của thiết bị'));
    } else {
      devices.forEach((device, index) => {
        select.appendChild(el('option', {
          value: device.deviceId,
          selected: device.deviceId === VC.camera.currentDeviceId()
        }, device.label || `Camera trạm ${index + 1}`));
      });
    }
    select.addEventListener('change', async () => {
      try {
        await VC.camera.enable(select.value);
        VC.app.rerender();
        notify.toast({ title: 'Đã chuyển nguồn thu hình', message: select.options[select.selectedIndex].text, type: 'ok' });
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
          notify.toast({ title: 'Đã chuyển sang luồng AI Server', message: 'Đang hiển thị luồng xử lý từ trạm AI.', type: 'info' });
          return;
        }
        try {
          await VC.camera.enable(select.value);
          VC.app.rerender();
          notify.toast({ title: 'Đã kết nối Camera thực tế', message: 'Đang phân tích tư thế & vùng cấm bờ hồ theo thời gian thực.', type: 'ok' });
        } catch (error) {
          notify.toast({
            title: 'Không thể mở camera',
            message: `${error.message} Hãy cấp quyền truy cập camera trên trình duyệt.`,
            type: 'danger',
            duration: 5000
          });
        }
      }
    }, isCamActive ? 'Đang dùng Camera Thiết bị (Nhấn để tắt)' : '🎥 Kết nối Camera Thực tế');

    return el('div', { class: 'camera-picker' }, [
      el('span', { class: 'camera-picker__label', text: 'Nguồn thu hình:' }),
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
    '#0d9488', '#0284c7', '#facc15', '#4ade80', '#2dd4bf',
    '#38bdf8', '#818cf8', '#06b6d4', '#f59e0b', '#fb7185',
    '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#14b8a6',
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
        ctx.fillStyle = isCrit ? 'rgba(225, 29, 72, 0.25)' : 'rgba(245, 158, 11, 0.25)';
        ctx.fill();
        ctx.strokeStyle = isCrit ? '#e11d48' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 13px Be Vietnam Pro, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`VÙNG CẤM BỜ HỒ: ${z.name || ''}`, mapX((poly[0][0] * fw) / 1280) + 6, mapY((poly[0][1] * fh) / 720) + 18);
        ctx.restore();
      });

      dets.forEach((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        const bx = mapX(x1);
        const by = mapY(y1);
        const bw = (x2 - x1) * scale;
        const bh = (y2 - y1) * scale;
        const score = d.score || 0.9;
        const posture = d.posture || 'normal';
        const isFall = posture === 'fall' || posture === 'faint';

        const boxColor = isFall ? '#e11d48' : '#10b981';
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);

        const tag = posture === 'faint' ? 'BAT TINH VEN HO' : (posture === 'fall' ? 'TRUOT NGA MEP HO' : 'NGUOI VEN HO');
        const label = `${tag} ${score.toFixed(2)}`;
        ctx.font = 'bold 12px JetBrains Mono, monospace';
        const tw = ctx.measureText(label).width;
        const labelY = Math.max(4, by - 22);
        ctx.fillStyle = boxColor;
        ctx.fillRect(bx, labelY, tw + 12, 22);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, bx + 6, labelY + 15);

        const kpts = d.keypoints;
        if (kpts && kpts.length >= 17) {
          ctx.strokeStyle = '#38bdf8';
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

      let evY = 32;
      events.forEach((ev) => {
        const type = (ev.type || '').toUpperCase();
        const conf = Math.round((ev.confidence || 0.8) * 100);
        const text = `⚠ ${type} ${conf}%`;

        ctx.font = 'bold 15px Be Vietnam Pro, sans-serif';
        const ew = ctx.measureText(text).width;
        ctx.fillStyle = ev.type === 'fall' || ev.type === 'stroke' ? 'rgba(225, 29, 72, 0.92)' : 'rgba(245, 158, 11, 0.92)';
        ctx.fillRect(canvas.width - ew - 24, evY - 20, ew + 16, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, canvas.width - ew - 16, evY);
        evY += 32;
      });

      const badgeEl = document.getElementById('aiLiveBadge');
      const badgeTextEl = document.getElementById('aiLiveBadgeText');
      const statusTextEl = document.getElementById('aiStatusText');
      const statusDotEl = document.getElementById('aiStatusDot');

      const hasFall = dets.some(d => d.posture === 'fall' || d.posture === 'faint') ||
                      events.some(e => e.type === 'fall' || e.type === 'stroke');

      if (dets.length > 0) {
        const bestScore = Math.round(Math.max(...dets.map(d => d.score || 0.85)) * 100);
        if (hasFall) {
          if (badgeEl) badgeEl.style.background = 'rgba(225, 29, 72, 0.95)';
          if (badgeTextEl) badgeTextEl.textContent = `⚠ NGUY CẤP BỜ HỒ: Phát hiện ${dets.length} người — TRƯỢT NGÃ / BẤT TỈNH VEN HỒ (${bestScore}%)`;
          if (statusTextEl) statusTextEl.textContent = `⚠ CẢNH BÁO KHẨN: Phát hiện ${dets.length} người gặp nạn sát bờ Hồ Đá!`;
          if (statusDotEl) statusDotEl.className = 'status-pill is-warn';
        } else {
          if (badgeEl) badgeEl.style.background = 'rgba(13, 148, 136, 0.92)';
          if (badgeTextEl) badgeTextEl.textContent = `✅ Đang giám sát: ${dets.length} người khu vực bờ hồ · Trạng thái: An toàn (${bestScore}%)`;
          if (statusTextEl) statusTextEl.textContent = `✅ Nhận diện ${dets.length} người quanh bờ Hồ Đá · Chưa vượt rào / vùng cấm`;
          if (statusDotEl) statusDotEl.className = 'status-pill';
        }
      } else {
        if (badgeEl) badgeEl.style.background = 'rgba(2, 132, 199, 0.88)';
        if (badgeTextEl) badgeTextEl.textContent = 'Đang quét vành đai bờ Hồ Đá — Chưa phát hiện người xâm nhập vùng nguy hiểm';
        if (statusTextEl) statusTextEl.textContent = 'Khu vực mép vực Hồ Đá thông thoáng (0 người trong vùng cấm)';
      }
    });
  }

  function createCameraSurface(cam, label) {
    const surface = el('div', { class: 'video' });
    const fallbackSrc = VC.LAKE_FALLBACK_IMG || '';
    if (VC.camera.isActive()) {
      const localVideo = el('video', {
        class: 'video__local',
        autoplay: true,
        muted: true,
        playsinline: true,
        'aria-label': `Trạm Camera ${cam.name}`
      });
      surface.appendChild(localVideo);
      VC.camera.attach(localVideo);

      const canvas = el('canvas', {
        class: 'video__canvas',
        style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3'
      });
      surface.appendChild(canvas);
      bindCanvasDrawer(canvas, localVideo);

      surface.appendChild(el('div', {
        id: 'aiLiveBadge',
        style: 'position:absolute;bottom:12px;left:14px;background:rgba(13,148,136,0.92);color:#fff;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:600;display:flex;align-items:center;gap:6px;z-index:5;transition:background 0.2s'
      }, [
        el('span', { class: 'dot' }),
        el('span', { id: 'aiLiveBadgeText' }, 'AI Thị giác máy tính sẵn sàng — Đang quét khu vực bờ Hồ Đá')
      ]));
    } else {
      const fallback = el('img', {
        src: VC.api.streamUrl(),
        alt: cam.name,
        onerror: () => { fallback.src = fallbackSrc; }
      });
      surface.appendChild(fallback);
    }
    surface.appendChild(el('div', { class: 'video__top' }, [
      el('span', { class: 'video__tag' }, label === 'Live' ? fmtDateTime() : 'LIVE · HỒ ĐÁ ĐHQG'),
      el('span', { class: 'video__tag' }, 'AI-VISION · ' + escape(cam.id.toUpperCase()))
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
          'Trực ban Cảnh báo Hồ Đá'
        ]),
        el('span', { class: 'badge badge--ok' }, 'An toàn')
      ]));
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', html: '🌊' }),
        el('div', { class: 'empty__title', text: 'Bờ Hồ Đá đang an toàn' }),
        el('div', { class: 'empty__desc', text: 'Không phát hiện người vượt rào hoặc trượt ngã sát vách đá.' })
      ]));
      return card;
    }

    const isCritical = alert.type === 'fall' || alert.type === 'stroke' || alert.type === 'zone_critical';
    const card = el('div', { class: `card ${isCritical ? 'alert-card card--glow-danger' : ''}` });

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: `ico ${isCritical ? 'is-danger' : ''}`, html: icon('alert') }),
        'BÁO ĐỘNG · ' + escape(alert.typeLabel).toUpperCase()
      ]),
      el('span', { class: `badge badge--${alert.status === 'pending' ? 'danger' : 'warn'}` },
        alert.status === 'pending' ? 'Cần ứng cứu' : 'Đang xử lý')
    ]));

    card.appendChild(el('div', { class: 'alert-body' }, [
      el('div', { class: 'alert-thumb', text: alert.typeIcon || '🚨' }),
      el('div', { class: 'alert-info' }, [
        el('div', { class: 'alert-title' }, `${escape(alert.cameraName)} · ${escape(alert.zone)}`),
        el('div', { class: 'alert-meta', html: icon('clock') + ' ' + escape(fmtDateTime(new Date(alert.ts))) }),
        el('div', { class: 'alert-meta', html: icon('activity') + ` Độ tin cậy AI: <b>${(alert.confidence * 100).toFixed(0)}%</b>` }),
        el('div', { class: 'progress', style: 'margin-top:6px' }, [
          el('div', { class: `progress__fill ${isCritical ? 'is-danger' : 'is-warn'}`, style: `width:${alert.confidence * 100}%` })
        ])
      ])
    ]));

    // Clean, minimal 3-button dispatch bar
    card.appendChild(el('div', { class: 'alert-actions', style: 'flex-wrap:wrap' }, [
      el('button', { class: 'btn btn--danger btn--sm', 'data-act': 'call', 'data-id': alert.id, title: 'Liên hệ Đội Bảo vệ ĐHQG / Cứu hộ 115' }, '📞 Báo Bảo vệ / 115'),
      el('button', { class: 'btn btn--primary btn--sm', 'data-act': 'resolve', 'data-id': alert.id }, '✓ Đã xử lý'),
      el('button', { class: 'btn btn--ghost btn--sm', 'data-act': 'detail', 'data-id': alert.id }, 'Chi tiết')
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
        title: `Hồ sơ sự cố bờ hồ #${alert.id}`,
        body: `
          <div style="display:grid;grid-template-columns:130px 1fr;gap:12px 16px;font-size:13px;color:var(--text-dim)">
            <div style="color:var(--muted)">Sự cố nhận diện</div><div><b>${escape(alert.typeLabel)}</b></div>
            <div style="color:var(--muted)">Trạm Camera</div><div>${escape(alert.cameraName)} — ${escape(alert.zone)}</div>
            <div style="color:var(--muted)">Thời điểm</div><div>${escape(fmtDateTime(new Date(alert.ts)))}</div>
            <div style="color:var(--muted)">Độ tin cậy AI</div><div>${(alert.confidence * 100).toFixed(1)}%</div>
            <div style="color:var(--muted)">Trạng thái</div><div>${escape((VC.STATUS[alert.status] || {}).label || alert.status)}</div>
            <div style="color:var(--muted)">Tọa độ / Khu vực</div><div>Khu vực Hồ Đá — ĐHQG TP.HCM (${escape(alert.note || 'Đã ghi nhận tự động từ AI Camera')})</div>
          </div>
        `,
        actions: [
          { label: 'Đóng', value: 'close', class: 'btn--ghost' },
          { label: 'Báo nhầm', value: 'dismiss', class: 'btn--ghost' },
          { label: '✓ Đánh dấu đã xử lý', value: 'resolve', class: 'btn--primary' }
        ]
      });
      if (v === 'resolve') handleAlertAction('resolve', id);
      if (v === 'dismiss') handleAlertAction('dismiss', id);
      return;
    }

    if (act === 'call') {
      await openEmergencyCallModal(alert);
      return;
    }

    if (act === 'resolve') {
      store.updateAlert(id, { status: 'resolved', resolvedAt: Date.now() });
      notify.toast({ title: 'Đã xử lý sự cố', message: `Sự cố ${id} tại bờ Hồ Đá đã được đánh dấu hoàn tất.`, type: 'ok' });
      notify.alarm('ok');
      VC.app.rerender();
      return;
    }

    if (act === 'dismiss') {
      store.updateAlert(id, { status: 'dismissed', resolvedAt: Date.now() });
      notify.toast({ title: 'Đã cập nhật', message: `Sự cố ${id} được ghi nhận là cảnh báo thử / báo nhầm.`, type: 'warn' });
      VC.app.rerender();
    }
  }

  async function openEmergencyCallModal(alert) {
    if (VC.auth && !VC.auth.can('emergencyCall')) {
      const body = el('div', { class: 'upsell' }, [
        el('div', { class: 'upsell__icon', text: '📞' }),
        el('div', { class: 'upsell__title', text: 'Điều phối Khẩn cấp Đội Bảo vệ ĐHQG & Cứu hộ' }),
        el('p', { class: 'upsell__desc', text: 'Gói Miễn phí hỗ trợ gọi Cứu hộ 115 / 114 thủ công. Nâng cấp gói Pro (10.000đ) để lưu danh bạ Chốt Bảo vệ ĐHQG, Ban Quản lý Làng Đại học (hoặc Phụ huynh / Y tế khi triển khai tại Trường mầm non, Viện dưỡng lão) và gọi tự động.' }),
        el('a', { class: 'btn btn--danger btn--block', href: 'tel:115' }, '🚨 Gọi Cấp cứu / Cứu hộ 115 ngay')
      ]);
      const up = await notify.modal({
        title: '📞 Liên hệ Ứng cứu Khẩn cấp Hồ Đá',
        width: 460,
        body,
        actions: [
          { label: 'Đóng', value: false, class: 'btn--ghost' },
          { label: '👑 Mở khóa Pro (10.000đ)', value: true, class: 'btn--primary' }
        ]
      });
      if (up) VC.app.go('upgrade');
      return;
    }

    let contacts = [];
    try {
      const res = await VC.auth.request('/api/emergency/contacts');
      contacts = res.items || [];
    } catch (e) { /* ignore */ }

    const list = el('div', { style: 'display:grid;gap:8px;margin-top:8px' });
    if (!contacts.length) {
      list.appendChild(el('div', { class: 'billing-muted', text: 'Chưa có số hotline Chốt Bảo vệ ĐHQG. Bạn có thể thêm trong mục Cài đặt → Danh bạ ứng cứu.' }));
    } else {
      contacts.forEach(c => {
        list.appendChild(el('div', { class: 'account-box__row' }, [
          el('div', {}, [
            el('b', { text: c.name + (c.relation ? ` (${c.relation})` : '') }),
            el('div', { class: 'billing-sub table__mono', text: c.phone })
          ]),
          el('a', { class: 'btn btn--primary btn--sm', href: `tel:${c.phone}` }, '📞 Gọi ngay')
        ]));
      });
    }
    list.appendChild(el('a', { class: 'btn btn--danger btn--block', href: 'tel:115', style: 'margin-top:6px' }, '🚨 Gọi Cứu hộ Khẩn cấp 115 / 114'));

    const v = await notify.modal({
      title: `📞 Điều phối Ứng cứu · ${alert ? alert.cameraName : 'Hồ Đá ĐHQG'}`,
      width: 460,
      body: list,
      actions: [
        { label: 'Đóng', value: 'close', class: 'btn--ghost' },
        { label: 'Cấu hình danh bạ', value: 'settings', class: 'btn--ghost' }
      ]
    });
    if (v === 'settings') VC.app.go('settings');
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
        'Nhật ký Sự cố Bờ hồ Gần đây'
      ]),
      el('button', { class: 'btn btn--flat btn--sm', onclick: () => VC.app.go('history') }, 'Tất cả →')
    ]));

    const items = store.state.alerts.slice(0, 5);
    if (!items.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📭' }), 'Chưa ghi nhận sự cố nào'
      ]));
      return card;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Giờ</th><th>Sự cố</th><th>Trạm bờ hồ</th><th>TT</th></tr></thead>
      <tbody>
        ${items.map(a => `
          <tr>
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
        'Công nghệ Thị giác Máy tính & Camera AI Bảo vệ An toàn Hồ Đá — ĐHQG TP.HCM'
      ]),
      el('span', { class: 'card__sub', text: 'YOLOv8x-Pose · ByteTrack · Geofencing Polygon' })
    ]));

    const items = [
      ['🌊', 'Khoanh vùng cấm sát vách đá & mép nước', 'Thiết lập hàng rào ảo (Polygon Geofencing) dọc các vách đá dựng đứng, mỏm đá tử thần và khu vực nước sâu tại cụm Hồ Đá ĐHQG-HCM.'],
      ['🎯', 'Nhận diện tư thế 17 khớp xương thời gian thực', 'Mô hình YOLOv8x-Pose kết hợp ByteTrack phân tích hành vi vượt rào, đứng chênh vênh sát mép vực, trượt ngã hoặc đuối sức ven hồ.'],
      ['🚨', 'Báo động đa kênh tới Chốt Bảo vệ ĐHQG', 'Tự động kích hoạt còi cảnh báo tại trạm, gửi ảnh chụp hiện trường qua Email và điều phối Đội tuần tra Khu đô thị ĐHQG ứng cứu kịp thời.']
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
        el('span', { text: 'Trung tâm Giám sát An toàn Hồ Đá — Khu đô thị ĐHQG TP.HCM' }),
        el('span', { class: 'kbd', text: 'v' + VC.APP.version })
      ]),
      el('div', { class: 'statusbar__group' }, [
        el('span', { id: 'aiStatusDot', class: `status-pill ${pending ? 'is-warn' : ''}` }),
        el('span', { id: 'aiStatusText', text: pending ? `${pending} sự cố ven hồ đang chờ xử lý` : 'AI Camera đang quét vành đai bờ Hồ Đá theo thời gian thực' })
      ])
    ]);
  }

  /* ---------------- LIVE ---------------- */
  function renderLive(root) {
    const s = store.state;
    root.innerHTML = '';
    const fallbackSrc = VC.LAKE_FALLBACK_IMG || '';

    // Reordered layout: Left column = 6-Station Perimeter List; Right column = Large Active Station Feed
    const deck = el('div', { class: 'command-deck' });

    const leftList = el('div', { class: 'card' });
    leftList.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('map') }),
        '6 Trạm Camera Vành đai Hồ Đá'
      ]),
      el('span', { class: 'badge badge--ok', text: `${store.activeCameras()}/${s.cameras.length} Online` })
    ]));

    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr;gap:10px' });
    s.cameras.forEach(cam => {
      const locked = Boolean(cam.locked);
      const tile = el('div', { class: `cam-tile ${cam.id === s.activeCamera ? 'is-active' : ''}`, style: 'aspect-ratio:16/8' }, [
        el('img', {
          src: VC.api.streamUrl(),
          alt: cam.name,
          loading: 'lazy',
          onerror: function () { this.src = fallbackSrc; }
        }),
        el('div', { class: 'cam-tile__overlay' }, [
          el('div', { class: 'cam-tile__name', text: `${cam.name} · ${cam.zone}` }),
          el('div', { class: `cam-tile__status ${cam.online && !locked ? '' : 'is-off'}` })
        ]),
        locked ? el('div', { class: 'cam-tile__lock' }, [
          el('div', { text: '🔒 Trạm nâng cao (Gói Pro / Business)' }),
          el('span', { text: '👑 Mở khóa 10.000đ trọn đời' })
        ]) : (!cam.online ? el('div', {
          style: 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(12,30,44,0.65);color:#fff;font-size:12px'
        }, 'Trạm tạm nghỉ / Bảo trì') : null)
      ]);
      tile.addEventListener('click', () => {
        if (locked && VC.auth) {
          VC.auth.upsell(
            `Mở khóa trạm "${cam.name}"`,
            'Gói Miễn phí hỗ trợ 1 trạm camera. Nâng cấp Pro (10.000đ — tối đa 4 camera) hoặc Business (599.000đ — không giới hạn) để giám sát toàn bộ chu vi Hồ Đá ĐHQG-HCM.'
          );
          return;
        }
        store.set({ activeCamera: cam.id });
        notify.toast({ title: 'Đã chuyển trạm quan sát', message: `${cam.name} · ${cam.zone}`, type: 'info', duration: 2200 });
        VC.app.rerender();
      });
      grid.appendChild(tile);
    });
    leftList.appendChild(grid);

    const rightMain = el('div');
    const single = el('div', { class: 'card' });
    const cam = s.cameras.find(c => c.id === s.activeCamera) || s.cameras[0];
    single.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        `LUỒNG TRỰC TIẾP · ${escape(cam.name)} (${escape(cam.zone)})`
      ]),
      el('span', { class: `badge badge--${cam.online ? 'ok' : 'muted'}` }, cam.online ? '● Đang truyền tín hiệu' : '○ Ngoại tuyến')
    ]));
    single.appendChild(cameraPicker());
    const video = createCameraSurface(cam, 'Live');
    single.appendChild(video);
    rightMain.appendChild(single);

    deck.appendChild(leftList);
    deck.appendChild(rightMain);
    root.appendChild(deck);
  }

  /* ---------------- HISTORY ---------------- */
  function renderHistory(root) {
    const s = store.state;
    root.innerHTML = '';

    // Top summary strip for History
    const total = s.alerts.length;
    const critCount = s.alerts.filter(a => a.severity === 'danger').length;
    const resolvedCount = s.alerts.filter(a => a.status === 'resolved').length;
    root.appendChild(el('div', { class: 'kpi-strip', style: 'grid-template-columns:repeat(3,1fr)' }, [
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-primary', text: '📋' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Tổng Nhật ký Sự cố Hồ Đá' }),
          el('div', { class: 'kpi-tile__val is-primary', text: `${total} bản ghi` })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-danger', text: '🚨' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Sự cố Nguy cấp Sát Mép vực' }),
          el('div', { class: 'kpi-tile__val is-danger', text: `${critCount} sự cố` })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-ok', text: '✅' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Đã Xử lý Bởi Đội Tuần tra' }),
          el('div', { class: 'kpi-tile__val is-ok', text: `${resolvedCount} sự cố` })
        ])
      ])
    ]));

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('clock') }),
        'Tra cứu Nhật ký Cảnh báo An toàn Hồ Đá ĐHQG-HCM'
      ]),
      el('div', { style: 'display:flex;gap:8px' }, [
        el('button', { class: 'btn btn--ghost btn--sm', onclick: exportCSV, html: icon('download') + ' Xuất báo cáo CSV' })
      ])
    ]));

    if (VC.auth && VC.auth.historyDays()) {
      card.appendChild(el('div', { class: 'pro-banner' }, [
        el('span', { text: `⏳ Gói Miễn phí lưu trữ nhật ký ${VC.auth.historyDays()} ngày gần nhất. Nâng cấp Pro (10.000đ) để lưu trữ vĩnh viễn & xuất báo cáo CSV.` }),
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => VC.app.go('upgrade') }, '👑 Nâng cấp Pro')
      ]));
    }

    const f = s.filters;
    const filters = el('div', { class: 'filters' });
    filters.appendChild(mkInput({ placeholder: 'Tìm mã sự cố, trạm camera bờ hồ, loại cảnh báo…', value: f.search, oninput: utils.debounce(v => {
      store.state.filters.search = v; store.state.filters.page = 1;
      VC.app.rerender();
    }, 250) }));
    filters.appendChild(mkSelect({
      value: f.type,
      options: [{ v: 'all', l: 'Tất cả loại sự cố' }, ...Object.values(VC.ALERT_TYPES).map(t => ({ v: t.id, l: t.label }))],
      onchange: v => { store.state.filters.type = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(mkSelect({
      value: f.camera,
      options: [{ v: 'all', l: 'Tất cả trạm bờ hồ' }, ...s.cameras.map(c => ({ v: c.id, l: c.name }))],
      onchange: v => { store.state.filters.camera = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(mkSelect({
      value: f.status,
      options: [{ v: 'all', l: 'Tất cả trạng thái' }, ...Object.values(VC.STATUS).map(x => ({ v: x.id, l: x.label }))],
      onchange: v => { store.state.filters.status = v; store.state.filters.page = 1; VC.app.rerender(); }
    }));
    filters.appendChild(el('button', {
      class: 'btn btn--flat btn--sm',
      onclick: () => {
        store.set({ filters: { search: '', type: 'all', camera: 'all', status: 'all', from: '', to: '', page: 1, pageSize: s.filters.pageSize } });
        VC.app.rerender();
      }
    }, 'Đặt lại bộ lọc'));
    card.appendChild(filters);

    const { items, total: filteredTotal, page, totalPages } = store.paginatedAlerts();
    if (!items.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '🔍' }),
        el('div', { class: 'empty__title', text: 'Không tìm thấy sự cố phù hợp' }),
        el('div', { class: 'empty__desc', text: 'Thử thay đổi bộ lọc trạm camera hoặc loại cảnh báo.' })
      ]));
    } else {
      const table = el('table', { class: 'table' });
      table.innerHTML = `
        <thead>
          <tr><th>Mã</th><th>Thời điểm</th><th>Loại sự cố bờ hồ</th><th>Trạm Camera</th><th>Độ tin cậy AI</th><th>Trạng thái</th><th></th></tr>
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
              <td><button class="btn btn--flat btn--sm" data-view="${escape(a.id)}">Chi tiết</button></td>
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
        el('div', {}, `Hiển thị ${items.length} / ${filteredTotal} sự cố · Trang ${page} / ${totalPages}`),
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
    if (VC.auth && !VC.auth.can('exportCsv')) {
      VC.auth.upsell('Xuất báo cáo CSV An toàn Hồ Đá', 'Tính năng xuất toàn bộ nhật ký sự cố ra file Excel / CSV dành cho gói Pro (10.000đ) và Business (599.000đ).');
      return;
    }
    const rows = store.filteredAlerts();
    if (!rows.length) {
      notify.toast({ title: 'Không có dữ liệu', message: 'Không có cảnh báo nào để xuất.', type: 'warn' });
      return;
    }
    const columns = [
      { label: 'ID', get: r => r.id },
      { label: 'Thời gian', get: r => new Date(r.ts).toISOString() },
      { label: 'Loại sự cố', get: r => r.typeLabel },
      { label: 'Trạm Camera Hồ Đá', get: r => r.cameraName },
      { label: 'Tuyến / Khu vực', get: r => r.zone },
      { label: 'Độ tin cậy AI', get: r => (r.confidence * 100).toFixed(1) + '%' },
      { label: 'Trạng thái', get: r => statusLabel(r.status) },
      { label: 'Ghi chú', get: r => r.note || '' }
    ];
    const csv = toCSV(rows, columns);
    const fn = `safezone-hoda-history-${fmtDateInput()}.csv`;
    download(fn, csv);
    notify.toast({ title: 'Đã xuất báo cáo CSV', message: `Lưu ${rows.length} sự cố vào ${fn}`, type: 'ok' });
  }

  /* ---------------- ANALYTICS ---------------- */
  const CHART_REGISTRY = [];

  function renderAnalytics(root) {
    const s = store.state;
    root.innerHTML = '';

    // 1. TOP ROW: KPI Summary Strip
    const total = s.alerts.length;
    const resolvedRate = total ? Math.round(s.alerts.filter(a => a.status === 'resolved').length / total * 100) : 0;
    const avgConf = total ? (s.alerts.reduce((x, a) => x + a.confidence, 0) / total * 100).toFixed(1) : '0.0';
    root.appendChild(el('div', { class: 'kpi-strip', style: 'grid-template-columns:repeat(3,1fr)' }, [
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-primary', text: '📊' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Tổng Sự kiện Ghi nhận Quanh Hồ Đá' }),
          el('div', { class: 'kpi-tile__val is-primary', text: String(total) })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-ok', text: '✅' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Tỷ lệ Đội Tuần tra ĐHQG Xử lý' }),
          el('div', { class: 'kpi-tile__val is-ok', text: resolvedRate + '%' })
        ])
      ]),
      el('div', { class: 'kpi-tile' }, [
        el('div', { class: 'kpi-tile__icon is-warn', text: '🎯' }),
        el('div', { class: 'kpi-tile__body' }, [
          el('div', { class: 'kpi-tile__label', text: 'Độ Tin cậy Nhận diện AI Trung bình' }),
          el('div', { class: 'kpi-tile__val is-primary', text: avgConf + '%' })
        ])
      ])
    ]));

    // 2. SWAPPED CHARTS GRID: Left = Donut by Type + Bars by Station; Right = Hourly Risk Bars + 7-Day Trend Line
    const wrap = el('div', { class: 'grid-2' });
    const left = el('div');
    const right = el('div');

    const byType = api.aggregateByType(s.alerts);
    left.appendChild(donutCard('Cơ cấu Loại Sự cố An toàn tại Hồ Đá', byType));

    const byCam = api.aggregateByCamera(s.alerts, s.cameras);
    const camCard = el('div', { class: 'card' });
    camCard.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Mật độ Cảnh báo theo Trạm Camera Bờ Hồ'
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
    left.appendChild(camCard);

    const byHour = api.aggregateByHour(s.alerts.filter(a => a.ts > Date.now() - 7 * 86400000));
    right.appendChild(chartCard('Khung Giờ Nguy cơ Cao Quanh Hồ Đá (24h)', 'bar', byHour, { color: '#0284c7' }));

    const byDay = api.aggregateByDay(s.alerts, 7);
    right.appendChild(chartCard('Xu hướng Cảnh báo 7 Ngày Qua tại Hồ Đá ĐHQG', 'line', byDay, { color: '#0d9488' }));

    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);

    requestAnimationFrame(() => drawAllCharts());
  }

  function chartCard(title, type, data, { color = '#0d9488' } = {}) {
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
    const palette = ['#0d9488', '#0284c7', '#f59e0b', '#e11d48', '#10b981'];
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

    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = 'rgba(100,116,139,0.75)';
      ctx.font = '10px Be Vietnam Pro, sans-serif';
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
    grad.addColorStop(0, color + '88');
    grad.addColorStop(0.6, color + '33');
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
      ctx.fillStyle = 'rgba(100,116,139,0.85)';
      ctx.font = '10px Be Vietnam Pro, sans-serif';
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

    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
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
        ctx.fillStyle = 'rgba(100,116,139,0.85)';
        ctx.font = '10px Be Vietnam Pro, sans-serif';
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
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-3').trim() || '#ffffff';
    ctx.fill();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#0c1e2c';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 20px Be Vietnam Pro, sans-serif';
    ctx.fillText(String(total), cx, cy - 4);
    ctx.fillStyle = 'rgba(100,116,139,0.85)';
    ctx.font = '10px Be Vietnam Pro, sans-serif';
    ctx.fillText('sự cố', cx, cy + 14);
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings(root) {
    const s = store.state;
    root.innerHTML = '';

    // 2-Column Settings Grid for a clean, distinct layout
    const grid = el('div', { class: 'grid-2' });
    const leftCol = el('div');
    const rightCol = el('div');

    // LEFT CARD 1: AI & Lake Perimeter Detection
    const cardAI = el('div', { class: 'card' });
    cardAI.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Cấu hình AI Thị giác Máy tính Hồ Đá'
      ])
    ]));
    const secAI = el('div', { class: 'settings-section' });
    secAI.appendChild(settingRow({
      title: 'Ngưỡng độ tin cậy AI phát hiện trượt ngã / vượt rào',
      desc: `Hiện tại: ${(s.thresholds.fallConfidence * 100).toFixed(0)}% (YOLOv8x-Pose)`,
      control: rangeControl(s.thresholds.fallConfidence, 0.5, 0.99, 0.01, v => {
        store.state.thresholds.fallConfidence = v;
        utils.storage.set(VC.STORAGE.settings, s.thresholds);
        notify.toast({ title: 'Đã cập nhật ngưỡng AI', message: `Độ tin cậy: ${(v * 100).toFixed(0)}%`, type: 'ok', duration: 1800 });
      })
    }));
    secAI.appendChild(settingRow({
      title: 'Thời gian đứng lâu sát vách đá / vùng cấm (giây)',
      desc: `Kích hoạt cảnh báo sau ${s.thresholds.inactivitySeconds}s đứng sát mép vực.`,
      control: rangeControl(s.thresholds.inactivitySeconds, 10, 120, 1, v => {
        store.state.thresholds.inactivitySeconds = v;
      })
    }));
    secAI.appendChild(settingRow({
      title: 'Thời gian chờ giữa 2 lần báo động (giây)',
      desc: `Chống lặp cảnh báo trong ${s.thresholds.alertCooldown}s.`,
      control: rangeControl(s.thresholds.alertCooldown, 5, 60, 1, v => {
        store.state.thresholds.alertCooldown = v;
      })
    }));
    cardAI.appendChild(secAI);

    // Email triggers inside cardAI
    const secEmail = el('div', { class: 'settings-section' });
    secEmail.appendChild(el('div', { class: 'settings-section__title', text: 'Tự động gửi Email tới Chốt Bảo vệ ĐHQG' }));
    fetch(api.url('/api/settings/email'))
      .then(r => r.json())
      .then(data => {
        const triggers = [
          { key: 'email_on_fall',          label: '🚨 Trượt ngã sát mép Hồ Đá',       desc: 'Ưu tiên ứng cứu khẩn cấp' },
          { key: 'email_on_stroke',        label: '⚕️ Bất tỉnh / Đuối sức ven hồ',    desc: 'Nguy cơ rơi xuống vùng nước sâu' },
          { key: 'email_on_zone_dwell',    label: '⚠️ Đứng lâu trong vùng cấm bờ hồ', desc: 'Nán lại sát vách đá 5–30 giây' },
          { key: 'email_on_zone_critical', label: '🚨 Khẩn cấp vùng cấm Hồ Đá',       desc: 'Xâm nhập sát vực nước sâu > 30 giây' },
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
                  title: 'Đã cập nhật thông báo Email',
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
      .catch(() => {});
    cardAI.appendChild(secEmail);
    leftCol.appendChild(cardAI);

    // LEFT CARD 2: 6 Lake Camera Stations
    const cardCam = el('div', { class: 'card' });
    cardCam.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('camera') }),
        'Quản lý 6 Trạm Camera Quanh Hồ Đá'
      ])
    ]));
    const secCam = el('div', { class: 'settings-section' });
    s.cameras.forEach(cam => {
      const locked = Boolean(cam.locked);
      secCam.appendChild(settingRow({
        title: `${cam.name} · ${cam.zone}` + (locked ? ' 🔒' : ''),
        desc: locked
          ? `${cam.id.toUpperCase()} — Mở khóa trong gói Pro (10.000đ) hoặc Business (599.000đ)`
          : `${cam.id.toUpperCase()} — ${cam.online ? `Đang hoạt động · ${cam.fps} FPS` : 'Ngoại tuyến'}`,
        control: locked
          ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => VC.app.go('upgrade') }, '👑 Mở khóa')
          : switchControl(cam.online, v => {
              cam.online = v;
              cam.fps = v ? 30 : 0;
              notify.toast({ title: 'Đã cập nhật trạm', message: `${cam.name} → ${v ? 'Trực tuyến' : 'Tạm ngắt'}`, type: 'ok', duration: 1800 });
              VC.app.rerender();
            })
      }));
    });
    cardCam.appendChild(secCam);
    leftCol.appendChild(cardCam);

    // RIGHT CARD 1: Emergency Contacts (Đội Bảo vệ ĐHQG & Cứu hộ)
    const cardCall = el('div', { class: 'card' });
    cardCall.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Danh bạ Đội Bảo vệ ĐHQG & Ứng cứu Khẩn cấp'
      ])
    ]));
    const secCall = el('div', { class: 'settings-section' });
    if (VC.auth && !VC.auth.can('emergencyCall')) {
      secCall.appendChild(el('div', { class: 'pro-banner' }, [
        el('span', { text: '🔒 Lưu danh bạ Chốt Bảo vệ ĐHQG / Đội cứu hộ (hoặc Phụ huynh trường mầm non) thuộc gói Pro (10.000đ) & Business.' }),
        el('button', { class: 'btn btn--primary btn--sm', onclick: () => VC.app.go('upgrade') }, '👑 Mở khóa Pro')
      ]));
    } else if (VC.auth) {
      const listWrap = el('div', { style: 'margin-bottom:10px' });
      const nameIn = el('input', { class: 'input', placeholder: 'Đơn vị / Cán bộ trực (vd: Chốt Bảo vệ Bờ Bắc)', style: 'flex:1;min-width:150px' });
      const phoneIn = el('input', { class: 'input', placeholder: 'Số hotline (09xx...)', style: 'width:150px' });
      const relIn = el('input', { class: 'input', placeholder: 'Vai trò (Đội tuần tra, Y tế…)', style: 'width:150px' });
      const addBtn = el('button', { class: 'btn btn--primary btn--sm' }, '+ Thêm số');
      const testBtn = el('button', { class: 'btn btn--ghost btn--sm' }, '📞 Gọi thử');

      const loadContacts = async () => {
        listWrap.innerHTML = '';
        try {
          const { items } = await VC.auth.request('/api/emergency/contacts');
          if (!items.length) {
            listWrap.appendChild(el('div', { class: 'billing-muted', text: 'Chưa có số điện thoại trực ban nào.' }));
          } else {
            items.forEach(c => {
              listWrap.appendChild(settingRow({
                title: `${c.name}${c.relation ? ' · ' + c.relation : ''}`,
                desc: c.phone,
                control: el('div', { style: 'display:flex;gap:6px' }, [
                  el('a', { class: 'btn btn--ghost btn--sm', href: `tel:${c.phone}` }, '📞 Gọi'),
                  el('button', {
                    class: 'btn btn--flat btn--sm',
                    onclick: async () => {
                      await VC.auth.request(`/api/emergency/contacts/${c.id}`, { method: 'DELETE' });
                      loadContacts();
                    }
                  }, 'Xóa')
                ])
              }));
            });
          }
        } catch (err) {
          listWrap.appendChild(el('div', { class: 'billing-muted', text: err.message }));
        }
      };

      addBtn.addEventListener('click', async () => {
        try {
          await VC.auth.request('/api/emergency/contacts', {
            method: 'POST',
            body: { name: nameIn.value, phone: phoneIn.value, relation: relIn.value }
          });
          nameIn.value = ''; phoneIn.value = ''; relIn.value = '';
          notify.toast({ title: 'Đã thêm số trực ban ứng cứu', type: 'ok' });
          loadContacts();
        } catch (err) {
          notify.toast({ title: 'Không thể thêm', message: err.message, type: 'danger' });
        }
      });

      testBtn.addEventListener('click', async () => {
        try {
          const res = await VC.auth.request('/api/emergency/test-call', { method: 'POST' });
          notify.toast({
            title: res.autoCall ? 'Đã kích hoạt cuộc gọi thử' : 'Chế độ gọi khẩn cấp 1 chạm',
            message: res.autoCall ? `Đã gọi ${res.called} số trực ban.` : 'Nhấn nút 📞 Gọi để kết nối trực tiếp qua điện thoại/trình duyệt.',
            type: 'info'
          });
        } catch (err) {
          notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
        }
      });

      secCall.appendChild(listWrap);
      secCall.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, [nameIn, phoneIn, relIn, addBtn, testBtn]));
      loadContacts();
    }
    cardCall.appendChild(secCall);
    rightCol.appendChild(cardCall);

    // RIGHT CARD 2: General, Guide & About Project
    const cardGen = el('div', { class: 'card' });
    cardGen.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('settings') }),
        'Hệ thống, Cẩm nang & Thông tin Dự án'
      ])
    ]));
    const secGen = el('div', { class: 'settings-section' });
    secGen.appendChild(settingRow({
      title: 'Chế độ ban đêm (Trực đêm Hồ Đá)',
      desc: 'Chuyển đổi giao diện Sáng / Tối.',
      control: switchControl(s.theme === 'dark', v => {
        store.set({ theme: v ? 'dark' : 'light' });
        document.documentElement.dataset.theme = v ? 'dark' : 'light';
        utils.storage.set(VC.STORAGE.theme, v ? 'dark' : 'light');
        VC.app.rerenderTopbar();
      })
    }));
    secGen.appendChild(settingRow({
      title: 'Còi báo động tại Trạm trực',
      desc: 'Phát âm thanh báo động khi phát hiện người vượt rào hoặc trượt ngã sát bờ hồ.',
      control: switchControl(s.sound, v => {
        store.set({ sound: v });
        utils.storage.set(VC.STORAGE.sound, v);
        VC.app.rerenderTopbar();
      })
    }));
    secGen.appendChild(settingRow({
      title: 'Cẩm nang Vận hành & Trợ giúp',
      desc: 'Xem hướng dẫn sử dụng hệ thống giám sát Hồ Đá ĐHQG-HCM.',
      control: el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: () => VC.guide && VC.guide.showHelpCenter('start')
      }, '📖 Mở Cẩm nang')
    }));
    secGen.appendChild(settingRow({
      title: 'Xuất nhật ký CSV / Xóa dữ liệu mẫu',
      desc: 'Tải báo cáo CSV hoặc làm sạch danh sách sự cố.',
      control: el('div', { style: 'display:flex;gap:6px' }, [
        el('button', { class: 'btn btn--ghost btn--sm', onclick: exportCSV }, 'Xuất CSV'),
        el('button', {
          class: 'btn btn--danger btn--sm',
          onclick: async () => {
            const ok = await notify.confirm('Xóa toàn bộ nhật ký cảnh báo hiện tại?', { danger: true, okLabel: 'Xóa' });
            if (!ok) return;
            store.set({ alerts: [] });
            notify.toast({ title: 'Đã làm sạch nhật ký', type: 'ok' });
            VC.app.rerender();
          }
        }, 'Xóa')
      ])
    }));
    cardGen.appendChild(secGen);

    const secAbout = el('div', { class: 'settings-section' });
    secAbout.appendChild(el('div', { class: 'settings-section__title', text: 'Về Dự án Hệ Thống Cảnh Báo An Toàn Hồ Đá — ĐHQG TP.HCM' }));
    secAbout.appendChild(el('p', {
      style: 'font-size:12.5px;color:var(--text-dim);line-height:1.7',
      html: `<b>SafeZone Hồ Đá</b> là dự án ứng dụng <b>Thị giác máy tính (Computer Vision)</b> và <b>Camera AI</b> nhằm giám sát an toàn, phòng chống đuối nước và tai nạn tại khu vực <b>Hồ Đá — Khu đô thị Đại học Quốc gia TP.HCM</b>. Bên cạnh nhiệm vụ cốt lõi tại Hồ Đá, kiến trúc phần mềm còn sẵn sàng thương mại hóa và triển khai cho <b>Trường mầm non tư thục</b>, <b>Viện dưỡng lão</b>, hồ bơi và khu du lịch sinh thái.`
    }));
    cardGen.appendChild(secAbout);
    rightCol.appendChild(cardGen);

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    root.appendChild(grid);
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
