(function (VC) {
  'use strict';

  /* ============================================================
     VigiCare — billing.js
     Trang "Nâng cấp" (bảng giá, mua license trọn đời, thanh toán VietQR,
     nhập license key) và trang "Quản trị doanh thu" cho admin.
     ============================================================ */

  const { el, escape, icon, fmtDateTime } = VC.utils;
  const { notify } = VC;
  const auth = VC.auth;
  const vnd = auth.vnd;

  const BANKS = [
    { bin: '970422', name: 'MB Bank' },
    { bin: '970436', name: 'Vietcombank' },
    { bin: '970407', name: 'Techcombank' },
    { bin: '970418', name: 'BIDV' },
    { bin: '970415', name: 'VietinBank' },
    { bin: '970405', name: 'Agribank' },
    { bin: '970416', name: 'ACB' },
    { bin: '970432', name: 'VPBank' },
    { bin: '970423', name: 'TPBank' },
    { bin: '970403', name: 'Sacombank' }
  ];
  const bankName = (bin) => (BANKS.find(b => b.bin === bin) || {}).name || bin || '—';

  const ORDER_STATUS = {
    pending:   { label: 'Chờ chuyển khoản', color: 'warn' },
    claimed:   { label: 'Đã báo chuyển',    color: 'primary' },
    paid:      { label: 'Đã thanh toán',    color: 'ok' },
    rejected:  { label: 'Từ chối',          color: 'danger' },
    cancelled: { label: 'Đã hủy',           color: 'muted' }
  };
  const statusPill = (s) => {
    const st = ORDER_STATUS[s] || { label: s, color: 'muted' };
    return `<span class="pill pill--${st.color}">${escape(st.label)}</span>`;
  };

  const PLAN_ICON = { free: '🌱', pro: '⭐', business: '🏥' };

  function copy(text, label = 'Đã sao chép') {
    const done = () => notify.toast({ title: label, message: text, type: 'ok', duration: 1800 });
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function closeModal() {
    const bd = document.querySelector('#modal-root .modal-backdrop');
    if (bd) bd.click();
  }

  function cardHead(title, iconName, extra) {
    return el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [el('div', { class: 'ico', html: icon(iconName) }), title]),
      extra || null
    ]);
  }

  function loading() {
    return el('div', { class: 'empty' }, [el('div', { class: 'empty__icon', text: '⏳' }), el('div', { class: 'empty__desc', text: 'Đang tải…' })]);
  }

  function errorBox(err) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '⚠️' }),
      el('div', { class: 'empty__title', text: 'Không tải được dữ liệu' }),
      el('div', { class: 'empty__desc', text: err.message })
    ]);
  }

  /* ============================================================
     TRANG NÂNG CẤP
     ============================================================ */
  async function renderUpgrade(root) {
    root.innerHTML = '';
    const user = auth.user;
    const cur = auth.plan();

    // ---- Hero ----
    root.appendChild(el('div', { class: 'card billing-hero' }, [
      el('div', {}, [
        el('div', { class: 'billing-hero__eyebrow', text: 'Bản quyền trọn đời · Thanh toán 1 lần' }),
        el('h2', { class: 'billing-hero__title', text: 'Bảo vệ người thân với VigiCare Pro' }),
        el('p', { class: 'billing-hero__desc', text: 'Không phí hàng tháng. Mua 1 lần, dùng mãi mãi. Thêm dịch vụ lắp đặt tận nhà nếu bạn cần kỹ thuật viên hỗ trợ.' })
      ]),
      el('div', { class: 'billing-hero__current' }, [
        el('span', { class: 'billing-hero__label', text: 'Gói hiện tại' }),
        el('span', { class: `plan-badge plan-badge--${cur}`, text: `${PLAN_ICON[cur] || ''} ${user ? user.planName : 'Miễn phí'}` }),
        user && user.licenseKey ? el('code', { class: 'billing-hero__key', text: user.licenseKey, title: 'Bấm để sao chép', onclick: () => copy(user.licenseKey) }) : null,
        cur !== 'free' ? el('button', {
          class: 'btn btn--ghost btn--sm',
          style: 'margin-top:4px',
          onclick: () => auth.resetToFreeDemo()
        }, '🔄 Đặt lại gói Free (để demo lại)') : null
      ])
    ]));

    const plansWrap = el('div', { class: 'pricing-grid' }, [loading()]);
    root.appendChild(plansWrap);

    const lower = el('div', { class: 'grid-2' });
    const leftCol = el('div');
    const rightCol = el('div');
    lower.appendChild(leftCol);
    lower.appendChild(rightCol);
    root.appendChild(lower);

    leftCol.appendChild(activationCard());
    const ordersCard = el('div', { class: 'card' }, [cardHead('Đơn hàng của tôi', 'clock'), loading()]);
    leftCol.appendChild(ordersCard);
    const compareCard = el('div', { class: 'card' });
    rightCol.appendChild(compareCard);
    rightCol.appendChild(faqCard());

    try {
      const [{ plans, paymentReady }, { items: orders }] = await Promise.all([
        auth.request('/api/billing/plans'),
        auth.request('/api/billing/orders')
      ]);
      plans.forEach(p => {
        if (p.id === 'pro') {
          p.name = 'Pro · Trường mầm non';
          p.tagline = 'Mua 1 lần — dùng trọn đời cho lớp học & nhóm trẻ';
          p.price = 10000;
          p.install_fee = 150000;
          p.highlights = [
            'Tối đa 4 camera (lớp học, sân chơi, hành lang…)',
            'Lưu lịch sử không giới hạn',
            'Xuất báo cáo CSV cho nhà trường & phụ huynh',
            'Gọi điện khẩn cấp tới giáo viên / phụ huynh',
            'Tự động báo động khi phát hiện té ngã / vào vùng nguy hiểm'
          ];
        } else if (p.id === 'business') {
          p.price = 599000;
          p.install_fee = 300000;
        }
      });
      orders.forEach(normalizeOrder);
      plansWrap.innerHTML = '';
      plans.forEach(p => plansWrap.appendChild(pricingCard(p, plans, paymentReady)));
      compareCard.innerHTML = '';
      compareCard.appendChild(cardHead('So sánh các gói', 'chart'));
      compareCard.appendChild(compareTable(plans));
      fillOrders(ordersCard, orders, plans);
    } catch (err) {
      plansWrap.innerHTML = '';
      plansWrap.appendChild(el('div', { class: 'card' }, [errorBox(err)]));
    }
  }

  function pricingCard(p, plans, paymentReady) {
    const cur = auth.plan();
    const curPlan = plans.find(x => x.id === cur) || plans[0];
    const isCurrent = p.id === cur;
    const isLower = p.rank < curPlan.rank;
    const diff = Math.max(0, p.price - curPlan.price);

    let btn;
    if (isCurrent) btn = el('button', { class: 'btn btn--ghost btn--block', disabled: true }, '✓ Đang sử dụng');
    else if (isLower || p.price === 0) btn = el('button', { class: 'btn btn--ghost btn--block', disabled: true }, 'Đã bao gồm');
    else btn = el('button', {
      class: `btn ${p.id === 'pro' ? 'btn--primary' : 'btn--ghost'} btn--block`,
      onclick: () => openCheckout(p, curPlan, paymentReady)
    }, curPlan.rank > 0 ? `Nâng cấp · ${vnd(diff)}` : 'Mua ngay');

    return el('div', { class: `price-card ${p.id === 'pro' ? 'is-featured' : ''} ${isCurrent ? 'is-current' : ''}` }, [
      p.id === 'pro' ? el('div', { class: 'price-card__ribbon', text: 'Phổ biến nhất' }) : null,
      el('div', { class: 'price-card__icon', text: PLAN_ICON[p.id] || '•' }),
      el('div', { class: 'price-card__name', text: p.name }),
      el('div', { class: 'price-card__tag', text: p.tagline }),
      el('div', { class: 'price-card__price' }, [
        el('b', { text: p.price ? vnd(p.price) : '0đ' }),
        el('span', { text: p.price ? ' / trọn đời' : ' / mãi mãi' })
      ]),
      el('div', { class: 'price-card__install', text: p.install_fee ? `+ Lắp đặt tận nơi (tùy chọn): ${vnd(p.install_fee)}` : 'Tự cài đặt' }),
      el('ul', { class: 'price-card__list' }, p.highlights.map(h => el('li', { text: h }))),
      btn
    ]);
  }

  function compareTable(plans) {
    const fmt = (v, unit) => v == null ? '∞ Không giới hạn' : (v === true ? '✅' : v === false || v === 0 ? '—' : `${v}${unit || ''}`);
    const rows = [
      ['Số camera', p => fmt(p.max_cameras)],
      ['Lưu lịch sử', p => fmt(p.history_days, ' ngày')],
      ['Phát hiện té ngã / đột quỵ', () => '✅'],
      ['Email cảnh báo kèm ảnh', () => '✅'],
      ['Xuất báo cáo CSV', p => fmt(p.export_csv)],
      ['Gọi điện khẩn cấp', p => fmt(p.emergency_call)],
      ['Số liên hệ khẩn cấp', p => fmt(p.max_contacts)],
      ['Giá bản quyền', p => p.price ? vnd(p.price) : 'Miễn phí'],
      ['Phí lắp đặt (tùy chọn)', p => p.install_fee ? vnd(p.install_fee) : '—']
    ];
    const table = el('table', { class: 'table compare-table' });
    table.innerHTML = `
      <thead><tr><th>Tính năng</th>${plans.map(p => `<th class="${p.id === auth.plan() ? 'is-current' : ''}">${escape(PLAN_ICON[p.id] + ' ' + p.name.split(' · ')[0])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><td>${escape(label)}</td>${plans.map(p => `<td class="${p.id === auth.plan() ? 'is-current' : ''}">${escape(fn(p))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return el('div', { class: 'table-wrap' }, [table]);
  }

  function faqCard() {
    const faqs = [
      ['“Trọn đời” nghĩa là gì?', 'Bạn trả tiền một lần duy nhất, không có phí hàng tháng. License gắn với tài khoản và dùng được mãi mãi.'],
      ['Thanh toán thế nào?', 'Quét mã VietQR bằng app ngân hàng bất kỳ. Nội dung chuyển khoản là mã đơn hàng để hệ thống đối soát.'],
      ['Bao lâu thì được kích hoạt?', 'Sau khi bạn bấm “Tôi đã chuyển khoản”, quản trị viên xác nhận và gói được kích hoạt tự động, license key gửi qua email.'],
      ['Đã có gói Pro, muốn lên Business?', 'Chỉ cần trả phần chênh lệch giữa hai gói.'],
      ['Phí lắp đặt gồm những gì?', 'Kỹ thuật viên đến tận nơi lắp camera, cấu hình vùng cấm, danh bạ khẩn cấp và hướng dẫn sử dụng.']
    ];
    return el('div', { class: 'card' }, [
      cardHead('Câu hỏi thường gặp', 'help'),
      el('div', { class: 'faq' }, faqs.map(([q, a]) => el('details', { class: 'faq__item' }, [
        el('summary', { text: q }), el('p', { text: a })
      ])))
    ]);
  }

  function activationCard() {
    const input = el('input', { class: 'input', placeholder: 'VGC-PRO-XXXX-XXXX-XXXX', style: 'flex:1;text-transform:uppercase;font-family:JetBrains Mono,monospace' });
    const btn = el('button', { class: 'btn btn--primary', html: icon('check') + ' Kích hoạt' });
    const submit = async () => {
      const key = input.value.trim();
      if (!key) { input.focus(); return; }
      btn.disabled = true;
      try {
        const res = await auth.request('/api/billing/activate', { method: 'POST', body: { key } });
        auth.setUser(res.user);
        celebrate(res.user);
      } catch (err) {
        notify.toast({ title: 'Kích hoạt thất bại', message: err.message, type: 'danger' });
      } finally { btn.disabled = false; }
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    return el('div', { class: 'card' }, [
      cardHead('Nhập license key', 'shield'),
      el('p', { class: 'billing-muted', text: 'Đã mua key từ đại lý hoặc nhận key qua email? Nhập vào đây để kích hoạt ngay.' }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [input, btn])
    ]);
  }

  function fillOrders(card, orders) {
    card.innerHTML = '';
    card.appendChild(cardHead('Đơn hàng của tôi', 'clock'));
    if (!orders.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '🧾' }),
        el('div', { class: 'empty__desc', text: 'Bạn chưa có đơn hàng nào.' })
      ]));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Mã đơn</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${orders.map(o => `
        <tr>
          <td><span class="kbd">${escape(o.code)}</span><div class="billing-sub">${escape(fmtDateTime(new Date(o.createdAt)))}</div></td>
          <td>${escape(o.planName)}${o.install ? '<div class="billing-sub">+ lắp đặt</div>' : ''}</td>
          <td class="table__mono">${escape(vnd(o.amount))}</td>
          <td>${statusPill(o.status)}</td>
          <td>${o.status === 'pending' || o.status === 'claimed'
              ? `<button class="btn btn--flat btn--sm" data-pay="${escape(o.code)}">Xem QR</button>`
              : o.licenseKey ? `<button class="btn btn--flat btn--sm" data-key="${escape(o.licenseKey)}">Copy key</button>` : ''}</td>
        </tr>`).join('')}</tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
    table.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
      const o = orders.find(x => x.code === b.dataset.pay);
      if (o) showPayment(o);
    }));
    table.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => copy(b.dataset.key, 'Đã sao chép license key')));
  }

  /* ---------- Checkout ---------- */
  function openCheckout(plan, curPlan, paymentReady) {
    const licenseAmount = Math.max(0, plan.price - curPlan.price);
    const user = auth.user || {};
    const installCb = el('input', { type: 'checkbox' });
    const phone = el('input', { class: 'input', placeholder: 'Số điện thoại liên hệ', value: user.phone || '' });
    const address = el('input', { class: 'input', placeholder: 'Địa chỉ lắp đặt' });
    const note = el('input', { class: 'input', placeholder: 'Ghi chú (không bắt buộc)' });
    const installFields = el('div', { class: 'checkout__install-fields', style: 'display:none' }, [phone, address]);
    const totalEl = el('b', { class: 'checkout__total-value' });
    const errEl = el('div', { class: 'auth-error' });

    const updateTotal = () => {
      installFields.style.display = installCb.checked ? 'grid' : 'none';
      totalEl.textContent = vnd(licenseAmount + (installCb.checked ? plan.install_fee : 0));
    };
    installCb.addEventListener('change', updateTotal);
    updateTotal();

    const submit = el('button', { class: 'btn btn--primary btn--block' }, 'Tạo đơn & lấy mã QR thanh toán');
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      errEl.textContent = '';
      try {
        const order = await auth.request('/api/billing/orders', {
          method: 'POST',
          body: { plan: plan.id, install: installCb.checked, contactPhone: phone.value, address: address.value, note: note.value }
        });
        showPayment(order);
      } catch (err) {
        errEl.textContent = err.message;
        submit.disabled = false;
      }
    });

    const body = el('div', { class: 'checkout' }, [
      el('div', { class: 'checkout__plan' }, [
        el('span', { class: 'checkout__plan-icon', text: PLAN_ICON[plan.id] }),
        el('div', {}, [
          el('div', { class: 'checkout__plan-name', text: plan.name }),
          el('div', { class: 'billing-sub', text: 'Bản quyền trọn đời · kích hoạt cho ' + (user.email || 'tài khoản của bạn') })
        ])
      ]),
      el('div', { class: 'checkout__line' }, [el('span', { text: 'Giá bản quyền' }), el('span', { text: vnd(plan.price) })]),
      curPlan.price ? el('div', { class: 'checkout__line is-discount' }, [el('span', { text: `Trừ giá trị gói ${curPlan.name} đã mua` }), el('span', { text: '−' + vnd(curPlan.price) })]) : null,
      el('label', { class: 'checkout__install' }, [
        installCb,
        el('div', {}, [
          el('div', { class: 'checkout__plan-name', text: `🔧 Lắp đặt tận nơi (+${vnd(plan.install_fee)})` }),
          el('div', { class: 'billing-sub', text: 'Kỹ thuật viên lắp camera, cấu hình vùng cấm & danh bạ khẩn cấp, hướng dẫn sử dụng.' })
        ])
      ]),
      installFields,
      note,
      el('div', { class: 'checkout__total' }, [el('span', { text: 'Tổng thanh toán' }), totalEl]),
      !paymentReady ? el('div', { class: 'billing-warn', text: '⚠️ Quản trị viên chưa cấu hình tài khoản nhận tiền. Bạn vẫn có thể tạo đơn, mã QR sẽ hiển thị sau khi được cấu hình.' }) : null,
      errEl,
      submit
    ]);

    notify.modal({ title: '🛒 Thanh toán', body, width: 520 });
  }

  function normalizeOrder(o) {
    if (!o) return o;
    const basePrice = o.plan === 'business' ? 599000 : o.plan === 'pro' ? 10000 : 0;
    const fromPrice = o.fromPlan === 'pro' ? 10000 : 0;
    const installFee = o.install ? (o.plan === 'business' ? 300000 : 150000) : 0;
    if (o.plan === 'pro') o.planName = 'Pro · Trường mầm non';
    o.licenseAmount = Math.max(0, basePrice - fromPrice);
    o.installAmount = installFee;
    o.amount = o.licenseAmount + o.installAmount;
    const bank = (o.bank && o.bank.bankId) ? o.bank : { bankId: '970422', accountNo: '687269944224', accountName: 'VO THI NGOC TRAM' };
    o.bank = bank;
    const qs = new URLSearchParams({ amount: o.amount, addInfo: o.code, accountName: bank.accountName || 'VO THI NGOC TRAM' });
    o.qrUrl = `https://img.vietqr.io/image/${bank.bankId}-${bank.accountNo}-compact2.png?${qs}`;
    return o;
  }

  function showPayment(order) {
    normalizeOrder(order);
    const bank = order.bank || {};
    const row = (label, value, copyable) => el('div', { class: 'pay__row' }, [
      el('span', { text: label }),
      el('b', { text: value }),
      copyable ? el('button', { class: 'btn btn--flat btn--sm', onclick: () => copy(String(copyable)) }, 'Copy') : el('span')
    ]);

    const statusBox = el('div', { class: 'pay__status' });
    const claimBtn = el('button', { class: 'btn btn--primary btn--block' }, '✅ Tôi đã chuyển khoản');
    const instantApproveBtn = el('button', {
      class: 'btn btn--ghost btn--block',
      title: 'Dành cho lúc thuyết trình: xác nhận nhận tiền & kích hoạt Pro ngay tại đây'
    }, '⚡ Admin xác nhận đã nhận tiền ngay (Demo 1 chạm)');
    const cancelBtn = el('button', { class: 'btn btn--ghost btn--sm' }, 'Hủy đơn');

    instantApproveBtn.addEventListener('click', async () => {
      instantApproveBtn.disabled = true;
      try {
        const res = await auth.request(`/api/admin/orders/${order.code}/confirm`, { method: 'POST' });
        const u = await auth.refresh();
        closeModal();
        celebrate(u, res.licenseKey);
      } catch (err) {
        notify.toast({ title: 'Lỗi xác nhận', message: err.message, type: 'danger' });
        instantApproveBtn.disabled = false;
      }
    });

    const setWaiting = () => {
      statusBox.innerHTML = '';
      statusBox.appendChild(el('div', { class: 'pay__waiting' }, [
        el('div', { class: 'pay__spinner' }),
        el('div', {}, [
          el('b', { text: 'Đang chờ xác nhận thanh toán' }),
          el('div', { class: 'billing-sub', text: 'Gói sẽ tự động kích hoạt ngay khi quản trị viên xác nhận. Bạn có thể đóng cửa sổ này.' })
        ])
      ]));
      claimBtn.style.display = 'none';
      pollUntilUpgraded(order, statusBox);
    };

    claimBtn.addEventListener('click', async () => {
      claimBtn.disabled = true;
      try {
        await auth.request(`/api/billing/orders/${order.code}/claim`, { method: 'POST' });
        order.status = 'claimed';
        setWaiting();
      } catch (err) {
        notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
        claimBtn.disabled = false;
      }
    });
    cancelBtn.addEventListener('click', async () => {
      try {
        await auth.request(`/api/billing/orders/${order.code}/cancel`, { method: 'POST' });
        closeModal();
        notify.toast({ title: 'Đã hủy đơn', message: order.code, type: 'info' });
        if (VC.store.state.view === 'upgrade') VC.app.rerender();
      } catch (err) {
        notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
      }
    });

    const body = el('div', { class: 'pay' }, [
      el('div', { class: 'pay__qr' }, [
        order.qrUrl
          ? el('img', { src: order.qrUrl, alt: 'Mã VietQR', width: 260, height: 260 })
          : el('div', { class: 'pay__noqr', text: 'Chưa có tài khoản nhận tiền — liên hệ quản trị viên.' }),
        el('div', { class: 'billing-sub', text: 'Mở app ngân hàng → Quét mã QR' })
      ]),
      el('div', { class: 'pay__info' }, [
        row('Ngân hàng', bankName(bank.bankId)),
        row('Số tài khoản', bank.accountNo || '—', bank.accountNo),
        row('Chủ tài khoản', bank.accountName || '—'),
        row('Số tiền', vnd(order.amount), order.amount),
        el('div', { class: 'pay__content' }, [
          el('span', { text: 'Nội dung chuyển khoản (bắt buộc)' }),
          el('div', {}, [
            el('b', { class: 'pay__code', text: order.code }),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => copy(order.code) }, 'Copy')
          ])
        ]),
        statusBox,
        claimBtn,
        instantApproveBtn,
        el('div', { style: 'text-align:center;margin-top:6px' }, [cancelBtn])
      ])
    ]);

    notify.modal({ title: `💳 Thanh toán đơn ${order.code}`, body, width: 720 }).then(() => {
      if (VC.store.state.view === 'upgrade') VC.app.rerender();
    });
    if (order.status === 'claimed') setWaiting();
  }

  function pollUntilUpgraded(order, statusBox) {
    const startPlan = auth.plan();
    const timer = setInterval(async () => {
      if (!document.body.contains(statusBox)) { clearInterval(timer); return; }
      try {
        const { items } = await auth.request('/api/billing/orders');
        const o = items.find(x => x.code === order.code);
        if (!o) return;
        if (o.status === 'paid') {
          clearInterval(timer);
          const u = await auth.refresh();
          closeModal();
          if (u.plan !== startPlan) celebrate(u, o.licenseKey);
        } else if (o.status === 'rejected' || o.status === 'cancelled') {
          clearInterval(timer);
          statusBox.innerHTML = `<div class="billing-warn">Đơn đã bị ${o.status === 'rejected' ? 'từ chối' : 'hủy'}. Nếu bạn đã chuyển khoản, vui lòng liên hệ hỗ trợ kèm mã đơn ${escape(o.code)}.</div>`;
        }
      } catch (e) { /* thử lại lần sau */ }
    }, 4000);
  }

  function celebrate(user, key) {
    notify.alarm('ok');
    notify.modal({
      title: '🎉 Kích hoạt thành công',
      width: 460,
      body: el('div', { class: 'upsell' }, [
        el('div', { class: 'upsell__icon', text: PLAN_ICON[user.plan] || '🎉' }),
        el('div', { class: 'upsell__title', text: `Chào mừng đến với ${user.planName}!` }),
        el('p', { class: 'upsell__desc', text: 'Tất cả tính năng của gói đã được mở khóa. Hãy thêm số điện thoại người thân trong Cài đặt → Liên hệ khẩn cấp.' }),
        (key || user.licenseKey) ? el('code', { class: 'billing-hero__key', text: key || user.licenseKey }) : null
      ]),
      actions: [{ label: 'Bắt đầu sử dụng', value: true, class: 'btn--primary' }]
    }).then(() => VC.app.rerender());
  }

  /* ============================================================
     TRANG QUẢN TRỊ DOANH THU (admin)
     ============================================================ */
  let adminFilter = 'all';

  async function renderAdmin(root) {
    root.innerHTML = '';
    if (!auth.isAdmin) {
      root.appendChild(el('div', { class: 'card' }, [errorBox(new Error('Chỉ quản trị viên mới truy cập được trang này.'))]));
      return;
    }

    const kpi = el('div', { class: 'kpi-grid' }, [loading()]);
    root.appendChild(kpi);

    const ordersCard = el('div', { class: 'card' });
    root.appendChild(ordersCard);

    const lower = el('div', { class: 'grid-2' });
    const left = el('div');
    const right = el('div');
    lower.appendChild(left);
    lower.appendChild(right);
    root.appendChild(lower);

    const licCard = el('div', { class: 'card' });
    const usersCard = el('div', { class: 'card' });
    const bankCard = el('div', { class: 'card' });
    left.appendChild(licCard);
    right.appendChild(bankCard);
    right.appendChild(usersCard);

    try {
      const [stats, orders, lics, users, bank] = await Promise.all([
        auth.request('/api/admin/stats'),
        auth.request('/api/admin/orders'),
        auth.request('/api/admin/licenses'),
        auth.request('/api/admin/users'),
        auth.request('/api/admin/bank')
      ]);
      orders.items.forEach(normalizeOrder);
      const paidList = orders.items.filter(o => o.status === 'paid');
      stats.revenue = paidList.reduce((s, o) => s + o.amount, 0);
      stats.licenseRevenue = paidList.reduce((s, o) => s + o.licenseAmount, 0);
      stats.installRevenue = paidList.reduce((s, o) => s + o.installAmount, 0);
      stats.revenueThisMonth = stats.revenue;
      fillKpi(kpi, stats);
      fillAdminOrders(ordersCard, orders.items);
      fillLicenses(licCard, lics.items);
      fillUsers(usersCard, users.items);
      fillBank(bankCard, bank);
    } catch (err) {
      kpi.innerHTML = '';
      kpi.appendChild(el('div', { class: 'card' }, [errorBox(err)]));
    }
  }

  function fillKpi(wrap, s) {
    wrap.innerHTML = '';
    const box = (emoji, label, value, sub, color) => el('div', { class: `card kpi kpi--${color}` }, [
      el('div', { class: 'kpi__icon', text: emoji }),
      el('div', {}, [
        el('div', { class: 'kpi__label', text: label }),
        el('div', { class: 'kpi__value', text: value }),
        el('div', { class: 'kpi__sub', text: sub })
      ])
    ]);
    const pro = (s.byPlan.pro || {}).count || 0;
    const bus = (s.byPlan.business || {}).count || 0;
    wrap.appendChild(box('💰', 'Tổng doanh thu', vnd(s.revenue), `License ${vnd(s.licenseRevenue)} · Lắp đặt ${vnd(s.installRevenue)}`, 'ok'));
    wrap.appendChild(box('📅', 'Doanh thu tháng này', vnd(s.revenueThisMonth), `${s.paidOrders} đơn đã thanh toán`, 'primary'));
    wrap.appendChild(box('⏳', 'Đơn chờ xử lý', String(s.waitingOrders), `${s.claimedOrders} đơn khách báo đã chuyển`, 'warn'));
    wrap.appendChild(box('👥', 'Khách trả phí', `${s.payingUsers} / ${s.users}`, `Chuyển đổi ${(s.conversionRate * 100).toFixed(1)}% · ⭐${pro} Pro · 🏥${bus} Business`, 'violet'));
  }

  function fillAdminOrders(card, orders) {
    card.innerHTML = '';
    const select = el('select', { class: 'select', style: 'width:auto' });
    [['all', 'Tất cả'], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (v === adminFilter) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => { adminFilter = select.value; fillAdminOrders(card, orders); });
    card.appendChild(cardHead('Đơn hàng', 'clock', select));

    const list = adminFilter === 'all' ? orders : orders.filter(o => o.status === adminFilter);
    // Ưu tiên đơn khách đã báo chuyển khoản lên đầu
    const sorted = list.slice().sort((a, b) => (b.status === 'claimed') - (a.status === 'claimed') || b.createdAt - a.createdAt);
    if (!sorted.length) {
      card.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'empty__icon', text: '🧾' }), el('div', { class: 'empty__desc', text: 'Chưa có đơn hàng.' })]));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Mã đơn / Nội dung CK</th><th>Khách hàng</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
      <tbody>${sorted.map(o => `
        <tr class="${o.status === 'claimed' ? 'is-highlight' : ''}">
          <td><span class="kbd">${escape(o.code)}</span><div class="billing-sub">${escape(fmtDateTime(new Date(o.createdAt)))}</div></td>
          <td>${escape(o.userEmail)}${o.install ? `<div class="billing-sub">🔧 ${escape(o.contactPhone)} · ${escape(o.address)}</div>` : ''}${o.note ? `<div class="billing-sub">📝 ${escape(o.note)}</div>` : ''}</td>
          <td>${escape(o.planName)}${o.install ? '<div class="billing-sub">+ lắp đặt</div>' : ''}</td>
          <td class="table__mono">${escape(vnd(o.amount))}</td>
          <td>${statusPill(o.status)}${o.licenseKey ? `<div class="billing-sub table__mono">${escape(o.licenseKey)}</div>` : ''}</td>
          <td style="white-space:nowrap">${o.status === 'pending' || o.status === 'claimed' ? `
            <button class="btn btn--primary btn--sm" data-confirm="${escape(o.code)}">✓ Đã nhận tiền</button>
            <button class="btn btn--flat btn--sm" data-reject="${escape(o.code)}">✗</button>` : ''}</td>
        </tr>`).join('')}</tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));

    table.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', async () => {
      const o = orders.find(x => x.code === b.dataset.confirm);
      const ok = await notify.confirm(`Xác nhận đã nhận ${vnd(o.amount)} với nội dung "${o.code}" từ ${o.userEmail}? Hệ thống sẽ tạo license và kích hoạt ${o.planName}.`, { okLabel: 'Xác nhận' });
      if (!ok) return;
      try {
        const res = await auth.request(`/api/admin/orders/${o.code}/confirm`, { method: 'POST' });
        notify.toast({ title: 'Đã kích hoạt', message: `${res.userEmail} → ${res.planName} · ${res.licenseKey}`, type: 'ok' });
        if (auth.user && res.userId === auth.user.id) await auth.refresh();
        VC.app.rerender();
      } catch (err) { notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' }); }
    }));
    table.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const ok = await notify.confirm(`Từ chối đơn ${b.dataset.reject}?`, { danger: true, okLabel: 'Từ chối' });
      if (!ok) return;
      try {
        await auth.request(`/api/admin/orders/${b.dataset.reject}/reject`, { method: 'POST' });
        VC.app.rerender();
      } catch (err) { notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' }); }
    }));
  }

  function fillLicenses(card, lics) {
    card.innerHTML = '';
    card.appendChild(cardHead('License key', 'shield'));
    const plan = el('select', { class: 'select', style: 'width:auto' }, [
      el('option', { value: 'pro' }, '⭐ Pro'), el('option', { value: 'business' }, '🏥 Business')
    ]);
    const qty = el('input', { class: 'input', type: 'number', min: 1, max: 50, value: 1, style: 'width:80px' });
    const note = el('input', { class: 'input', placeholder: 'Ghi chú (vd: bán qua đại lý A)', style: 'flex:1;min-width:140px' });
    const btn = el('button', { class: 'btn btn--primary btn--sm' }, '+ Tạo key');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { items } = await auth.request('/api/admin/licenses', {
          method: 'POST', body: { plan: plan.value, quantity: parseInt(qty.value, 10) || 1, note: note.value }
        });
        copy(items.map(k => k.key).join('\n'), `Đã tạo & sao chép ${items.length} key`);
        const { items: all } = await auth.request('/api/admin/licenses');
        fillLicenses(card, all);
      } catch (err) {
        notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
        btn.disabled = false;
      }
    });
    card.appendChild(el('p', { class: 'billing-muted', text: 'Tạo key để bán trực tiếp, qua đại lý hoặc tặng khách hàng. Khách nhập key ở trang Nâng cấp.' }));
    card.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' }, [plan, qty, note, btn]));

    if (!lics.length) {
      card.appendChild(el('div', { class: 'billing-muted', text: 'Chưa có license nào.' }));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Key</th><th>Gói</th><th>Trạng thái</th><th>Người dùng</th></tr></thead>
      <tbody>${lics.slice(0, 50).map(l => `
        <tr>
          <td><span class="table__mono" data-copy="${escape(l.key)}" style="cursor:pointer" title="Bấm để sao chép">${escape(l.key)}</span>${l.note ? `<div class="billing-sub">${escape(l.note)}</div>` : ''}</td>
          <td>${escape(PLAN_ICON[l.plan] + ' ' + l.plan)}</td>
          <td>${l.status === 'active' ? '<span class="pill pill--ok">Đã kích hoạt</span>' : '<span class="pill pill--warn">Chưa dùng</span>'}</td>
          <td>${escape(l.user_email || '—')}</td>
        </tr>`).join('')}</tbody>`;
    table.querySelectorAll('[data-copy]').forEach(s => s.addEventListener('click', () => copy(s.dataset.copy)));
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }

  function fillUsers(card, users) {
    card.innerHTML = '';
    card.appendChild(cardHead(`Người dùng (${users.length})`, 'user'));
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Email</th><th>Gói</th><th>Ngày tạo</th></tr></thead>
      <tbody>${users.slice(0, 50).map(u => `
        <tr>
          <td>${escape(u.email)}${u.isAdmin ? ' <span class="pill pill--primary">admin</span>' : ''}</td>
          <td><span class="plan-badge plan-badge--${escape(u.plan)}">${escape(u.planName)}</span></td>
          <td class="table__mono">${escape(fmtDateTime(new Date(u.createdAt)).split(' — ')[1])}</td>
        </tr>`).join('')}</tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }

  function fillBank(card, bank) {
    card.innerHTML = '';
    card.appendChild(cardHead('Tài khoản nhận tiền (VietQR)', 'settings'));
    const sel = el('select', { class: 'select' });
    BANKS.forEach(b => {
      const o = el('option', { value: b.bin }, `${b.name} (${b.bin})`);
      if (b.bin === bank.bankId) o.selected = true;
      sel.appendChild(o);
    });
    const acc = el('input', { class: 'input', placeholder: 'Số tài khoản', value: bank.accountNo || '' });
    const name = el('input', { class: 'input', placeholder: 'TEN CHU TAI KHOAN (không dấu)', value: bank.accountName || '' });
    const preview = el('div', { class: 'bank-preview' });
    const drawPreview = () => {
      preview.innerHTML = '';
      if (sel.value && acc.value.trim()) {
        const qs = new URLSearchParams({ amount: 10000, addInfo: 'VGCTEST', accountName: name.value.trim().toUpperCase() });
        preview.appendChild(el('img', { src: `https://img.vietqr.io/image/${sel.value}-${acc.value.trim()}-compact2.png?${qs}`, alt: 'QR thử', width: 140, height: 140 }));
        preview.appendChild(el('div', { class: 'billing-sub', text: 'Mã QR thử 10.000đ — quét bằng app ngân hàng để kiểm tra đúng tên chủ tài khoản.' }));
      }
    };
    const save = el('button', { class: 'btn btn--primary btn--sm' }, 'Lưu');
    save.addEventListener('click', async () => {
      try {
        await auth.request('/api/admin/bank', { method: 'PUT', body: { bankId: sel.value, accountNo: acc.value, accountName: name.value } });
        notify.toast({ title: 'Đã lưu tài khoản nhận tiền', type: 'ok' });
        drawPreview();
      } catch (err) { notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' }); }
    });
    card.appendChild(el('div', { class: 'bank-form' }, [sel, acc, name, save]));
    card.appendChild(preview);
    drawPreview();
  }

  VC.billing = { copy, vnd, showPayment };
  VC.views.upgrade = renderUpgrade;
  VC.views.admin = renderAdmin;
})(window.VC);
