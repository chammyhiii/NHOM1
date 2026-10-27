(function (VC) {
  'use strict';

  /* ============================================================
     SafeZone Hồ Đá · ĐHQG-HCM — billing.js
     Thương mại hóa & Mở rộng Đa lĩnh vực (Hồ Đá ĐHQG, Trường mầm non
     tư thục, Viện dưỡng lão, Khu du lịch sinh thái) + Thanh toán VietQR
     MB Bank (687269944224 - VO THI NGOC TRAM) & Quản trị Doanh thu.
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

  const PLAN_ICON = { free: '🌊', pro: '⭐', business: '🏛️' };

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
    return el('div', { class: 'empty' }, [el('div', { class: 'empty__icon', text: '⏳' }), el('div', { class: 'empty__desc', text: 'Đang tải dữ liệu…' })]);
  }

  function errorBox(err) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '⚠️' }),
      el('div', { class: 'empty__title', text: 'Không tải được dữ liệu' }),
      el('div', { class: 'empty__desc', text: err.message })
    ]);
  }

  /* ============================================================
     TRANG THƯƠNG MẠI HÓA & NÂNG CẤP PRO
     ============================================================ */
  async function renderUpgrade(root) {
    root.innerHTML = '';
    const user = auth.user;
    const cur = auth.plan();

    // 1. Hero Banner: Core Hồ Đá ĐHQG-HCM Project + Commercialization
    root.appendChild(el('div', { class: 'card billing-hero' }, [
      el('div', {}, [
        el('div', { class: 'billing-hero__eyebrow', text: 'Thương mại hóa Dự án Hệ thống Cảnh báo An toàn Hồ Đá · ĐHQG TP.HCM' }),
        el('h2', { class: 'billing-hero__title', text: 'Chuyển giao Công nghệ Camera AI & Bản quyền Trọn đời' }),
        el('p', { class: 'billing-hero__desc', text: 'Từ lõi công nghệ Thị giác máy tính giám sát vách đá & vùng cấm tại Hồ Đá ĐHQG-HCM, giải pháp sẵn sàng triển khai thương mại cho Ban Quản lý Khu đô thị, Trường mầm non tư thục, Viện dưỡng lão và Khu du lịch sinh thái.' })
      ]),
      el('div', { class: 'billing-hero__current' }, [
        el('span', { class: 'billing-hero__label', text: 'Bản quyền đang kích hoạt' }),
        el('span', { class: `plan-badge plan-badge--${cur}`, text: `${PLAN_ICON[cur] || ''} ${user ? user.planName : 'Miễn phí (1 Trạm)'}` }),
        user && user.licenseKey ? el('code', { class: 'billing-hero__key', text: user.licenseKey, title: 'Bấm để sao chép', onclick: () => copy(user.licenseKey) }) : null,
        cur !== 'free' ? el('button', {
          class: 'btn btn--ghost btn--sm',
          style: 'margin-top:4px',
          onclick: () => auth.resetToFreeDemo()
        }, '🔄 Đặt lại gói Free (để demo lại)') : null
      ])
    ]));

    // 2. Multi-Domain Application Showcase (Allowed Exception in Requirement #3)
    root.appendChild(multiDomainCard());

    // 3. 3-Tier Pricing Grid
    const plansWrap = el('div', { class: 'pricing-grid' }, [loading()]);
    root.appendChild(plansWrap);

    // 4. Lower Section (Swapped columns: Left = Compare Table + FAQ; Right = License Activation + My Orders)
    const lower = el('div', { class: 'grid-2' });
    const leftCol = el('div');
    const rightCol = el('div');
    lower.appendChild(leftCol);
    lower.appendChild(rightCol);
    root.appendChild(lower);

    const compareCard = el('div', { class: 'card' });
    leftCol.appendChild(compareCard);
    leftCol.appendChild(faqCard());

    rightCol.appendChild(activationCard());
    const ordersCard = el('div', { class: 'card' }, [cardHead('Đơn hàng & Giao dịch VietQR của tôi', 'clock'), loading()]);
    rightCol.appendChild(ordersCard);

    try {
      const [{ plans, paymentReady }, { items: orders }] = await Promise.all([
        auth.request('/api/billing/plans'),
        auth.request('/api/billing/orders')
      ]);
      plans.forEach(p => {
        if (p.id === 'free') {
          p.name = 'Cộng đồng · Trạm đơn Hồ Đá';
          p.tagline = 'Thử nghiệm 1 trạm Camera AI giám sát bờ hồ';
          p.highlights = [
            'Giám sát 1 trạm Camera AI (Bờ Bắc Hồ Đá)',
            'Phát hiện trượt ngã & vượt rào vào vùng cấm',
            'Lưu lịch sử sự cố 7 ngày gần nhất',
            'Cảnh báo còi tại chỗ & gửi Email kèm ảnh'
          ];
        } else if (p.id === 'pro') {
          p.name = 'Pro · Trường Mầm non & Cụm Bờ Hồ';
          p.tagline = 'Mua 1 lần (10.000đ) — Phù hợp Trường mầm non tư thục & Chốt bảo vệ';
          p.price = 10000;
          p.install_fee = 150000;
          p.highlights = [
            'Mở khóa tối đa 4 trạm Camera AI cùng lúc',
            'Ứng dụng cho Cụm Hồ Đá hoặc Trường mầm non tư thục (sân chơi, hồ bơi, cổng trường)',
            'Lưu trữ nhật ký sự cố không giới hạn & Xuất báo cáo CSV',
            'Gọi khẩn cấp 1 chạm tới Đội bảo vệ / Giáo viên / Phụ huynh'
          ];
        } else if (p.id === 'business') {
          p.name = 'Business · Đô thị ĐHQG & Viện Dưỡng lão';
          p.tagline = 'Giải pháp toàn diện cho Ban Quản lý ĐHQG, Viện dưỡng lão & Khu du lịch';
          p.price = 599000;
          p.install_fee = 300000;
          p.highlights = [
            'Mở khóa toàn bộ 6+ trạm Camera AI không giới hạn',
            'Triển khai cho toàn khu vực Hồ Đá ĐHQG-HCM, Viện dưỡng lão, Bệnh viện',
            'Bản đồ số 3D & Radar quét tín hiệu toàn khu vực',
            'Danh bạ điều phối ứng cứu không giới hạn & Hỗ trợ kỹ thuật 24/7'
          ];
        }
      });
      orders.forEach(normalizeOrder);
      plansWrap.innerHTML = '';
      plans.forEach(p => plansWrap.appendChild(pricingCard(p, plans, paymentReady)));
      compareCard.innerHTML = '';
      compareCard.appendChild(cardHead('Bảng So sánh Tính năng & Phạm vi Triển khai', 'chart'));
      compareCard.appendChild(compareTable(plans));
      fillOrders(ordersCard, orders, plans);
    } catch (err) {
      plansWrap.innerHTML = '';
      plansWrap.appendChild(el('div', { class: 'card' }, [errorBox(err)]));
    }
  }

  function multiDomainCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(cardHead('Khả năng Ứng dụng & Thương mại hóa Đa lĩnh vực từ Công nghệ Hồ Đá ĐHQG-HCM', 'activity',
      el('span', { class: 'badge badge--ok' }, 'Cùng 1 lõi AI · Triển khai đa ngành')
    ));
    const domains = [
      ['🌊', 'Hồ Đá — Khu đô thị ĐHQG TP.HCM (Trọng tâm)', 'Giám sát vách đá dựng đứng, mỏm đá tử thần, phát hiện sinh viên/người dân vượt rào hoặc trượt ngã sát mép nước sâu.'],
      ['🏫', 'Trường Mầm non Tư thục & Nhóm trẻ (Gói Pro)', 'Khoanh vùng cấm tại cầu thang, hồ bơi học đường, cổng trường; phát hiện trẻ té ngã ở sân chơi và báo ngay cho cô giáo.'],
      ['🏥', 'Viện Dưỡng lão & Cơ sở Chăm sóc (Gói Business)', 'Theo dõi hành lang, phòng sinh hoạt 24/7; nhận diện sớm người cao tuổi trượt ngã hoặc bất tỉnh để điều dưỡng hỗ trợ kịp thời.'],
      ['🏊', 'Hồ bơi, Khu Du lịch Sinh thái & Công trường', 'Thiết lập hàng rào ảo (Geofencing) bảo vệ khu vực nước sâu, hố công trình và cảnh báo xâm nhập ngoài giờ hoạt động.']
    ];
    const grid = el('div', { class: 'quick-grid', style: 'grid-template-columns:repeat(2,1fr)' });
    domains.forEach(([ico, title, desc]) => {
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

  function pricingCard(p, plans, paymentReady) {
    const cur = auth.plan();
    const curPlan = plans.find(x => x.id === cur) || plans[0];
    const isCurrent = p.id === cur;
    const isLower = p.rank < curPlan.rank;
    const diff = Math.max(0, p.price - curPlan.price);

    let btn;
    if (isCurrent) btn = el('button', { class: 'btn btn--ghost btn--block', disabled: true }, '✓ Gói đang kích hoạt');
    else if (isLower || p.price === 0) btn = el('button', { class: 'btn btn--ghost btn--block', disabled: true }, 'Đã bao gồm');
    else btn = el('button', {
      class: `btn ${p.id === 'pro' ? 'btn--primary' : 'btn--ghost'} btn--block`,
      onclick: () => openCheckout(p, curPlan, paymentReady)
    }, curPlan.rank > 0 ? `Nâng cấp · ${vnd(diff)}` : `Mua bản quyền · ${vnd(p.price)}`);

    return el('div', { class: `price-card ${p.id === 'pro' ? 'is-featured' : ''} ${isCurrent ? 'is-current' : ''}` }, [
      p.id === 'pro' ? el('div', { class: 'price-card__ribbon', text: 'Bán chạy · 10.000đ' }) : null,
      el('div', { class: 'price-card__icon', text: PLAN_ICON[p.id] || '•' }),
      el('div', { class: 'price-card__name', text: p.name }),
      el('div', { class: 'price-card__tag', text: p.tagline }),
      el('div', { class: 'price-card__price' }, [
        el('b', { text: p.price ? vnd(p.price) : '0đ' }),
        el('span', { text: p.price ? ' / trọn đời' : ' / miễn phí' })
      ]),
      el('div', { class: 'price-card__install', text: p.install_fee ? `+ Khảo sát & lắp đặt tận nơi (tùy chọn): ${vnd(p.install_fee)}` : 'Tự triển khai trên máy trạm sẵn có' }),
      el('ul', { class: 'price-card__list' }, p.highlights.map(h => el('li', { text: h }))),
      btn
    ]);
  }

  function compareTable(plans) {
    const fmt = (v, unit) => v == null ? '∞ Không giới hạn' : (v === true ? '✅' : v === false || v === 0 ? '—' : `${v}${unit || ''}`);
    const rows = [
      ['Số trạm Camera AI', p => fmt(p.max_cameras)],
      ['Lưu trữ nhật ký sự cố', p => fmt(p.history_days, ' ngày')],
      ['AI Nhận diện trượt ngã & vượt rào', () => '✅'],
      ['Email báo động kèm ảnh hiện trường', () => '✅'],
      ['Xuất báo cáo Excel / CSV', p => fmt(p.export_csv)],
      ['Gọi điều phối khẩn cấp', p => fmt(p.emergency_call)],
      ['Số hotline trực ban / phụ huynh', p => fmt(p.max_contacts)],
      ['Chi phí bản quyền trọn đời', p => p.price ? vnd(p.price) : '0đ'],
      ['Phí lắp đặt tận nơi (tùy chọn)', p => p.install_fee ? vnd(p.install_fee) : '—']
    ];
    const table = el('table', { class: 'table compare-table' });
    table.innerHTML = `
      <thead><tr><th>Hạng mục</th>${plans.map(p => `<th class="${p.id === auth.plan() ? 'is-current' : ''}">${escape(PLAN_ICON[p.id] + ' ' + p.name.split(' · ')[0])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><td>${escape(label)}</td>${plans.map(p => `<td class="${p.id === auth.plan() ? 'is-current' : ''}">${escape(fn(p))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return el('div', { class: 'table-wrap' }, [table]);
  }

  function faqCard() {
    const faqs = [
      ['Tại sao công nghệ Hồ Đá ĐHQG-HCM có thể bán cho Trường mầm non & Viện dưỡng lão?', 'Bởi vì bài toán cốt lõi đều sử dụng Thị giác máy tính (YOLOv8x-Pose + Polygon Geofencing) để phát hiện con người đi vào vùng nguy hiểm (bờ vực Hồ Đá, hồ bơi, cổng trường, cầu thang) hoặc gặp tai nạn trượt ngã / bất tỉnh.'],
      ['Thanh toán qua VietQR hoạt động như thế nào?', 'Hệ thống tạo mã VietQR động của MB Bank (STK: 687269944224 - Chủ TK: VO THI NGOC TRAM) khớp chính xác số tiền và nội dung mã đơn hàng.'],
      ['Làm sao để kích hoạt ngay khi thuyết trình?', 'Trong cửa sổ mã QR có sẵn nút "⚡ Admin xác nhận đã nhận tiền ngay (Demo 1 chạm)" hoặc bạn có thể vào tab Quản trị & Doanh thu để duyệt đơn.']
    ];
    return el('div', { class: 'card' }, [
      cardHead('Giải đáp Mô hình Thương mại hóa', 'help'),
      el('div', { class: 'faq' }, faqs.map(([q, a]) => el('details', { class: 'faq__item' }, [
        el('summary', { text: q }), el('p', { text: a })
      ])))
    ]);
  }

  function activationCard() {
    const input = el('input', { class: 'input', placeholder: 'VGC-PRO-XXXX-XXXX-XXXX', style: 'flex:1;text-transform:uppercase;font-family:JetBrains Mono,monospace' });
    const btn = el('button', { class: 'btn btn--primary', html: icon('check') + ' Kích hoạt Key' });
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
      cardHead('Kích hoạt bằng Mã Bản quyền (License Key)', 'shield'),
      el('p', { class: 'billing-muted', text: 'Nhập mã License Key được cấp sau khi thanh toán hoặc tạo từ trang Quản trị Doanh thu để mở khóa ngay.' }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [input, btn])
    ]);
  }

  function fillOrders(card, orders) {
    card.innerHTML = '';
    card.appendChild(cardHead('Đơn hàng & Giao dịch VietQR của tôi', 'clock'));
    if (!orders.length) {
      card.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '🧾' }),
        el('div', { class: 'empty__desc', text: 'Chưa có đơn hàng nào.' })
      ]));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Mã đơn</th><th>Gói triển khai</th><th>Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${orders.map(o => `
        <tr>
          <td><span class="kbd">${escape(o.code)}</span><div class="billing-sub">${escape(fmtDateTime(new Date(o.createdAt)))}</div></td>
          <td>${escape(o.planName)}${o.install ? '<div class="billing-sub">+ lắp đặt tận nơi</div>' : ''}</td>
          <td class="table__mono">${escape(vnd(o.amount))}</td>
          <td>${statusPill(o.status)}</td>
          <td>${o.status === 'pending' || o.status === 'claimed'
              ? `<button class="btn btn--flat btn--sm" data-pay="${escape(o.code)}">Mở QR</button>`
              : o.licenseKey ? `<button class="btn btn--flat btn--sm" data-key="${escape(o.licenseKey)}">Copy Key</button>` : ''}</td>
        </tr>`).join('')}</tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
    table.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
      const o = orders.find(x => x.code === b.dataset.pay);
      if (o) showPayment(o);
    }));
    table.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => copy(b.dataset.key, 'Đã sao chép License Key')));
  }

  /* ---------- Checkout ---------- */
  function openCheckout(plan, curPlan, paymentReady) {
    const licenseAmount = Math.max(0, plan.price - curPlan.price);
    const user = auth.user || {};
    const installCb = el('input', { type: 'checkbox' });
    const phone = el('input', { class: 'input', placeholder: 'Số điện thoại đơn vị / người nhận', value: user.phone || '' });
    const address = el('input', { class: 'input', placeholder: 'Địa điểm triển khai (VD: Khu A ĐHQG / Trường mầm non...)' });
    const note = el('input', { class: 'input', placeholder: 'Ghi chú lĩnh vực triển khai (Hồ Đá, Trường mầm non, Viện dưỡng lão...)' });
    const installFields = el('div', { class: 'checkout__install-fields', style: 'display:none' }, [phone, address]);
    const totalEl = el('b', { class: 'checkout__total-value' });
    const errEl = el('div', { class: 'auth-error' });

    const updateTotal = () => {
      installFields.style.display = installCb.checked ? 'grid' : 'none';
      totalEl.textContent = vnd(licenseAmount + (installCb.checked ? plan.install_fee : 0));
    };
    installCb.addEventListener('change', updateTotal);
    updateTotal();

    const submit = el('button', { class: 'btn btn--primary btn--block' }, 'Tạo đơn & Hiển thị Mã QR MB Bank');
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
          el('div', { class: 'billing-sub', text: 'Bản quyền phần mềm trọn đời · Tài khoản: ' + (user.email || 'Khách hàng') })
        ])
      ]),
      el('div', { class: 'checkout__line' }, [el('span', { text: 'Phí bản quyền phần mềm' }), el('span', { text: vnd(plan.price) })]),
      curPlan.price ? el('div', { class: 'checkout__line is-discount' }, [el('span', { text: `Khấu trừ gói ${curPlan.name} đã có` }), el('span', { text: '−' + vnd(curPlan.price) })]) : null,
      el('label', { class: 'checkout__install' }, [
        installCb,
        el('div', {}, [
          el('div', { class: 'checkout__plan-name', text: `🔧 Dịch vụ khảo sát & lắp đặt tận nơi (+${vnd(plan.install_fee)})` }),
          el('div', { class: 'billing-sub', text: 'Kỹ thuật viên hỗ trợ lắp đặt camera, khoanh vùng cấm & bàn giao vận hành.' })
        ])
      ]),
      installFields,
      note,
      el('div', { class: 'checkout__total' }, [el('span', { text: 'Tổng thanh toán VietQR' }), totalEl]),
      !paymentReady ? el('div', { class: 'billing-warn', text: '⚠️ Đang dùng cấu hình VietQR mặc định MB Bank.' }) : null,
      errEl,
      submit
    ]);

    notify.modal({ title: '🛒 Đăng ký Bản quyền & Triển khai', body, width: 520 });
  }

  function normalizeOrder(o) {
    if (!o) return o;
    const basePrice = o.plan === 'business' ? 599000 : o.plan === 'pro' ? 10000 : 0;
    const fromPrice = o.fromPlan === 'pro' ? 10000 : 0;
    const installFee = o.install ? (o.plan === 'business' ? 300000 : 150000) : 0;
    if (o.plan === 'pro') o.planName = 'Pro · Trường Mầm non & Cụm Bờ Hồ';
    if (o.plan === 'business') o.planName = 'Business · Đô thị ĐHQG & Viện Dưỡng lão';
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
    const claimBtn = el('button', { class: 'btn btn--primary btn--block' }, '✅ Tôi đã chuyển khoản qua VietQR');
    const instantApproveBtn = el('button', {
      class: 'btn btn--ghost btn--block',
      title: 'Dành cho lúc thuyết trình: xác nhận nhận tiền & kích hoạt Pro ngay tại đây'
    }, '⚡ Admin xác nhận đã nhận tiền ngay (Demo 1 chạm)');
    const cancelBtn = el('button', { class: 'btn btn--ghost btn--sm' }, 'Hủy đơn hàng');

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
          el('b', { text: 'Đang chờ đối soát thanh toán' }),
          el('div', { class: 'billing-sub', text: 'Gói bản quyền sẽ tự động kích hoạt ngay khi Quản trị viên xác nhận.' })
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
          ? el('img', { src: order.qrUrl, alt: 'Mã VietQR MB Bank', width: 260, height: 260 })
          : el('div', { class: 'pay__noqr', text: 'Chưa có tài khoản nhận tiền.' }),
        el('div', { class: 'billing-sub', text: 'Quét mã VietQR bằng bất kỳ ứng dụng Ngân hàng nào' })
      ]),
      el('div', { class: 'pay__info' }, [
        row('Ngân hàng thụ hưởng', bankName(bank.bankId)),
        row('Số tài khoản', bank.accountNo || '—', bank.accountNo),
        row('Chủ tài khoản', bank.accountName || '—'),
        row('Số tiền thanh toán', vnd(order.amount), order.amount),
        el('div', { class: 'pay__content' }, [
          el('span', { text: 'Nội dung chuyển khoản tự động' }),
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

    notify.modal({ title: `💳 Thanh toán VietQR · Đơn ${order.code}`, body, width: 720 }).then(() => {
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
          statusBox.innerHTML = `<div class="billing-warn">Đơn đã bị ${o.status === 'rejected' ? 'từ chối' : 'hủy'}.</div>`;
        }
      } catch (e) { /* retry */ }
    }, 4000);
  }

  function celebrate(user, key) {
    notify.alarm('ok');
    notify.modal({
      title: '🎉 Đã Mở khóa Bản quyền Thành công!',
      width: 460,
      body: el('div', { class: 'upsell' }, [
        el('div', { class: 'upsell__icon', text: PLAN_ICON[user.plan] || '🎉' }),
        el('div', { class: 'upsell__title', text: `Đã kích hoạt ${user.planName}` }),
        el('p', { class: 'upsell__desc', text: 'Toàn bộ trạm Camera AI, xuất báo cáo CSV và danh bạ ứng cứu khẩn cấp của gói đã sẵn sàng hoạt động.' }),
        (key || user.licenseKey) ? el('code', { class: 'billing-hero__key', text: key || user.licenseKey }) : null
      ]),
      actions: [{ label: 'Bắt đầu Giám sát ngay', value: true, class: 'btn--primary' }]
    }).then(() => VC.app.rerender());
  }

  /* ============================================================
     TRANG QUẢN TRỊ & DOANH THU (admin)
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

    // Reordered layout (.command-deck): Left 380px = VietQR Bank Config + License Generator; Right Main Stage = Orders Table + Users Table
    const lower = el('div', { class: 'command-deck' });
    const left = el('div');
    const right = el('div');
    lower.appendChild(left);
    lower.appendChild(right);
    root.appendChild(lower);

    const bankCard = el('div', { class: 'card' });
    const licCard = el('div', { class: 'card' });
    const ordersCard = el('div', { class: 'card' });
    const usersCard = el('div', { class: 'card' });

    left.appendChild(bankCard);
    left.appendChild(licCard);
    right.appendChild(ordersCard);
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
      fillBank(bankCard, bank);
      fillLicenses(licCard, lics.items);
      fillAdminOrders(ordersCard, orders.items);
      fillUsers(usersCard, users.items);
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
    wrap.appendChild(box('💰', 'Tổng Doanh thu Thương mại', vnd(s.revenue), `Bản quyền ${vnd(s.licenseRevenue)} · Lắp đặt ${vnd(s.installRevenue)}`, 'ok'));
    wrap.appendChild(box('📅', 'Doanh thu Trong tháng', vnd(s.revenueThisMonth), `${s.paidOrders} đơn hàng đã duyệt`, 'primary'));
    wrap.appendChild(box('⏳', 'Đơn Chờ Duyệt VietQR', String(s.waitingOrders), `${s.claimedOrders} đơn khách báo đã chuyển`, 'warn'));
    wrap.appendChild(box('👥', 'Đơn vị Mua Bản quyền', `${s.payingUsers} / ${s.users}`, `Tỷ lệ ${(s.conversionRate * 100).toFixed(1)}% · ⭐${pro} Pro · 🏛️${bus} Business`, 'violet'));
  }

  function fillAdminOrders(card, orders) {
    card.innerHTML = '';
    const select = el('select', { class: 'select', style: 'width:auto' });
    [['all', 'Tất cả đơn'], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (v === adminFilter) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => { adminFilter = select.value; fillAdminOrders(card, orders); });
    card.appendChild(cardHead('Danh sách Đơn hàng & Đối soát VietQR', 'clock', select));

    const list = adminFilter === 'all' ? orders : orders.filter(o => o.status === adminFilter);
    const sorted = list.slice().sort((a, b) => (b.status === 'claimed') - (a.status === 'claimed') || b.createdAt - a.createdAt);
    if (!sorted.length) {
      card.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'empty__icon', text: '🧾' }), el('div', { class: 'empty__desc', text: 'Chưa có đơn hàng nào.' })]));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Mã đơn / CK</th><th>Khách hàng / Đơn vị</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Duyệt</th></tr></thead>
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
      const ok = await notify.confirm(`Xác nhận đã nhận ${vnd(o.amount)} với nội dung "${o.code}" từ ${o.userEmail}? Hệ thống sẽ cấp License Key và kích hoạt ${o.planName}.`, { okLabel: 'Xác nhận duyệt' });
      if (!ok) return;
      try {
        const res = await auth.request(`/api/admin/orders/${o.code}/confirm`, { method: 'POST' });
        notify.toast({ title: 'Đã duyệt & Kích hoạt', message: `${res.userEmail} → ${res.planName} · ${res.licenseKey}`, type: 'ok' });
        if (auth.user && res.userId === auth.user.id) await auth.refresh();
        VC.app.rerender();
      } catch (err) { notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' }); }
    }));
    table.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const ok = await notify.confirm(`Từ chối đơn hàng ${b.dataset.reject}?`, { danger: true, okLabel: 'Từ chối' });
      if (!ok) return;
      try {
        await auth.request(`/api/admin/orders/${b.dataset.reject}/reject`, { method: 'POST' });
        VC.app.rerender();
      } catch (err) { notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' }); }
    }));
  }

  function fillLicenses(card, lics) {
    card.innerHTML = '';
    card.appendChild(cardHead('Cấp Mã License Key Nhanh', 'shield'));
    const plan = el('select', { class: 'select', style: 'width:auto' }, [
      el('option', { value: 'pro' }, '⭐ Pro (10k)'), el('option', { value: 'business' }, '🏛️ Business (599k)')
    ]);
    const qty = el('input', { class: 'input', type: 'number', min: 1, max: 50, value: 1, style: 'width:70px' });
    const note = el('input', { class: 'input', placeholder: 'Ghi chú đơn vị nhận...', style: 'flex:1;min-width:120px' });
    const btn = el('button', { class: 'btn btn--primary btn--sm' }, '+ Tạo Key');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const { items } = await auth.request('/api/admin/licenses', {
          method: 'POST', body: { plan: plan.value, quantity: parseInt(qty.value, 10) || 1, note: note.value }
        });
        copy(items.map(k => k.key).join('\n'), `Đã tạo & sao chép ${items.length} License Key`);
        const { items: all } = await auth.request('/api/admin/licenses');
        fillLicenses(card, all);
      } catch (err) {
        notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
        btn.disabled = false;
      }
    });
    card.appendChild(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' }, [plan, qty, note, btn]));

    if (!lics.length) {
      card.appendChild(el('div', { class: 'billing-muted', text: 'Chưa có License Key nào.' }));
      return;
    }
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Mã Key</th><th>Gói</th><th>TT</th></tr></thead>
      <tbody>${lics.slice(0, 15).map(l => `
        <tr>
          <td><span class="table__mono" data-copy="${escape(l.key)}" style="cursor:pointer" title="Bấm để sao chép">${escape(l.key)}</span></td>
          <td>${escape(PLAN_ICON[l.plan] + ' ' + l.plan)}</td>
          <td>${l.status === 'active' ? '<span class="pill pill--ok">Đã dùng</span>' : '<span class="pill pill--warn">Mới</span>'}</td>
        </tr>`).join('')}</tbody>`;
    table.querySelectorAll('[data-copy]').forEach(s => s.addEventListener('click', () => copy(s.dataset.copy)));
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }

  function fillUsers(card, users) {
    card.innerHTML = '';
    card.appendChild(cardHead(`Danh sách Tài khoản & Đơn vị (${users.length})`, 'user'));
    const table = el('table', { class: 'table' });
    table.innerHTML = `
      <thead><tr><th>Email</th><th>Gói bản quyền</th><th>Ngày đăng ký</th></tr></thead>
      <tbody>${users.slice(0, 30).map(u => `
        <tr>
          <td>${escape(u.email)}${u.isAdmin ? ' <span class="pill pill--primary">admin</span>' : ''}</td>
          <td><span class="plan-badge plan-badge--${escape(u.plan)}">${escape(u.plan === 'pro' ? 'Pro · Trường Mầm non & Cụm Bờ Hồ' : u.planName)}</span></td>
          <td class="table__mono">${escape(fmtDateTime(new Date(u.createdAt)).split(' — ')[1])}</td>
        </tr>`).join('')}</tbody>`;
    card.appendChild(el('div', { class: 'table-wrap' }, [table]));
  }

  function fillBank(card, bank) {
    card.innerHTML = '';
    card.appendChild(cardHead('Tài khoản Thụ hưởng VietQR', 'settings'));
    const sel = el('select', { class: 'select' });
    BANKS.forEach(b => {
      const o = el('option', { value: b.bin }, `${b.name} (${b.bin})`);
      if (b.bin === bank.bankId) o.selected = true;
      sel.appendChild(o);
    });
    const acc = el('input', { class: 'input', placeholder: 'Số tài khoản', value: bank.accountNo || '' });
    const name = el('input', { class: 'input', placeholder: 'TEN CHU TAI KHOAN', value: bank.accountName || '' });
    const preview = el('div', { class: 'bank-preview' });
    const drawPreview = () => {
      preview.innerHTML = '';
      if (sel.value && acc.value.trim()) {
        const qs = new URLSearchParams({ amount: 10000, addInfo: 'HODATEST', accountName: name.value.trim().toUpperCase() });
        preview.appendChild(el('img', { src: `https://img.vietqr.io/image/${sel.value}-${acc.value.trim()}-compact2.png?${qs}`, alt: 'QR MB Bank', width: 130, height: 130 }));
        preview.appendChild(el('div', { class: 'billing-sub', text: 'Mã VietQR 10.000đ đã kết nối chính xác tài khoản thụ hưởng.' }));
      }
    };
    const save = el('button', { class: 'btn btn--primary btn--sm' }, 'Lưu cấu hình');
    save.addEventListener('click', async () => {
      try {
        await auth.request('/api/admin/bank', { method: 'PUT', body: { bankId: sel.value, accountNo: acc.value, accountName: name.value } });
        notify.toast({ title: 'Đã lưu tài khoản VietQR', type: 'ok' });
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
