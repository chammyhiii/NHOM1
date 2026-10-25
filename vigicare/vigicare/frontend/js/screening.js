/* ============================================================
   VigiCare — screening.js
   Trang Sàng lọc đột quỵ (FAST + Chỉ số sức khỏe + Triệu chứng)
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { el, icon, escape, fmtDateTime } = utils;

  const SYMPTOMS_LIST = [
    { id: 'dizzy',    label: 'Chóng mặt đột ngột' },
    { id: 'headache', label: 'Đau đầu dữ dội' },
    { id: 'numb',     label: 'Tê tay / chân một bên' },
    { id: 'speech',   label: 'Khó nói / nói ngọng' },
    { id: 'vision',   label: 'Mờ mắt / mất thị lực một bên' },
    { id: 'balance',  label: 'Mất thăng bằng / đi loạng choạng' },
    { id: 'confuse',  label: 'Lú lẫn / khó hiểu' },
    { id: 'weakness', label: 'Yếu nửa người' },
  ];

  let lastResult = null;

  function renderScreening(root) {
    root.innerHTML = '';
    lastResult = null;

    const wrap = el('div', { class: 'grid-2' });

    /* ---------------- LEFT: Form ---------------- */
    const left = el('div');
    left.appendChild(formCard());
    wrap.appendChild(left);

    /* ---------------- RIGHT: Result + History ---------------- */
    const right = el('div');
    right.appendChild(resultCard());
    right.appendChild(historyCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    bindForm(root);
    loadHistory();
  }

  /* ============================================================
     FORM
     ============================================================ */
  function formCard() {
    const card = el('div', { class: 'card' });

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Phiếu sàng lọc đột quỵ'
      ]),
      el('span', { class: 'badge badge--primary' }, 'FAST')
    ]));

    const form = el('form', { id: 'screeningForm' });

    /* ----- PHẦN 1: FAST ----- */
    form.appendChild(sectionHeader('1. Test FAST', 'Bộ 4 câu hỏi chuẩn y khoa quốc tế'));

    form.appendChild(fastRow('fast_face', 'Face — Mặt', 'Mặt có bị méo, một bên xệ xuống không?'));
    form.appendChild(fastRow('fast_arm', 'Arm — Tay', 'Có thể giơ 2 tay ngang vai và giữ 10 giây không?'));
    form.appendChild(fastRow('fast_speech', 'Speech — Nói', 'Nói một câu đơn giản, có bị líu lưỡi không?'));

    const fastNote = el('div', {
      style: 'padding:10px 14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:8px;font-size:12.5px;color:#92400e;margin-bottom:18px'
    }, '⚠️ Nếu có BẤT KỲ dấu hiệu nào → gọi 115 NGAY. Đừng chờ đợi.');
    form.appendChild(fastNote);

    /* ----- PHẦN 2: Chỉ số sức khỏe ----- */
    form.appendChild(sectionHeader('2. Chỉ số sức khỏe', 'Nhập các chỉ số đo được gần nhất'));

    const grid1 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
    grid1.appendChild(inputField('age', 'Tuổi', 'number', '60', 'min="0" max="120"'));
    grid1.appendChild(selectField('gender', 'Giới tính', [
      { v: '', l: '-- Chọn --' },
      { v: 'male', l: 'Nam' },
      { v: 'female', l: 'Nữ' },
      { v: 'other', l: 'Khác' },
    ]));
    grid1.appendChild(inputField('weight_kg', 'Cân nặng (kg)', 'number', '60', 'step="0.1" min="0" max="300"'));
    grid1.appendChild(inputField('height_cm', 'Chiều cao (cm)', 'number', '165', 'step="0.1" min="50" max="250"'));
    form.appendChild(grid1);

    const grid2 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px' });
    grid2.appendChild(inputField('bp_systolic', 'Huyết áp tâm thu (mmHg)', 'number', '120', 'min="50" max="300"'));
    grid2.appendChild(inputField('bp_diastolic', 'Huyết áp tâm trương (mmHg)', 'number', '80', 'min="30" max="200"'));
    grid2.appendChild(inputField('heart_rate', 'Nhịp tim (bpm)', 'number', '75', 'min="20" max="250"'));
    grid2.appendChild(inputField('blood_sugar', 'Đường huyết (mmol/L)', 'number', '5.5', 'step="0.1" min="0" max="50"'));
    form.appendChild(grid2);

    const grid3 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px' });
    grid3.appendChild(checkboxField('smoker', 'Đang hút thuốc lá'));
    grid3.appendChild(checkboxField('family_history', 'Tiền sử gia đình có đột quỵ'));
    form.appendChild(grid3);

    /* ----- PHẦN 3: Triệu chứng ----- */
    form.appendChild(sectionHeader('3. Triệu chứng hiện có', 'Tích chọn nếu đang gặp'));

    const symGrid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px' });
    SYMPTOMS_LIST.forEach(s => {
      const lbl = el('label', {
        style: 'display:flex;gap:8px;align-items:center;padding:10px 12px;background:var(--bg-3);border:1px solid var(--line);border-radius:10px;cursor:pointer;font-size:13px;transition:all .2s'
      });
      const cb = el('input', { type: 'checkbox', name: 'symptom', value: s.id });
      lbl.appendChild(cb);
      lbl.appendChild(el('span', { text: s.label }));
      lbl.addEventListener('mouseenter', () => lbl.style.borderColor = 'var(--primary)');
      lbl.addEventListener('mouseleave', () => lbl.style.borderColor = 'var(--line)');
      symGrid.appendChild(lbl);
    });
    form.appendChild(symGrid);

    /* ----- PHẦN 4: Ghi chú ----- */
    form.appendChild(sectionHeader('4. Ghi chú', 'Thông tin thêm (không bắt buộc)'));
    const notes = el('textarea', { class: 'textarea', name: 'notes', placeholder: 'VD: Bệnh nhân có tiền sử cao huyết áp...' });
    notes.style.marginBottom = '18px';
    form.appendChild(notes);

    /* ----- Nút gửi ----- */
    const actions = el('div', { style: 'display:flex;gap:10px;margin-top:6px' });
    actions.appendChild(el('button', {
      type: 'submit', class: 'btn btn--primary btn--block',
      html: '🔍 Phân tích nguy cơ'
    }));
    actions.appendChild(el('button', {
      type: 'button', class: 'btn btn--ghost', id: 'resetForm',
      html: '🔄 Xóa'
    }));
    form.appendChild(actions);

    card.appendChild(form);
    return card;
  }

  function sectionHeader(num, sub) {
    return el('div', { style: 'margin:20px 0 12px 0;padding-bottom:8px;border-bottom:1px solid var(--line)' }, [
      el('div', { style: 'font-size:14px;font-weight:700;color:var(--text)' }, num),
      el('div', { style: 'font-size:11.5px;color:var(--muted);margin-top:2px' }, sub),
    ]);
  }

  function fastRow(name, title, desc) {
    const wrap = el('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;background:var(--bg-3);border:1px solid var(--line);border-radius:10px;margin-bottom:10px'
    });
    wrap.appendChild(el('div', {}, [
      el('div', { style: 'font-size:13px;font-weight:600;color:var(--text)' }, title),
      el('div', { style: 'font-size:11.5px;color:var(--muted);margin-top:2px' }, desc),
    ]));
    const sw = el('label', { class: 'switch' });
    const cb = el('input', { type: 'checkbox', name });
    sw.appendChild(cb);
    sw.appendChild(el('span', { class: 'switch__track' }));
    wrap.appendChild(sw);
    return wrap;
  }

  function inputField(name, label, type, placeholder, extra = '') {
    const field = el('div', { class: 'field', style: 'margin-bottom:0' });
    field.appendChild(el('label', { class: 'field__label', text: label }));
    const attrs = { class: 'input', type, name, placeholder };
    extra.split(' ').forEach(part => {
      const [k, v] = part.split('=');
      if (k && v) attrs[k] = v.replace(/"/g, '');
    });
    field.appendChild(el('input', attrs));
    return field;
  }

  function selectField(name, label, options) {
    const field = el('div', { class: 'field', style: 'margin-bottom:0' });
    field.appendChild(el('label', { class: 'field__label', text: label }));
    const sel = el('select', { class: 'select', name });
    options.forEach(o => sel.appendChild(el('option', { value: o.v }, o.l)));
    field.appendChild(sel);
    return field;
  }

  function checkboxField(name, label) {
    const lbl = el('label', {
      style: 'display:flex;gap:10px;align-items:center;padding:12px 14px;background:var(--bg-3);border:1px solid var(--line);border-radius:10px;cursor:pointer;font-size:13px;font-weight:500'
    });
    lbl.appendChild(el('input', { type: 'checkbox', name }));
    lbl.appendChild(el('span', { text: label }));
    return lbl;
  }

  /* ============================================================
     RESULT
     ============================================================ */
  function resultCard() {
    const card = el('div', { class: 'card', id: 'resultCard' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Kết quả đánh giá'
      ])
    ]));
    card.appendChild(el('div', { class: 'empty', id: 'resultEmpty' }, [
      el('div', { class: 'empty__icon', text: '🔍' }),
      el('div', { class: 'empty__title', text: 'Chưa có kết quả' }),
      el('div', { class: 'empty__desc', text: 'Điền phiếu bên trái và nhấn "Phân tích nguy cơ".' })
    ]));
    card.appendChild(el('div', { id: 'resultBody', style: 'display:none' }));
    return card;
  }

  function renderResult(record) {
    const empty = document.getElementById('resultEmpty');
    const body = document.getElementById('resultBody');
    if (!empty || !body) return;

    empty.style.display = 'none';
    body.style.display = 'block';
    body.innerHTML = '';

    const level = record.risk_level || 'low';
    const score = record.risk_score || 0;

    const conf = {
      low:      { label: 'THẤP',       color: 'ok',     desc: 'Nguy cơ đột quỵ thấp. Duy trì lối sống lành mạnh.' },
      medium:   { label: 'TRUNG BÌNH', color: 'warn',   desc: 'Cần theo dõi huyết áp và tầm soát định kỳ.' },
      high:     { label: 'CAO',        color: 'danger', desc: 'Nguy cơ cao. Nên thăm khám bác sĩ chuyên khoa sớm.' },
      critical: { label: 'KHẨN CẤP',   color: 'danger', desc: 'Có dấu hiệu FAST — GỌI 115 NGAY!' },
    }[level] || { label: 'KHÔNG XÁC ĐỊNH', color: 'muted', desc: '' };

    // Header với điểm
    const head = el('div', {
      style: `padding:20px;border-radius:14px;background:linear-gradient(135deg, var(--${conf.color}-soft), transparent);border:1px solid var(--${conf.color}-line, var(--line));margin-bottom:16px`
    });
    head.appendChild(el('div', { style: 'font-size:11px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase' }, 'Mức độ nguy cơ'));
    head.appendChild(el('div', { style: `font-size:32px;font-weight:800;color:var(--${conf.color});margin:6px 0;letter-spacing:-1px` }, conf.label));
    head.appendChild(el('div', { style: 'font-size:13px;color:var(--text-dim);line-height:1.5' }, conf.desc));
    body.appendChild(head);

    // Điểm số
    const scoreBox = el('div', { style: 'margin-bottom:16px' });
    scoreBox.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px'
    }, [
      el('span', {}, 'Điểm nguy cơ'),
      el('span', { style: 'font-weight:700;color:var(--text)' }, `${score} / 100`)
    ]));
    const bar = el('div', { class: 'progress' });
    bar.appendChild(el('div', {
      class: `progress__fill is-${conf.color === 'muted' ? 'ok' : conf.color}`,
      style: `width:${score}%`
    }));
    scoreBox.appendChild(bar);
    body.appendChild(scoreBox);

    // Chi tiết
    const detail = el('div', { style: 'padding:14px;background:var(--bg-3);border-radius:12px;font-size:12.5px;color:var(--text-dim);line-height:1.7' });
    detail.appendChild(el('div', {}, [
      el('b', { style: 'color:var(--text)' }, 'FAST: '),
      `${[record.fast_face, record.fast_arm, record.fast_speech].filter(Boolean).length} / 3 dấu hiệu`
    ]));
    if (record.bmi) detail.appendChild(el('div', {}, [el('b', { style: 'color:var(--text)' }, 'BMI: '), `${record.bmi}`]));
    if (record.bp_systolic) detail.appendChild(el('div', {}, [el('b', { style: 'color:var(--text)' }, 'Huyết áp: '), `${record.bp_systolic}/${record.bp_diastolic} mmHg`]));
    if (record.symptoms && record.symptoms.length) {
      detail.appendChild(el('div', { style: 'margin-top:6px' }, [
        el('b', { style: 'color:var(--text)' }, 'Triệu chứng: '),
        record.symptoms.length + ' mục'
      ]));
    }
    body.appendChild(detail);

    // Nút xử lý
    const actions = el('div', { style: 'display:flex;gap:10px;margin-top:16px' });
    if (level === 'critical' || level === 'high') {
      actions.appendChild(el('button', {
        class: 'btn btn--danger btn--block',
        onclick: () => notify.toast({ title: 'Đã đánh dấu khẩn cấp', message: 'Vui lòng gọi 115 ngay!', type: 'danger', duration: 8000 })
      }, '🚨 Gọi 115 ngay'));
    } else {
      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => notify.toast({ title: 'Đã ghi nhận', message: 'Kết quả đã lưu vào lịch sử.', type: 'ok' })
      }, '✅ Đã hiểu'));
    }
    body.appendChild(actions);
  }

  /* ============================================================
     HISTORY
     ============================================================ */
  function historyCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('clock') }),
        'Lịch sử sàng lọc'
      ]),
      el('button', {
        class: 'btn btn--flat btn--sm',
        onclick: loadHistory,
        html: icon('refresh')
      })
    ]));
    card.appendChild(el('div', { id: 'screeningHistory' }, [
      el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '📭' }),
        el('div', { class: 'empty__title', text: 'Đang tải...' })
      ])
    ]));
    return card;
  }

  async function loadHistory() {
    const container = document.getElementById('screeningHistory');
    if (!container) return;

    try {
      const r = await fetch(VC.api.url('/api/health-check?limit=10'));
      const { items } = await r.json();

      if (!items || !items.length) {
        container.innerHTML = '';
        container.appendChild(el('div', { class: 'empty' }, [
          el('div', { class: 'empty__icon', text: '📭' }),
          el('div', { class: 'empty__title', text: 'Chưa có bản ghi nào' }),
          el('div', { class: 'empty__desc', text: 'Các phiếu sàng lọc sẽ hiện ở đây.' })
        ]));
        return;
      }

      const table = el('table', { class: 'table' });
      table.innerHTML = `
        <thead>
          <tr><th>ID</th><th>Thời gian</th><th>Nguy cơ</th><th>FAST</th><th></th></tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td><span class="kbd">${escape(it.id)}</span></td>
              <td class="table__mono">${escape(fmtDateTime(new Date(it.ts)))}</td>
              <td><span class="pill pill--${levelPill(it.risk_level)}">${escape(levelLabel(it.risk_level))}</span></td>
              <td class="table__mono">${[it.fast_face, it.fast_arm, it.fast_speech].filter(Boolean).length}/3</td>
              <td><button class="btn btn--flat btn--sm" data-view="${escape(it.id)}">Xem</button></td>
            </tr>
          `).join('')}
        </tbody>`;
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'table-wrap' }, [table]));

      container.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          const rec = items.find(x => x.id === btn.dataset.view);
          if (rec) {
            renderResult(rec);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      });
    } catch (e) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', text: '⚠️' }),
        el('div', { class: 'empty__title', text: 'Không tải được lịch sử' }),
        el('div', { class: 'empty__desc', text: e.message })
      ]));
    }
  }

  function levelPill(l) {
    return { low: 'ok', medium: 'warn', high: 'danger', critical: 'danger' }[l] || 'muted';
  }
  function levelLabel(l) {
    return { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'KHẨN CẤP' }[l] || '—';
  }

  /* ============================================================
     BIND
     ============================================================ */
  function bindForm(root) {
    const form = document.getElementById('screeningForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);

      const symptoms = Array.from(form.querySelectorAll('input[name="symptom"]:checked'))
        .map(cb => cb.value);

      const payload = {
        age: parseInt(fd.get('age')) || null,
        gender: fd.get('gender') || null,
        weight_kg: parseFloat(fd.get('weight_kg')) || null,
        height_cm: parseFloat(fd.get('height_cm')) || null,
        bp_systolic: parseInt(fd.get('bp_systolic')) || null,
        bp_diastolic: parseInt(fd.get('bp_diastolic')) || null,
        heart_rate: parseInt(fd.get('heart_rate')) || null,
        blood_sugar: parseFloat(fd.get('blood_sugar')) || null,
        smoker: fd.get('smoker') === 'on',
        family_history: fd.get('family_history') === 'on',
        fast_face: fd.get('fast_face') === 'on',
        fast_arm: fd.get('fast_arm') === 'on',
        fast_speech: fd.get('fast_speech') === 'on',
        symptoms,
        notes: fd.get('notes') || '',
      };

      // Validate tối thiểu
      if (!payload.age && !payload.fast_face && !payload.fast_arm && !payload.fast_speech && symptoms.length === 0) {
        notify.toast({ title: 'Thiếu thông tin', message: 'Vui lòng nhập ít nhất tuổi hoặc triệu chứng.', type: 'warn' });
        return;
      }

      try {
        const r = await fetch(VC.api.url('/api/health-check'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error('Lỗi server: ' + r.status);
        const record = await r.json();

        renderResult(record);
        notify.toast({
          title: record.risk_level === 'critical' ? '🚨 KHẨN CẤP' : 'Đã phân tích',
          message: `Mức độ: ${levelLabel(record.risk_level)} · Điểm: ${record.risk_score}`,
          type: record.risk_level === 'critical' ? 'danger' : 'ok',
          duration: 6000,
        });

        if (record.risk_level === 'critical' || record.risk_level === 'high') {
          VC.notify.alarm('alert');
        }

        loadHistory();
      } catch (err) {
        notify.toast({ title: 'Lỗi', message: err.message, type: 'danger' });
      }
    });

    const resetBtn = document.getElementById('resetForm');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        form.reset();
        const body = document.getElementById('resultBody');
        const empty = document.getElementById('resultEmpty');
        if (body) body.style.display = 'none';
        if (empty) empty.style.display = 'flex';
      });
    }
  }

  VC.views = VC.views || {};
  VC.views.screening = renderScreening;
})(window.VC);