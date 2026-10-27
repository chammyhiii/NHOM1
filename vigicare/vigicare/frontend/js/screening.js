/* ============================================================
   SafeZone Hồ Đá · ĐHQG-HCM — screening.js
   Đánh giá Nhanh Tình trạng Nạn nhân & Sơ cứu Bờ Hồ Đá
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils, notify } = VC;
  const { el, icon, escape, fmtDateTime } = utils;

  const SYMPTOMS_LIST = [
    { id: 'dizzy',    label: 'Hoảng loạn / Chóng mặt sát mép vực' },
    { id: 'headache', label: 'Chấn thương vùng đầu do trượt đá' },
    { id: 'numb',     label: 'Chuột rút / Tê cứng tay chân dưới nước' },
    { id: 'speech',   label: 'Sặc nước / Khó thở / Không gọi được' },
    { id: 'vision',   label: 'Mờ mắt / Choáng nắng ven hồ' },
    { id: 'balance',  label: 'Mất thăng bằng trên mỏm đá dốc' },
    { id: 'confuse',  label: 'Mất phương hướng / Kiệt sức' },
    { id: 'weakness', label: 'Hạ thân nhiệt do ngâm nước lạnh' },
  ];

  function renderScreening(root) {
    root.innerHTML = '';

    // Reordered layout (.command-deck): Left 380px = Kết quả đánh giá ứng cứu + Nhật ký hồ sơ; Right Main Stage = Phiếu đánh giá tình trạng nạn nhân ven hồ
    const wrap = el('div', { class: 'command-deck' });

    const left = el('div');
    left.appendChild(resultCard());
    left.appendChild(historyCard());
    wrap.appendChild(left);

    const right = el('div');
    right.appendChild(formCard());
    wrap.appendChild(right);

    root.appendChild(wrap);

    bindForm(root);
    loadHistory();
  }

  function formCard() {
    const card = el('div', { class: 'card' });

    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('shield') }),
        'Phiếu Đánh giá Nhanh Nạn nhân & Cấp cứu Hiện trường Hồ Đá ĐHQG-HCM'
      ]),
      el('span', { class: 'badge badge--primary' }, 'SƠ CỨU BỜ HỒ')
    ]));

    const form = el('form', { id: 'screeningForm' });

    form.appendChild(sectionHeader('1. Kiểm tra Phản xạ Sinh tồn Nhanh (ABC / FAST)', 'Đánh giá tức thời ngay khi Đội bảo vệ tiếp cận nạn nhân ven hồ'));

    form.appendChild(fastRow('fast_face', 'Tỉnh táo & Hô hấp', 'Nạn nhân có dấu hiệu tím tái, ngạt nước hoặc bất tỉnh không?'));
    form.appendChild(fastRow('fast_arm', 'Vận động Tay / Chân', 'Nạn nhân có bị gãy xương, trật khớp hoặc chuột rút không thể tự đứng dậy?'));
    form.appendChild(fastRow('fast_speech', 'Khả năng Giao tiếp', 'Nạn nhân có trả lời rõ ràng câu hỏi của Đội tuần tra ĐHQG không?'));

    const fastNote = el('div', {
      style: 'padding:10px 14px;background:var(--warn-soft);border-left:3px solid var(--warn);border-radius:8px;font-size:12.5px;color:var(--text);margin-bottom:18px'
    }, '⚠️ Nếu nạn nhân ngạt nước hoặc chấn thương nặng do trượt vách đá → Gọi Cấp cứu 115 & Đội Cứu hộ ngay lập tức.');
    form.appendChild(fastNote);

    form.appendChild(sectionHeader('2. Chỉ số Sinh hiệu Hiện trường', 'Nhập các thông số đo nhanh tại Chốt Bảo vệ Hồ Đá'));

    const grid1 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
    grid1.appendChild(inputField('age', 'Độ tuổi ước lượng', 'number', '20', 'min="1" max="120"'));
    grid1.appendChild(selectField('gender', 'Giới tính', [
      { v: '', l: '-- Chọn --' },
      { v: 'male', l: 'Nam' },
      { v: 'female', l: 'Nữ' },
      { v: 'other', l: 'Khác' },
    ]));
    grid1.appendChild(inputField('weight_kg', 'Cân nặng ước tính (kg)', 'number', '60', 'step="0.1" min="0" max="300"'));
    grid1.appendChild(inputField('height_cm', 'Chiều cao ước tính (cm)', 'number', '168', 'step="0.1" min="50" max="250"'));
    form.appendChild(grid1);

    const grid2 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px' });
    grid2.appendChild(inputField('bp_systolic', 'Huyết áp tâm thu (mmHg)', 'number', '120', 'min="50" max="300"'));
    grid2.appendChild(inputField('bp_diastolic', 'Huyết áp tâm trương (mmHg)', 'number', '80', 'min="30" max="200"'));
    grid2.appendChild(inputField('heart_rate', 'Nhịp mạch (bpm)', 'number', '85', 'min="20" max="250"'));
    grid2.appendChild(inputField('blood_sugar', 'Chỉ số SpO2 / Đường huyết', 'number', '5.5', 'step="0.1" min="0" max="100"'));
    form.appendChild(grid2);

    const grid3 = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px' });
    grid3.appendChild(checkboxField('smoker', 'Rơi xuống khu vực nước sâu'));
    grid3.appendChild(checkboxField('family_history', 'Va đập vào vách đá bờ hồ'));
    form.appendChild(grid3);

    form.appendChild(sectionHeader('3. Dấu hiệu Ghi nhận tại Hiện trường', 'Tích chọn các biểu hiện của nạn nhân'));

    const symGrid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px' });
    SYMPTOMS_LIST.forEach(s => {
      const lbl = el('label', {
        style: 'display:flex;gap:8px;align-items:center;padding:10px 12px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px'
      });
      const cb = el('input', { type: 'checkbox', name: 'symptom', value: s.id });
      lbl.appendChild(cb);
      lbl.appendChild(el('span', { text: s.label }));
      symGrid.appendChild(lbl);
    });
    form.appendChild(symGrid);

    form.appendChild(sectionHeader('4. Vị trí Trạm Camera & Ghi chú Ứng cứu', 'Ghi rõ trạm phát hiện (VD: Bờ Bắc, Mỏm đá Tử thần...)'));
    const notes = el('textarea', { class: 'textarea', name: 'notes', placeholder: 'VD: Phát hiện qua Trạm CAM-01 Bờ Bắc Hồ Đá, Đội bảo vệ đã đưa lên bờ an toàn...' });
    notes.style.marginBottom = '18px';
    form.appendChild(notes);

    const actions = el('div', { style: 'display:flex;gap:10px;margin-top:6px' });
    actions.appendChild(el('button', {
      type: 'submit', class: 'btn btn--primary btn--block',
      html: '🔍 Đánh giá Mức độ Khẩn cấp'
    }));
    actions.appendChild(el('button', {
      type: 'button', class: 'btn btn--ghost', id: 'resetForm',
      html: 'Làm mới'
    }));
    form.appendChild(actions);

    card.appendChild(form);
    return card;
  }

  function sectionHeader(num, sub) {
    return el('div', { style: 'margin:20px 0 12px 0;padding-bottom:8px;border-bottom:1px solid var(--border)' }, [
      el('div', { style: 'font-size:14px;font-weight:700;color:var(--text)' }, num),
      el('div', { style: 'font-size:11.5px;color:var(--muted);margin-top:2px' }, sub),
    ]);
  }

  function fastRow(name, title, desc) {
    const wrap = el('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;margin-bottom:10px'
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
      style: 'display:flex;gap:10px;align-items:center;padding:12px 14px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;font-weight:500'
    });
    lbl.appendChild(el('input', { type: 'checkbox', name }));
    lbl.appendChild(el('span', { text: label }));
    return lbl;
  }

  function resultCard() {
    const card = el('div', { class: 'card', id: 'resultCard' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Phân loại Ưu tiên Cứu hộ Bờ Hồ'
      ])
    ]));
    card.appendChild(el('div', { class: 'empty', id: 'resultEmpty' }, [
      el('div', { class: 'empty__icon', text: '🌊' }),
      el('div', { class: 'empty__title', text: 'Chưa có dữ liệu đánh giá' }),
      el('div', { class: 'empty__desc', text: 'Điền thông tin hiện trường bên phải để phân loại mức độ ứng cứu.' })
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
      low:      { label: 'AN TOÀN / NHẸ', color: 'ok',     desc: 'Nạn nhân tỉnh táo, chỉ xây xát nhẹ. Hướng dẫn rời khỏi khu vực bờ Hồ Đá.' },
      medium:   { label: 'CẦN THEO DÕI',  color: 'warn',   desc: 'Cần đưa về Chốt Bảo vệ ĐHQG nghỉ ngơi và kiểm tra y tế.' },
      high:     { label: 'NGUY HIỂM CAO', color: 'danger', desc: 'Có chấn thương hoặc kiệt sức — cần chuyển tới Trạm Y tế ĐHQG / Bệnh viện.' },
      critical: { label: 'CẤP CỨU ĐỎ',    color: 'danger', desc: 'Nguy kịch tính mạng — GỌI CẤP CỨU 115 & ĐỘI CỨU HỘ NGAY!' },
    }[level] || { label: 'CHƯA XÁC ĐỊNH', color: 'muted', desc: '' };

    const head = el('div', {
      style: `padding:18px;border-radius:12px;background:var(--${conf.color}-soft);border:1px solid var(--border);margin-bottom:14px`
    });
    head.appendChild(el('div', { style: 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase' }, 'Mức độ Ứng cứu Hiện trường'));
    head.appendChild(el('div', { style: `font-size:26px;font-weight:800;color:var(--${conf.color});margin:4px 0` }, conf.label));
    head.appendChild(el('div', { style: 'font-size:12.5px;color:var(--text-dim);line-height:1.5' }, conf.desc));
    body.appendChild(head);

    const scoreBox = el('div', { style: 'margin-bottom:14px' });
    scoreBox.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px'
    }, [
      el('span', {}, 'Chỉ số nguy cấp'),
      el('span', { style: 'font-weight:700;color:var(--text)' }, `${score} / 100`)
    ]));
    const bar = el('div', { class: 'progress' });
    bar.appendChild(el('div', {
      class: `progress__fill is-${conf.color === 'muted' ? 'ok' : conf.color}`,
      style: `width:${score}%`
    }));
    scoreBox.appendChild(bar);
    body.appendChild(scoreBox);

    const actions = el('div', { style: 'display:flex;gap:10px;margin-top:14px' });
    if (level === 'critical' || level === 'high') {
      actions.appendChild(el('a', {
        class: 'btn btn--danger btn--block',
        href: 'tel:115'
      }, '🚨 Gọi Cấp cứu 115 ngay'));
    } else {
      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--block',
        onclick: () => notify.toast({ title: 'Đã lưu hồ sơ hiện trường Hồ Đá', type: 'ok' })
      }, '✅ Đã lưu hồ sơ'));
    }
    body.appendChild(actions);
  }

  function historyCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('clock') }),
        'Nhật ký Sơ cứu Bờ Hồ Đá'
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
          el('div', { class: 'empty__title', text: 'Chưa có hồ sơ sơ cứu nào' })
        ]));
        return;
      }

      const table = el('table', { class: 'table' });
      table.innerHTML = `
        <thead>
          <tr><th>Mã</th><th>Thời điểm</th><th>Mức độ</th><th></th></tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td><span class="kbd">${escape(it.id)}</span></td>
              <td class="table__mono">${escape(fmtDateTime(new Date(it.ts)))}</td>
              <td><span class="pill pill--${levelPill(it.risk_level)}">${escape(levelLabel(it.risk_level))}</span></td>
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
        el('div', { class: 'empty__title', text: 'Không tải được lịch sử' })
      ]));
    }
  }

  function levelPill(l) {
    return { low: 'ok', medium: 'warn', high: 'danger', critical: 'danger' }[l] || 'muted';
  }
  function levelLabel(l) {
    return { low: 'Nhẹ', medium: 'Theo dõi', high: 'Nguy hiểm', critical: 'CẤP CỨU' }[l] || '—';
  }

  function bindForm() {
    const form = document.getElementById('screeningForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const symptoms = Array.from(form.querySelectorAll('input[name="symptom"]:checked')).map(cb => cb.value);

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

      if (!payload.age && !payload.fast_face && !payload.fast_arm && !payload.fast_speech && symptoms.length === 0) {
        notify.toast({ title: 'Thiếu thông tin', message: 'Vui lòng nhập độ tuổi hoặc chọn dấu hiệu hiện trường.', type: 'warn' });
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
          title: record.risk_level === 'critical' ? '🚨 CẤP CỨU BỜ HỒ' : 'Đã đánh giá hiện trường',
          message: `Mức độ: ${levelLabel(record.risk_level)} · Điểm: ${record.risk_score}`,
          type: record.risk_level === 'critical' ? 'danger' : 'ok',
          duration: 5000,
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
