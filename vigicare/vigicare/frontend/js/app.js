(function (VC) {
  'use strict';

  const { utils, store, api, notify } = VC;
  const { $, $$, el, icon, escape, fmtTime } = utils;

  /* ---------- Render sidebar ---------- */
  function renderSidebar() {
    const sidebar = $('#sidebar');
    sidebar.innerHTML = '';

    const brand = el('div', { class: 'sidebar__brand', title: VC.APP.name, onclick: () => go('overview') }, '🛡️');
    sidebar.appendChild(brand);

    const nav = el('nav', { class: 'sidebar__nav' });
    VC.NAV.forEach(item => {
      const btn = el('button', {
        class: `nav-btn ${store.state.view === item.id ? 'is-active' : ''}`,
        'data-view': item.id,
        onclick: () => go(item.id)
      }, [
        el('div', { html: icon(item.icon) }),
        el('span', { class: 'nav-btn__tip', text: item.label })
      ]);
      nav.appendChild(btn);
    });
    sidebar.appendChild(nav);

    sidebar.appendChild(el('div', { class: 'sidebar__foot' }, [
      el('div', { class: 'status-pill', title: 'Hệ thống ổn định' }),
      el('div', {}, `v${VC.APP.version}`)
    ]));
  }

  /* ---------- Render topbar ---------- */
  function renderTopbar() {
    const topbar = $('#topbar');
    topbar.innerHTML = '';
    const s = store.state;

    topbar.appendChild(el('div', { class: 'topbar__title' }, [
      el('h1', { text: VC.APP.name }),
      el('p', { text: VC.APP.tagline })
    ]));

    const actions = el('div', { class: 'topbar__actions' });
    actions.appendChild(el('span', { class: 'chip' }, [
      el('span', { class: 'dot' }), el('span', {}, 'API: '), el('b', {}, 'Kết nối')
    ]));
    actions.appendChild(el('span', { class: 'chip' }, [
      el('span', { class: 'dot is-warn' }), el('span', {}, 'WS: '), el('b', {}, 'Kết nối')
    ]));

    const clock = el('span', { class: 'kbd', id: 'clock', style: 'padding:8px 14px;font-size:13px;color:var(--primary)' }, fmtTime());
    actions.appendChild(clock);

    // Nút toggle camera
    actions.appendChild(el('button', {
      class: `icon-btn ${s.cameraOn ? 'is-active' : ''}`,
      id: 'cameraToggleBtn',
      title: s.cameraOn ? 'Đang bật camera — nhấn để tắt' : 'Camera đang tắt — nhấn để bật',
      html: icon('camera'),
      onclick: toggleCamera
    }));

    actions.appendChild(el('button', {
      class: `icon-btn ${s.sound ? 'is-active' : ''}`,
      title: 'Bật/tắt âm thanh (S)',
      html: icon(s.sound ? 'volume' : 'mute'),
      onclick: toggleSound
    }));
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Đổi giao diện (T)',
      html: icon(s.theme === 'dark' ? 'sun' : 'moon'),
      onclick: toggleTheme
    }));
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Làm mới (R)',
      html: icon('refresh'),
      onclick: () => { VC.app.rerender(); notify.toast({ title: 'Đã làm mới', type: 'info', duration: 1400 }); }
    }));
    // Nút Hướng dẫn sử dụng
    actions.appendChild(el('button', {
      class: 'icon-btn',
      id: 'helpBtn',
      title: 'Hướng dẫn sử dụng (?)',
      html: icon('help'),
      onclick: () => {
        if (VC.guide && VC.guide.showHelpCenter) VC.guide.showHelpCenter('start');
      }
    }));
    actions.appendChild(el('button', {
      class: 'icon-btn',
      title: 'Cài đặt',
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
        title: data.camera_on ? 'Camera đã BẬT' : 'Camera đã TẮT',
        message: data.camera_on ? 'AI đang phân tích trở lại.' : 'Đã giải phóng webcam cho ứng dụng khác.',
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
      message: next === 'dark' ? 'Chế độ tối' : 'Chế độ sáng',
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
      title: next ? 'Đã bật âm thanh' : 'Đã tắt âm thanh',
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
      // Gi? nguy?n lu?ng video webcam kh?ng b? nh?y khi c? c?nh b?o m?i
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
    try {
      await VC.camera.refreshDevices();
    } catch (e) {
      console.warn('[VC] Không thể liệt kê camera của thiết bị', e);
    }

    // Load alerts từ backend
    try {
      const { items } = await api.fetchAlerts({ limit: 200 });
      store.state.alerts = items || [];
    } catch (e) {
      console.warn('[VC] Backend không phản hồi — dùng dữ liệu mẫu', e);
      store.state.alerts = api.seedAlerts(28);
    }
    refreshMetrics();

    await initCameraState();
    render();
    startClock();
    bindKeys();

    // WebSocket realtime
    api.connectWS();
    api.onRealtimeAlert(handleIncomingAlert);

    // Fallback mock nếu WS không kết nối
    setTimeout(() => {
      if (!api.BACKEND || !window.WebSocket) {
        api.startStream(handleIncomingAlert, { minDelay: 30000, maxDelay: 65000 });
      }
    }, 5000);

    setTimeout(() => {
      notify.toast({
        title: `${VC.APP.name} đã sẵn sàng`,
        message: `Đang giám sát ${store.activeCameras()} camera · Nhấn ? để xem hướng dẫn`,
        type: 'info',
        duration: 5000
      });
    }, 600);

    // Kiểm tra và hiển thị hướng dẫn cho người dùng lần đầu
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
    toggleTheme, toggleSound, toggleCamera
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.VC);
