(function (VC) {
  'use strict';

  /* ============================================================
     SafeZone Hồ Đá · ĐHQG-HCM — auth.js
     Luồng Bắt buộc Đăng nhập / Đăng ký trước → Phân tách 2 Miền:
     1. 🛡️ Miền Quản trị viên (Admin Portal)
     2. 👤 Miền Khách hàng (Customer Portal)
     ============================================================ */

  const { el, escape } = VC.utils;
  const SESSION_TOKEN_KEY = 'vigicare.session.token.v2';
  const SESSION_PORTAL_KEY = 'vigicare.session.portal.v2';

  // Xóa token tự động cũ trong localStorage để luôn bắt buộc qua bước Đăng nhập / Đăng ký trước
  try {
    localStorage.removeItem('vigicare.token');
    localStorage.removeItem('vigicare.admin_token');
  } catch (e) { /* ignore */ }

  const FREE_LIMITS = {
    maxCameras: 1, historyDays: 7, exportCsv: false, emergencyCall: false, maxContacts: 0
  };

  function readSession(key, fallback = '') {
    try { return sessionStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function writeSession(key, val) {
    try {
      if (val) sessionStorage.setItem(key, val);
      else sessionStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  let token = readSession(SESSION_TOKEN_KEY, '');
  let portalMode = readSession(SESSION_PORTAL_KEY, 'customer'); // 'admin' | 'customer'
  let user = null;
  const listeners = new Set();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    if (typeof input === 'string' && input.indexOf('/api/') !== -1) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization') && token) {
        headers.set('Authorization', 'Bearer ' + token);
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
    try { data = await r.json(); } catch (e) { /* non-JSON */ }
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

  function setSession(newToken, newUser, chosenPortal) {
    token = newToken || '';
    writeSession(SESSION_TOKEN_KEY, token);
    if (chosenPortal) {
      portalMode = chosenPortal;
    } else if (newUser) {
      portalMode = newUser.isAdmin ? 'admin' : 'customer';
    }
    writeSession(SESSION_PORTAL_KEY, portalMode);
    setUser(newUser);
  }

  function setUser(newUser) {
    const prevPlan = user && user.plan;
    user = newUser || null;
    if (user) {
      if (user.plan === 'pro') user.planName = 'Pro · Trường mầm non';
      else if (user.plan === 'business') user.planName = 'Business · Viện dưỡng lão';
      else user.planName = 'Miễn phí · 1 Trạm Hồ Đá';
    }
    applyCameraLimits();
    listeners.forEach(fn => { try { fn(user, prevPlan); } catch (e) { console.error(e); } });
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  async function refresh() {
    const { user: u } = await request('/api/auth/me');
    setUser(u);
    return u;
  }

  async function ensureAdminAccountExists() {
    try {
      await request('/api/auth/register', {
        method: 'POST',
        body: { email: 'admin@vigicare.vn', password: 'password123', name: 'Quản trị SafeZone Hồ Đá', phone: '0912345678' }
      });
    } catch (e) { /* already exists */ }
  }

  async function resetToFreeDemo() {
    const id = Math.floor(1000 + Math.random() * 9000);
    const email = `khachhang${id}@safezone-hoda.vn`;
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'password123', name: `Khách hàng Đơn vị #${id}`, phone: '0987654321' }
    });
    setSession(res.token, res.user, 'customer');
    VC.notify.toast({
      title: '👤 Đã vào Miền Khách hàng (Gói Miễn phí)',
      message: `Tài khoản ${email} (1 Trạm Camera) — Sẵn sàng trải nghiệm & nâng cấp Pro 10.000đ!`,
      type: 'ok',
      duration: 4000
    });
    if (VC.app) VC.app.go('overview');
    return res.user;
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    setSession('', null, 'customer');
    const u = await showAuthScreen(false);
    if (VC.app) {
      VC.app.go(isAdminMode() ? 'admin' : 'overview');
    }
    return u;
  }

  function isAdminMode() {
    return Boolean(user && user.isAdmin && portalMode === 'admin');
  }

  function limits() {
    if (isAdminMode()) {
      return { maxCameras: null, historyDays: null, exportCsv: true, emergencyCall: true, maxContacts: null };
    }
    return (user && user.limits) || FREE_LIMITS;
  }
  function plan() { return isAdminMode() ? 'business' : ((user && user.plan) || 'free'); }
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
    if (active && active.locked) VC.store.state.cameras[0] && (VC.store.state.activeCamera = VC.store.state.cameras[0].id);
  }

  function upsell(title, desc) {
    return VC.notify.modal({
      title: '👑 Bản quyền Thương mại SafeZone Pro',
      width: 460,
      body: el('div', { class: 'upsell' }, [
        el('div', { class: 'upsell__icon', text: '🔒' }),
        el('div', { class: 'upsell__title', text: title }),
        el('p', { class: 'upsell__desc', text: desc || 'Nâng cấp gói Pro để mở khóa đa trạm camera, xuất báo cáo CSV và gọi điều phối khẩn cấp.' }),
        el('div', { class: 'upsell__price' }, [
          'Chỉ từ ', el('b', { text: '10.000đ' }), ' — bản quyền trọn đời (Hồ Đá / Trường mầm non / Viện dưỡng lão)'
        ])
      ]),
      actions: [
        { label: 'Để sau', value: false, class: 'btn--ghost' },
        { label: '👑 Xem bảng giá & Nâng cấp', value: true, class: 'btn--primary' }
      ]
    }).then(go => { if (go && VC.app) VC.app.go('upgrade'); return go; });
  }

  /* ============================================================
     MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ & CHỌN MIỀN (ADMIN / KHÁCH HÀNG)
     ============================================================ */
  function showAuthScreen(canClose = false, initialPortal = '') {
    return new Promise((resolve) => {
      // Xóa màn hình auth cũ nếu đang mở
      document.querySelectorAll('.auth-screen').forEach(el => el.remove());

      let selectedPortal = initialPortal || (portalMode === 'admin' ? 'admin' : 'customer'); // 'customer' | 'admin'
      let mode = 'login'; // 'login' | 'register'
      const screen = el('div', { class: 'auth-screen' });

      const pitch = el('div', { class: 'auth-pitch' }, [
        el('div', { class: 'auth-pitch__logo', text: '🌊' }),
        el('h1', { text: VC.APP.name }),
        el('p', { class: 'auth-pitch__tag', text: 'Dự án Hệ Thống Cảnh Báo An Toàn Hồ Đá — Ứng dụng Thị giác máy tính & Camera AI tại Khu đô thị ĐHQG TP.HCM.' }),
        el('div', { class: 'auth-domain-summary' }, [
          el('div', { class: 'auth-domain-box' }, [
            el('b', { text: '👤 Miền Khách hàng (Đơn vị sử dụng)' }),
            el('p', { text: 'Giám sát Camera AI riêng tư (Private), khoanh vùng cấm bờ hồ, nhận cảnh báo trượt ngã, mua gói Pro (10.000đ) / Business (599.000đ) qua VietQR.' })
          ]),
          el('div', { class: 'auth-domain-box' }, [
            el('b', { text: '🛡️ Miền Quản trị viên (Admin)' }),
            el('p', { text: 'Quản lý doanh thu thương mại (609.000đ), duyệt đơn hàng VietQR MB Bank, cấp mã License Key và quản trị danh sách đơn vị.' })
          ])
        ]),
        el('div', { class: 'auth-pitch__price', id: 'authPrice' }, 'Vui lòng Đăng nhập hoặc Đăng ký để chọn miền truy cập')
      ]);

      const form = el('form', { class: 'auth-card', novalidate: true });
      screen.appendChild(el('div', { class: 'auth-wrap' }, [pitch, form]));
      document.body.appendChild(screen);

      const closeScreen = (u) => {
        screen.classList.add('is-leaving');
        setTimeout(() => screen.remove(), 220);
        resolve(u);
      };

      async function quickLogin(email, password, targetPortal, label) {
        const errEl = document.getElementById('authError');
        if (errEl) errEl.textContent = '';
        try {
          await ensureAdminAccountExists();
          const res = await request('/api/auth/login', {
            method: 'POST',
            body: { email, password }
          });
          setSession(res.token, res.user, targetPortal);
          VC.notify.toast({
            title: targetPortal === 'admin' ? '🛡️ Đã vào Miền Quản trị (Admin)' : '👤 Đã vào Miền Khách hàng',
            message: `${label} (${res.user.email})`,
            type: 'ok',
            duration: 3000
          });
          closeScreen(res.user);
        } catch (err) {
          if (errEl) errEl.textContent = err.message;
        }
      }

      function render() {
        form.innerHTML = '';
        if (canClose && user) {
          form.appendChild(el('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:4px' }, [
            el('button', { type: 'button', class: 'btn btn--flat btn--sm', onclick: () => closeScreen(user) }, '✕ Đóng')
          ]));
        }

        // Bước 1: Chọn Miền (Khách hàng vs Admin)
        form.appendChild(el('div', { class: 'auth-step-label', text: '1. CHỌN MIỀN TRUY CẬP HỆ THỐNG' }));
        form.appendChild(el('div', { class: 'auth-portal-switch' }, [
          el('button', {
            type: 'button',
            class: `auth-portal-btn ${selectedPortal === 'customer' ? 'is-active' : ''}`,
            onclick: () => { selectedPortal = 'customer'; render(); }
          }, [
            el('span', { class: 'auth-portal-btn__ico', text: '👤' }),
            el('div', {}, [
              el('b', { text: 'Miền Khách hàng' }),
              el('small', { text: 'Giám sát Camera & Mua gói Pro' })
            ])
          ]),
          el('button', {
            type: 'button',
            class: `auth-portal-btn is-admin-btn ${selectedPortal === 'admin' ? 'is-active' : ''}`,
            onclick: () => { selectedPortal = 'admin'; mode = 'login'; render(); }
          }, [
            el('span', { class: 'auth-portal-btn__ico', text: '🛡️' }),
            el('div', {}, [
              el('b', { text: 'Miền Quản trị (Admin)' }),
              el('small', { text: 'Doanh thu · Duyệt đơn · Cấp Key' })
            ])
          ])
        ]));

        // Bước 2: Đăng nhập / Đăng ký
        form.appendChild(el('div', {
          class: 'auth-step-label',
          style: 'margin-top:10px',
          text: selectedPortal === 'admin'
            ? '2. ĐĂNG NHẬP TÀI KHOẢN QUẢN TRỊ VIÊN (ADMIN)'
            : '2. ĐĂNG NHẬP HOẶC ĐĂNG KÝ TÀI KHOẢN KHÁCH HÀNG'
        }));

        if (selectedPortal === 'customer') {
          form.appendChild(el('div', { class: 'auth-tabs' }, [
            el('button', { type: 'button', class: `auth-tab ${mode === 'login' ? 'is-active' : ''}`, onclick: () => { mode = 'login'; render(); } }, '🔑 Đăng nhập Khách hàng'),
            el('button', { type: 'button', class: `auth-tab ${mode === 'register' ? 'is-active' : ''}`, onclick: () => { mode = 'register'; render(); } }, '📝 Đăng ký Khách hàng mới')
          ]));
        }

        const field = (label, attrs) => el('label', { class: 'field', style: 'margin-bottom:10px' }, [
          el('span', { class: 'field__label', text: label }),
          el('input', Object.assign({ class: 'input' }, attrs))
        ]);

        if (selectedPortal === 'customer' && mode === 'register') {
          form.appendChild(field('Tên Khách hàng / Đơn vị triển khai', {
            name: 'name',
            placeholder: 'VD: Trường Mầm non Sao Mai / Đội Bảo vệ ĐHQG...',
            autocomplete: 'name',
            required: true
          }));
          form.appendChild(field('Số điện thoại liên hệ', {
            name: 'phone',
            placeholder: '09xx xxx xxx',
            autocomplete: 'tel'
          }));
        }

        form.appendChild(field(selectedPortal === 'admin' ? 'Email Quản trị viên (Admin)' : 'Email tài khoản', {
          name: 'email',
          type: 'email',
          value: selectedPortal === 'admin' ? 'admin@vigicare.vn' : '',
          placeholder: selectedPortal === 'admin' ? 'admin@vigicare.vn' : 'khachhang@email.com',
          autocomplete: 'email',
          required: true
        }));

        form.appendChild(field('Mật khẩu', {
          name: 'password',
          type: 'password',
          value: selectedPortal === 'admin' ? 'password123' : '',
          placeholder: 'Ít nhất 6 ký tự',
          autocomplete: mode === 'login' ? 'current-password' : 'new-password',
          required: true
        }));

        form.appendChild(el('div', { class: 'auth-error', id: 'authError' }));

        form.appendChild(el('button', {
          type: 'submit',
          class: 'btn btn--primary btn--block'
        }, selectedPortal === 'admin'
          ? '🛡️ Đăng nhập vào Miền Quản trị (Admin)'
          : (mode === 'login' ? '👤 Đăng nhập vào Miền Khách hàng' : '📝 Đăng ký & Vào Miền Khách hàng')
        ));

        // Hộp chọn nhanh tài khoản mẫu để thuyết trình / kiểm thử nhanh 2 miền
        if (selectedPortal === 'customer') {
          form.appendChild(el('div', { class: 'auth-quick-box' }, [
            el('div', { class: 'auth-quick-box__title', text: '⚡ Chọn nhanh Tài khoản Khách hàng (Demo thuyết trình):' }),
            el('div', { class: 'auth-quick-box__btns' }, [
              el('button', {
                type: 'button',
                class: 'btn btn--ghost btn--sm',
                onclick: async () => {
                  const u = await resetToFreeDemo();
                  closeScreen(u);
                }
              }, '🌊 Khách hàng Mới (Gói Free)'),
              el('button', {
                type: 'button',
                class: 'btn btn--ghost btn--sm',
                onclick: () => quickLogin('vothingoctram683@gmail.com', 'password123', 'customer', 'Khách hàng Gói Pro · Trường mầm non')
              }, '⭐ Khách hàng Pro (Ngọc Trâm)'),
              el('button', {
                type: 'button',
                class: 'btn btn--ghost btn--sm',
                onclick: () => quickLogin('vonguyenhoaian8@gmail.com', 'password123', 'customer', 'Khách hàng Gói Business · Viện dưỡng lão')
              }, '🏥 Khách hàng Business (Hoài An)')
            ])
          ]));
        } else {
          form.appendChild(el('div', { class: 'auth-quick-box' }, [
            el('div', { class: 'auth-quick-box__title', text: '🔑 Tài khoản Admin mặc định đã được điền sẵn:' }),
            el('div', { style: 'font-size:12px;color:var(--text-dim)' }, 'Email: admin@vigicare.vn · Mật khẩu: password123 — Nhấn nút Đăng nhập phía trên để vào trang Quản trị & Doanh thu.')
          ]));
        }

        const first = form.querySelector('input');
        if (first && selectedPortal !== 'admin') setTimeout(() => first.focus(), 30);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const btn = form.querySelector('button[type=submit]');
        const errEl = document.getElementById('authError');
        btn.disabled = true;
        errEl.textContent = '';

        try {
          if (selectedPortal === 'admin') {
            await ensureAdminAccountExists();
          }
          const endpoint = (selectedPortal === 'customer' && mode === 'register')
            ? '/api/auth/register'
            : '/api/auth/login';
          const res = await request(endpoint, { method: 'POST', body: data });

          if (selectedPortal === 'admin' && !res.user.isAdmin) {
            throw new Error('Tài khoản này là Khách hàng, không có quyền Admin. Vui lòng chọn "Miền Khách hàng" hoặc đăng nhập bằng admin@vigicare.vn.');
          }

          setSession(res.token, res.user, selectedPortal);
          VC.notify.toast({
            title: selectedPortal === 'admin' ? '🛡️ Chào mừng Quản trị viên (Admin)' : '👤 Chào mừng Quý Khách hàng',
            message: `Đã đăng nhập: ${res.user.email}`,
            type: 'ok',
            duration: 2800
          });
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
    await ensureAdminAccountExists();
    if (token) {
      try {
        return await refresh();
      } catch (e) {
        setSession('', null, 'customer');
      }
    }
    // Bắt buộc hiển thị màn hình Đăng nhập / Đăng ký trước khi vào website
    return await showAuthScreen(false);
  }

  function showAccount() {
    if (!user) {
      showAuthScreen(false);
      return;
    }
    const curIsAdmin = isAdminMode();
    const body = el('div', { class: 'account-box' }, [
      el('div', { class: 'account-box__row' }, [
        el('span', { text: 'Miền đang hoạt động' }),
        el('span', {
          class: `pill pill--${curIsAdmin ? 'danger' : 'primary'}`,
          text: curIsAdmin ? '🛡️ MIỀN QUẢN TRỊ VIÊN (ADMIN)' : '👤 MIỀN KHÁCH HÀNG'
        })
      ]),
      el('div', { class: 'account-box__row' }, [el('span', { text: 'Email tài khoản' }), el('b', { text: user.email })]),
      user.name ? el('div', { class: 'account-box__row' }, [el('span', { text: 'Đơn vị / Họ tên' }), el('b', { text: user.name })]) : null,
      !curIsAdmin ? el('div', { class: 'account-box__row' }, [el('span', { text: 'Gói bản quyền' }), el('span', { class: `plan-badge plan-badge--${user.plan}`, text: user.planName })]) : null,
      !curIsAdmin ? el('div', { class: 'account-box__row' }, [el('span', { text: 'License key' }), el('code', { text: user.licenseKey || '—' })]) : null,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' }, [
        el('button', {
          class: 'btn btn--primary btn--sm',
          onclick: () => {
            const bd = document.querySelector('#modal-root .modal-backdrop');
            if (bd) bd.click();
            const targetPortal = curIsAdmin ? 'customer' : 'admin';
            showAuthScreen(true, targetPortal).then(() => {
              if (VC.app) VC.app.go(isAdminMode() ? 'admin' : 'overview');
            });
          }
        }, curIsAdmin ? '👤 Chuyển sang Miền Khách hàng' : '🛡️ Chuyển sang Miền Admin'),
        el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: async () => {
            const bd = document.querySelector('#modal-root .modal-backdrop');
            if (bd) bd.click();
            await logout();
          }
        }, '🚪 Đăng xuất / Đổi tài khoản')
      ])
    ]);
    VC.notify.modal({
      title: curIsAdmin ? '🛡️ Thông tin Phiên Quản trị viên (Admin)' : '👤 Hồ sơ Khách hàng & Bản quyền',
      width: 480,
      body,
      actions: [
        { label: 'Đóng', value: 'close', class: 'btn--ghost' },
        curIsAdmin
          ? { label: '💰 Mở Bảng Quản trị Doanh thu', value: 'admin', class: 'btn--primary' }
          : { label: isPaid() ? 'Xem bảng giá' : '👑 Nâng cấp Pro (10.000đ)', value: 'upgrade', class: 'btn--primary' }
      ]
    }).then(v => {
      if (v === 'upgrade') VC.app.go('upgrade');
      if (v === 'admin') VC.app.go('admin');
    });
  }

  VC.auth = {
    request, vnd, ensureLoggedIn, refresh, logout, onChange, setUser, showAccount, showAuthScreen,
    resetToFreeDemo, upsell, can, plan, isPaid, limits, maxCameras, historyDays, applyCameraLimits,
    get user() { return user; },
    get token() { return token; },
    get isAdmin() { return isAdminMode(); },
    get portal() { return isAdminMode() ? 'admin' : 'customer'; },
    escape
  };
})(window.VC);
