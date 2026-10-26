(function (VC) {
  'use strict';

  /* ============================================================
     VigiCare — auth.js
     Quản lý tài khoản, tự động khởi tạo phiên dùng thử + Admin để
     demo mượt không chặn camera, đồng thời hỗ trợ Đăng ký / Đăng nhập
     đầy đủ và nút "Đặt lại về gói Miễn phí" để thuyết trình nhiều lần.
     ============================================================ */

  const { el, escape, storage } = VC.utils;
  const TOKEN_KEY = 'vigicare.token';
  const ADMIN_TOKEN_KEY = 'vigicare.admin_token';

  const FREE_LIMITS = {
    maxCameras: 1, historyDays: 7, exportCsv: false, emergencyCall: false, maxContacts: 0
  };

  let token = storage.get(TOKEN_KEY, '');
  let adminToken = storage.get(ADMIN_TOKEN_KEY, '');
  let user = null;
  const listeners = new Set();

  /* ---------- Gắn Authorization cho mọi request tới /api ---------- */
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    if (typeof input === 'string' && input.indexOf('/api/') !== -1) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        const isAdminApi = input.indexOf('/api/admin/') !== -1;
        const tk = (isAdminApi && adminToken) ? adminToken : token;
        if (tk) headers.set('Authorization', 'Bearer ' + tk);
      }
      init = Object.assign({}, init, { headers });
    }
    return nativeFetch(input, init);
  };

  async function request(path, { method = 'GET', body } = {}) {
    const r = await fetch(VC.api.url(path), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await r.json(); } catch (e) { /* không phải JSON */ }
    if (!r.ok) {
      let msg = data && data.detail;
      if (Array.isArray(msg)) msg = 'Dữ liệu nhập chưa hợp lệ';
      const err = new Error(msg || `Lỗi máy chủ (${r.status})`);
      err.status = r.status;
      throw err;
    }
    return data;
  }

  const vnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';

  /* ---------- Trạng thái user ---------- */
  function setSession(newToken, newUser) {
    token = newToken || '';
    if (token) storage.set(TOKEN_KEY, token); else storage.remove(TOKEN_KEY);
    if (newUser && newUser.isAdmin && newToken) {
      adminToken = newToken;
      storage.set(ADMIN_TOKEN_KEY, adminToken);
    }
    setUser(newUser);
  }

  function setUser(newUser) {
    const prevPlan = user && user.plan;
    user = newUser || null;
    if (user && user.plan === 'pro') user.planName = 'Pro · Trường mầm non';
    if (user && adminToken) user.hasAdminAccess = true;
    applyCameraLimits();
    listeners.forEach(fn => { try { fn(user, prevPlan); } catch (e) { console.error(e); } });
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  async function refresh() {
    const { user: u } = await request('/api/auth/me');
    setUser(u);
    return u;
  }

  async function ensureAdminSeeded() {
    try {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'admin@vigicare.vn', password: 'password123' }
      });
      if (res.user && res.user.isAdmin) {
        adminToken = res.token;
        storage.set(ADMIN_TOKEN_KEY, adminToken);
      }
      return res;
    } catch (e) {
      try {
        const res = await request('/api/auth/register', {
          method: 'POST',
          body: { email: 'admin@vigicare.vn', password: 'password123', name: 'Quản trị VigiCare', phone: '0912345678' }
        });
        if (res.user && res.user.isAdmin) {
          adminToken = res.token;
          storage.set(ADMIN_TOKEN_KEY, adminToken);
        }
        return res;
      } catch (e2) {
        return null;
      }
    }
  }

  /** Đặt lại về 1 tài khoản gói Miễn phí mới tinh để demo lại luồng mua Pro từ đầu */
  async function resetToFreeDemo() {
    await ensureAdminSeeded();
    const id = Math.floor(1000 + Math.random() * 9000);
    const email = `khachhang${id}@vigicare.vn`;
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'password123', name: `Khách hàng #${id}`, phone: '0987654321' }
    });
    setSession(res.token, res.user);
    VC.notify.toast({
      title: 'Đã chuyển về gói Miễn phí',
      message: `Đang dùng tài khoản ${email} (Gói Free) — sẵn sàng demo nâng cấp Pro!`,
      type: 'ok',
      duration: 4000
    });
    if (VC.app) VC.app.rerender();
    return res.user;
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    setSession('', null);
    await showAuthScreen();
    if (VC.app) VC.app.rerender();
  }

  /* ---------- Quyền lợi theo gói ---------- */
  function limits() { return (user && user.limits) || FREE_LIMITS; }
  function plan() { return (user && user.plan) || 'free'; }
  function isPaid() { return plan() !== 'free'; }
  function can(feature) { return Boolean(limits()[feature]); }
  function maxCameras() {
    const m = limits().maxCameras;
    return m == null ? Infinity : m;
  }
  function historyDays() { return limits().historyDays; }

  function applyCameraLimits() {
    if (!VC.store) return;
    const max = maxCameras();
    VC.store.state.cameras.forEach((cam, i) => { cam.locked = i >= max; });
    const active = VC.store.state.cameras.find(c => c.id === VC.store.state.activeCamera);
    if (active && active.locked) VC.store.state.activeCamera = VC.store.state.cameras[0].id;
  }

  /** Hộp thoại mời nâng cấp khi người dùng chạm vào tính năng trả phí. */
  function upsell(title, desc) {
    return VC.notify.modal({
      title: '👑 Tính năng VigiCare Pro',
      width: 460,
      body: el('div', { class: 'upsell' }, [
        el('div', { class: 'upsell__icon', text: '🔒' }),
        el('div', { class: 'upsell__title', text: title }),
        el('p', { class: 'upsell__desc', text: desc || 'Nâng cấp lên gói Pro để mở khóa tính năng này.' }),
        el('div', { class: 'upsell__price' }, [
          'Chỉ từ ', el('b', { text: '10.000đ' }), ' — mua 1 lần, dùng trọn đời'
        ])
      ]),
      actions: [
        { label: 'Để sau', value: false, class: 'btn--ghost' },
        { label: '👑 Xem bảng giá & Nâng cấp', value: true, class: 'btn--primary' }
      ]
    }).then(go => { if (go && VC.app) VC.app.go('upgrade'); return go; });
  }

  /* ---------- Màn hình đăng nhập / đăng ký ---------- */
  function showAuthScreen(canClose = true) {
    return new Promise((resolve) => {
      let mode = 'login';
      const screen = el('div', { class: 'auth-screen' });

      const pitch = el('div', { class: 'auth-pitch' }, [
        el('div', { class: 'auth-pitch__logo', text: '🛡️' }),
        el('h1', { text: VC.APP.name }),
        el('p', { class: 'auth-pitch__tag', text: 'AI giám sát an toàn người cao tuổi 24/7 — phát hiện té ngã, đột quỵ và báo ngay cho người thân.' }),
        el('ul', { class: 'auth-pitch__list' }, [
          el('li', { text: '🎯 Phát hiện té ngã theo thời gian thực bằng YOLOv8-Pose' }),
          el('li', { text: '📞 Tự động gọi điện cho người thân khi có sự cố (Pro)' }),
          el('li', { text: '📊 Lưu lịch sử & xuất báo cáo cho bác sĩ (Pro)' }),
          el('li', { text: '🏥 Gói Business cho viện dưỡng lão, không giới hạn camera' })
        ]),
        el('div', { class: 'auth-pitch__price', id: 'authPrice' }, 'Miễn phí 1 camera · Pro mua 1 lần dùng trọn đời')
      ]);

      const form = el('form', { class: 'auth-card', novalidate: true });
      screen.appendChild(el('div', { class: 'auth-wrap' }, [pitch, form]));
      document.body.appendChild(screen);

      const closeScreen = (u) => {
        screen.classList.add('is-leaving');
        setTimeout(() => screen.remove(), 220);
        resolve(u);
      };

      request('/api/billing/plans').then(({ plans }) => {
        const pro = plans.find(p => p.id === 'pro');
        const priceEl = document.getElementById('authPrice');
        if (pro && priceEl) priceEl.innerHTML = `Miễn phí 1 camera · Pro chỉ <b>${vnd(pro.price)}</b> — trả 1 lần, dùng trọn đời`;
      }).catch(() => {});

      function render() {
        form.innerHTML = '';
        if (canClose) {
          form.appendChild(el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:6px' }, [
            el('button', { type: 'button', class: 'btn btn--flat btn--sm', onclick: () => closeScreen(user) }, '✕ Đóng')
          ]));
        }
        form.appendChild(el('div', { class: 'auth-tabs' }, [
          el('button', { type: 'button', class: `auth-tab ${mode === 'login' ? 'is-active' : ''}`, onclick: () => { mode = 'login'; render(); } }, 'Đăng nhập'),
          el('button', { type: 'button', class: `auth-tab ${mode === 'register' ? 'is-active' : ''}`, onclick: () => { mode = 'register'; render(); } }, 'Đăng ký miễn phí')
        ]));
        const field = (label, attrs) => el('label', { class: 'field' }, [
          el('span', { class: 'field__label', text: label }),
          el('input', Object.assign({ class: 'input' }, attrs))
        ]);
        if (mode === 'register') {
          form.appendChild(field('Họ tên', { name: 'name', placeholder: 'Nguyễn Văn A', autocomplete: 'name' }));
          form.appendChild(field('Số điện thoại', { name: 'phone', placeholder: '09xx xxx xxx', autocomplete: 'tel' }));
        }
        form.appendChild(field('Email', { name: 'email', type: 'email', placeholder: 'ban@email.com', autocomplete: 'email', required: true }));
        form.appendChild(field('Mật khẩu', { name: 'password', type: 'password', placeholder: 'Ít nhất 6 ký tự', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true }));
        form.appendChild(el('div', { class: 'auth-error', id: 'authError' }));
        form.appendChild(el('button', { type: 'submit', class: 'btn btn--primary btn--block' },
          mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản & dùng thử'));

        form.appendChild(el('button', {
          type: 'button',
          class: 'btn btn--ghost btn--block',
          style: 'margin-top:8px',
          onclick: async () => {
            const u = await resetToFreeDemo();
            closeScreen(u);
          }
        }, '⚡ Tạo nhanh tài khoản Demo (Gói Miễn phí)'));

        const first = form.querySelector('input');
        if (first) setTimeout(() => first.focus(), 30);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const btn = form.querySelector('button[type=submit]');
        const errEl = document.getElementById('authError');
        btn.disabled = true;
        errEl.textContent = '';
        try {
          const res = await request(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
            method: 'POST', body: data
          });
          setSession(res.token, res.user);
          closeScreen(res.user);
        } catch (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
        }
      });

      render();
    });
  }

  async function ensureLoggedIn() {
    applyCameraLimits();
    const adminRes = await ensureAdminSeeded();
    if (token) {
      try { return await refresh(); }
      catch (e) { setSession('', null); }
    }
    if (adminRes && adminRes.token) {
      setSession(adminRes.token, adminRes.user);
      return adminRes.user;
    }
    return null;
  }

  /* ---------- Hộp thoại tài khoản ---------- */
  function showAccount() {
    if (!user) {
      showAuthScreen(true);
      return;
    }
    const body = el('div', { class: 'account-box' }, [
      el('div', { class: 'account-box__row' }, [el('span', { text: 'Email' }), el('b', { text: user.email })]),
      user.name ? el('div', { class: 'account-box__row' }, [el('span', { text: 'Họ tên' }), el('b', { text: user.name })]) : null,
      el('div', { class: 'account-box__row' }, [el('span', { text: 'Gói hiện tại' }), el('span', { class: `plan-badge plan-badge--${user.plan}`, text: user.planName })]),
      el('div', { class: 'account-box__row' }, [el('span', { text: 'License key' }), el('code', { text: user.licenseKey || '—' })]),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: async () => {
            const bd = document.querySelector('#modal-root .modal-backdrop');
            if (bd) bd.click();
            await resetToFreeDemo();
          }
        }, '🔄 Đặt lại về gói Miễn phí (để demo)'),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: () => {
            const bd = document.querySelector('#modal-root .modal-backdrop');
            if (bd) bd.click();
            showAuthScreen(true);
          }
        }, '🔑 Đổi tài khoản / Đăng ký mới')
      ])
    ]);
    VC.notify.modal({
      title: '👤 Tài khoản & Bản quyền',
      width: 480,
      body,
      actions: [
        { label: 'Đóng', value: 'close', class: 'btn--ghost' },
        { label: isPaid() ? 'Xem bảng giá' : '👑 Nâng cấp Pro', value: 'upgrade', class: 'btn--primary' }
      ]
    }).then(v => {
      if (v === 'upgrade') VC.app.go('upgrade');
    });
  }

  VC.auth = {
    request, vnd, ensureLoggedIn, refresh, logout, onChange, setUser, showAccount, showAuthScreen,
    resetToFreeDemo, upsell, can, plan, isPaid, limits, maxCameras, historyDays, applyCameraLimits,
    get user() { return user; },
    get token() { return token; },
    get isAdmin() { return Boolean((user && user.isAdmin) || adminToken); },
    escape
  };
})(window.VC);
