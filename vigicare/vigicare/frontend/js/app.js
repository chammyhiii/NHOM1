(function (VC) {
  'use strict';

  const { utils, store, api, notify } = VC;
  const { $, $$, el, icon, escape, fmtTime } = utils;

  const LEGACY_CAM_MAP = {
    'Phòng khách': 'Bờ Bắc · Vách đá dựng đứng',
    'Phòng ngủ': 'Bờ Đông · Đường Nguyễn Du',
    'Nhà bếp': 'Mỏm đá Tử thần · Bờ Tây',
    'Hành lang': 'Lối mòn Hàng rào Khu A',
    'Phòng tắm (ngoài)': 'Bờ Nam · Giáp Viện CNSH',
    'Sân vườn': 'Chốt Bảo vệ Ống Nước Thô'
  };
  const LEGACY_ZONE_MAP = {
    'Tầng 1': 'Cụm Hồ Chính ĐHQG',
    'Tầng 2': 'Tuyến Đường Ven Hồ',
    'Ngoại vi': 'Hành Lang Bảo Vệ',
    'TEST1': 'Mép vực đá Bờ Bắc Hồ Đá',
    'TEST4': 'Mép vực đá Bờ Bắc Hồ Đá'
  };

  function normalizeAlert(a) {
    if (!a) return a;
    if (a.cameraName && LEGACY_CAM_MAP[a.cameraName]) {
      a.cameraName = LEGACY_CAM_MAP[a.cameraName];
    }
    if (a.zone && LEGACY_ZONE_MAP[a.zone]) {
      a.zone = LEGACY_ZONE_MAP[a.zone];
    }
    const tMeta = VC.ALERT_TYPES && VC.ALERT_TYPES[a.type];
    if (tMeta) {
      a.typeLabel = tMeta.label;
    }
    if (a.zoneName && LEGACY_ZONE_MAP[a.zoneName]) {
      a.zoneName = LEGACY_ZONE_MAP[a.zoneName];
    }
    return a;
  }

  function normalizeAlerts(list) {
    return (list || []).map(normalizeAlert);
  }

  /* ---------- Render horizontal command nav (hover-to-reveal labels) ---------- */
  function renderSidebar() {
    const sidebar = $('#sidebar');
    sidebar.innerHTML = '';

    const nav = el('nav', { class: 'sidebar__nav' });
    const items = VC.NAV.slice();
    items.push({ id: 'admin', label: 'Quản trị doanh thu', icon: 'shield' });
    items.forEach(item => {
      const btn = el('button', {
        class: `nav-btn ${store.state.view === item.id ? 'is-active' : ''}`,
        'data-view': item.id,
        title: item.label,
        onclick: () => go(item.id)
      }, [
        el('div', { html: icon(item.icon) }),
        el('span', { class: 'nav-btn__tip', text: item.label })
      ]);
      nav.appendChild(btn);
    });
    sidebar.appendChild(nav);

    sidebar.appendChild(el('div', { class: 'sidebar__foot' }, [
      el('div', { class: 'status-pill', title: 'Trạm AI Hồ Đá hoạt động ổn định' }),
      el('span', { class: 'sidebar__foot-hint', text: '💡 Rà chuột để xem chi tiết ·' }),
      el('div', {}, `v${VC.APP.version}`)
    ]));
  }

  /* ---------- Render compact top command bar (hover-to-reveal details) ---------- */
  function renderTopbar() {
    const topbar = $('#topbar');
    topbar.innerHTML = '';
    const s = store.state;

    const brandRow = el('div', {
      class: 'topbar__brand-row',
      style: 'cursor:pointer',
      title: 'Rà chuột để xem mô tả dự án · Nhấn để về Trung tâm Điều hành',
      onclick: () => go('overview')
    }, [
      el('div', { class: 'topbar__logo' }, '🌊'),
      el('div', { class: 'topbar__title' }, [
        el('h1', { text: VC.APP.name }),
        el('p', { text: VC.APP.tagline })
      ])
    ]);
    topbar.appendChild(brandRow);

    const actions = el('div', { class: 'topbar__actions' });

    // Status + Clock chip (hover reveals full label)
    actions.appendChild(el('span', { class: 'chip', title: 'API & WebSocket đang kết nối trực tiếp tới Trạm AI Hồ Đá' }, [
      el('span', { class: 'dot' }),
      el('b', { id: 'clock' }, fmtTime()),
      el('span', { class: 'topbar-hover-text' }, '· AI Hồ Đá Online')
    ]));

    const curPlan = (VC.auth && VC.auth.plan()) || 'free';
    const curUser = VC.auth && VC.auth.user;
    if (curPlan === 'free') {
      actions.appendChild(el('button', {
        class: 'upgrade-chip',
        title: 'Nâng cấp gói Pro (10.000đ) — Mở khóa đa camera, lịch sử & gọi khẩn cấp',
        onclick: () => go('upgrade')
      }, [
        el('span', {}, '👑 Pro'),
        el('span', { class: 'topbar-hover-text' }, '· Nâng cấp 10.000đ')
      ]));
    } else {
      actions.appendChild(el('button', {
        class: `plan-badge plan-badge--${curPlan}`,
        title: 'Bản quyền đang hoạt động — nhấn để xem bảng giá',
        onclick: () => go('upgrade')
      }, [
        el('span', {}, curPlan === 'business' ? '🏥 Business' : '⭐ Pro'),
        el('span', { class: 'topbar-hover-text' }, '· ' + (curUser ? curUser.planName : 'Trường mầm non'))
      ]));
    }

    // Nút Doanh thu (compact, hover shows label)
    actions.appendChild(el('button', {
      class: 'btn btn--ghost btn--sm',
      style: 'height:30px;padding:0 9px;font-size:11.5px',
      title: 'Quản trị đơn hàng, doanh thu (609.000đ) & tạo License Key',
      onclick: () => go('admin')
    }, [
      el('span', {}, '💰'),
      el('span', { class: 'topbar-hover-text' }, 'Doanh thu (609k)')
    ]));

    // Tài khoản
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: curUser ? `Tài khoản: ${curUser.email}` : 'Đăng nhập / Tài khoản',
      html: icon('user'),
      onclick: () => VC.auth && VC.auth.showAccount()
    }));

    // Bật/Tắt Camera AI
    actions.appendChild(el('button', {
      class: `icon-btn ${s.cameraOn ? 'is-active' : ''}`,
      id: 'cameraToggleBtn',
      title: s.cameraOn ? 'Camera AI đang BẬT (nhấn để tắt)' : 'Camera AI đang TẮT (nhấn để bật)',
      html: icon('camera'),
      onclick: toggleCamera
    }));

    // Âm thanh (Phím S)
    actions.appendChild(el('button', {
      class: `icon-btn ${s.sound ? 'is-active' : ''}`,
      title: 'Bật/tắt âm thanh cảnh báo (Phím S)',
      html: icon(s.sound ? 'volume' : 'mute'),
      onclick: toggleSound
    }));

    // Đổi giao diện Sáng/Tối (Phím T)
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Đổi giao diện Sáng / Tối (Phím T)',
      html: icon(s.theme === 'dark' ? 'sun' : 'moon'),
      onclick: toggleTheme
    }));

    // Làm mới (Phím R)
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Làm mới dữ liệu (Phím R)',
      html: icon('refresh'),
      onclick: () => { VC.app.rerender(); notify.toast({ title: 'Đã làm mới', type: 'info', duration: 1400 }); }
    }));

    // Hướng dẫn sử dụng (Phím ?)
    actions.appendChild(el('button', {
      class: 'icon-btn',
      id: 'helpBtn',
      title: 'Hướng dẫn sử dụng website (Phím ?)',
      html: icon('help'),
      onclick: () => {
        if (VC.guide && VC.guide.showHelpCenter) VC.guide.showHelpCenter('start');
      }
    }));

    // Cài đặt
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Cài đặt hệ thống',
      html: icon('settings'),
      onclick: () => go('settings')
    }));

    topbar.appendChild(actions);
  }

  /* ---------- Router ---------- */
  function go(view) {
    if (!VC.views[view]) view = 'overview';
    store.set({ view }, 'route');
    render();
  }

  function render() {
    renderSidebar();
    renderTopbar();
    const main = $('#main');
    main.innerHTML = '';
    const fn = VC.views[store.state.view];
    try { fn(main); }
    catch (e) {
      console.error(e);
      main.innerHTML = '<div class="card"><div class="empty"><div class="empty__icon">😵</div><div class="empty__title">Có lỗi xảy ra</div><div class="empty__desc">' + escape(e.message) + '</div></div></div>';
    }
    $$('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === store.state.view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Camera toggle ---------- */
  async function toggleCamera() {
    const btn = document.getElementById('cameraToggleBtn');
    if (!btn) return;
    btn.disabled = true;

    try {
      const r = await fetch(api.url('/api/cameras/control/toggle'), { method: 'POST' });
      const data = await r.json();
      store.state.cameraOn = data.camera_on;

      notify.toast({
        title: data.camera_on ? 'Trạm Camera AI đã BẬT' : 'Trạm Camera AI đã TẮT',
        message: data.camera_on ? 'Đang giám sát an toàn bờ Hồ Đá.' : 'Đã tạm ngắt kết nối webcam.',
        type: data.camera_on ? 'ok' : 'warn',
        duration: 2500,
      });
      notify.alarm(data.camera_on ? 'ok' : 'beep');
    } catch (err) {
      notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
    } finally {
      btn.disabled = false;
      renderTopbar();
    }
  }

  async function initCameraState() {
    try {
      const r = await fetch(api.url('/api/cameras/control/status'));
      const data = await r.json();
      store.state.cameraOn = data.camera_on;
    } catch (e) {
      store.state.cameraOn = true;
    }
  }

  /* ---------- Theme / Sound ---------- */
  function toggleTheme() {
    const next = store.state.theme === 'dark' ? 'light' : 'dark';
    store.set({ theme: next });
    document.documentElement.dataset.theme = next;
    utils.storage.set(VC.STORAGE.theme, next);
    notify.toast({
      title: 'Đã đổi giao diện',
      message: next === 'dark' ? 'Chế độ tối (Trực đêm Hồ Đá)' : 'Chế độ sáng',
      type: 'info', duration: 1600
    });
    renderTopbar();
    render();
  }

  function toggleSound() {
    const next = !store.state.sound;
    store.set({ sound: next });
    utils.storage.set(VC.STORAGE.sound, next);
    notify.toast({
      title: next ? 'Đã bật âm thanh cảnh báo' : 'Đã tắt âm thanh cảnh báo',
      type: next ? 'ok' : 'warn', duration: 1600
    });
    if (next) notify.alarm('ok');
    renderTopbar();
  }

  /* ---------- Clock ---------- */
  let clockTimer = null;
  function startClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      const el = document.getElementById('clock');
      if (el) el.textContent = fmtTime();
    }, 1000);
  }

  /* ---------- Realtime alert ---------- */
  function handleIncomingAlert(alert) {
    normalizeAlert(alert);
    store.pushAlert(alert);

    const cooldown = store.state.thresholds.alertCooldown * 1000;
    const last = store.state.alerts[1];
    const withinCooldown = last && (Date.now() - last.ts) < cooldown;
    if (!withinCooldown) notify.alarm('alert');

    notify.toast({
      title: `⚠ ${alert.typeLabel} · ${alert.cameraName}`,
      message: `Độ tin cậy ${(alert.confidence * 100).toFixed(0)}% · ${fmtTime(new Date(alert.ts))}`,
      type: alert.severity === 'danger' ? 'danger' : 'warn',
      duration: 6500
    });

    refreshMetrics();
    if (store.state.view === 'overview' && VC.views.refreshOverviewRight && VC.views.refreshOverviewRight()) {
      // Giữ nguyên luồng video không bị nháy
    } else if (store.state.view === 'overview' || store.state.view === 'live') {
      render();
    }
  }

  function refreshMetrics() {
    store.state.metrics = api.computeMetrics(store.state.alerts, store.state.cameras);
  }

  /* ---------- Keyboard ---------- */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = VC.KEYBINDS[e.key];
      if (!action) return;

      if (action === 'toggle-sound') { e.preventDefault(); toggleSound(); }
      else if (action === 'toggle-theme') { e.preventDefault(); toggleTheme(); }
      else if (action === 'refresh') { e.preventDefault(); VC.app.rerender(); }
      else if (action === 'help') {
        e.preventDefault();
        if (VC.guide && VC.guide.showHelpCenter) VC.guide.showHelpCenter('start');
      }
      else if (VC.views[action]) { e.preventDefault(); go(action); }
    });
  }

  /* ---------- Init ---------- */
  async function init() {
    document.documentElement.dataset.theme = store.state.theme;
    store.state.cameraOn = true;

    if (VC.auth) {
      await VC.auth.ensureLoggedIn();
      VC.auth.onChange(async () => {
        try {
          const { items } = await api.fetchAlerts({ limit: 200 });
          store.state.alerts = normalizeAlerts(items || []);
          refreshMetrics();
        } catch (e) { /* ignore */ }
        render();
      });
    }
    try {
      await VC.camera.refreshDevices();
    } catch (e) {
      console.warn('[VC] Không thể liệt kê camera của thiết bị', e);
    }

    try {
      const { items } = await api.fetchAlerts({ limit: 200 });
      store.state.alerts = normalizeAlerts(items || []);
    } catch (e) {
      console.warn('[VC] Backend không phản hồi — dùng dữ liệu mẫu Hồ Đá', e);
      store.state.alerts = normalizeAlerts(api.seedAlerts(28));
    }
    refreshMetrics();

    await initCameraState();
    render();
    startClock();
    bindKeys();

    api.connectWS();
    api.onRealtimeAlert(handleIncomingAlert);

    setTimeout(() => {
      if (!api.BACKEND || !window.WebSocket) {
        api.startStream(handleIncomingAlert, { minDelay: 30000, maxDelay: 65000 });
      }
    }, 5000);

    setTimeout(() => {
      notify.toast({
        title: `${VC.APP.name} đã sẵn sàng`,
        message: `Đang giám sát ${store.activeCameras()} trạm camera quanh Hồ Đá · Nhấn ? để xem hướng dẫn`,
        type: 'info',
        duration: 5000
      });
    }, 600);

    if (VC.guide && VC.guide.checkFirstVisit) {
      VC.guide.checkFirstVisit();
    }

    window.addEventListener('resize', utils.debounce(() => {
      if (store.state.view === 'analytics') VC.views.drawAllCharts();
    }, 200));
    window.addEventListener('vigicare:cameras-changed', () => {
      if (store.state.view === 'overview' || store.state.view === 'live') render();
    });

    window.addEventListener('beforeunload', () => {
      api.stopStream();
      VC.camera.stop();
    });
  }

  VC.app = {
    go, render, init,
    rerender: render,
    rerenderTopbar: renderTopbar,
    toggleTheme, toggleSound, toggleCamera,
    normalizeAlert
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.VC);
