(function (VC) {
  'use strict';

  const { utils, store, notify, STORAGE } = VC;
  const { $, $$, el, icon } = utils;

  const ONBOARDING_SLIDES = [
    {
      badge: 'Bước 1 / 5',
      icon: '🌊',
      title: 'Hệ thống Cảnh báo An toàn Hồ Đá — ĐHQG TP.HCM',
      subtitle: 'Ứng dụng Thị giác máy tính (Computer Vision) và Camera AI giám sát an toàn bờ hồ 24/7.',
      features: [
        {
          icon: '🎯',
          title: 'Nhận diện trượt ngã & vượt rào sát mép đá',
          desc: 'Mô hình YOLOv8x-Pose phân tích 17 điểm khớp xương theo thời gian thực để phát hiện người trượt ngã hoặc đứng chênh vênh sát vách đá.'
        },
        {
          icon: '🚧',
          title: 'Khoanh vùng cấm đa giác (Geofencing)',
          desc: 'Thiết lập hàng rào ảo dọc các mỏm đá tử thần, vách đá dựng đứng và khu vực nước sâu tại cụm Hồ Đá ĐHQG-HCM.'
        },
        {
          icon: '🚨',
          title: 'Báo động tức thời tới Chốt Bảo vệ ĐHQG',
          desc: 'Kích hoạt còi báo động tại trạm, gửi ảnh hiện trường qua Email và hỗ trợ gọi nhanh Đội tuần tra ĐHQG / Cứu hộ 115.'
        },
        {
          icon: '👑',
          title: 'Thương mại hóa & Mở rộng đa lĩnh vực',
          desc: 'Cùng lõi công nghệ AI có thể triển khai cho Trường mầm non tư thục (Gói Pro 10.000đ) và Viện dưỡng lão / Đô thị (Gói Business 599.000đ).'
        }
      ],
      tip: 'Giao diện Trung tâm Điều hành được bố trí gọn gàng trên thanh ngang phía trên để dễ dàng quan sát toàn cảnh Hồ Đá.'
    },
    {
      badge: 'Bước 2 / 5',
      icon: '📹',
      title: 'Kết nối Trạm Camera AI & Nguồn Thu hình',
      subtitle: 'Hỗ trợ luồng Camera AI từ máy chủ hoặc kết nối trực tiếp Webcam thiết bị để kiểm thử thực tế.',
      features: [
        {
          icon: '🎥',
          title: 'Nút "Kết nối Camera Thực tế"',
          desc: 'Tại khung Trạm AI, nhấn nút này để truyền hình ảnh trực tiếp từ camera thiết bị vào bộ xử lý YOLOv8x-Pose.'
        },
        {
          icon: '🪨',
          title: '6 Trạm Camera Vành đai Hồ Đá',
          desc: 'Chuyển đổi nhanh giữa Bờ Bắc (Vách đá dựng đứng), Bờ Đông (Đ. Nguyễn Du), Mỏm đá Tử thần (Bờ Tây), Khu A, Viện CNSH và Tuyến Ống Nước Thô.'
        },
        {
          icon: '🌐',
          title: 'Truyền dữ liệu WebSocket độ trễ thấp',
          desc: 'Khung xương 17 khớp và nhãn cảnh báo được vẽ trực tiếp lên luồng video theo thời gian thực.'
        },
        {
          icon: '🔌',
          title: 'Tạm ngắt nhanh trên Thanh điều khiển',
          desc: 'Biểu tượng máy quay trên góc phải thanh tiêu đề giúp bật/tắt nhanh luồng thu hình AI.'
        }
      ],
      tip: 'Khi chưa bật webcam vật lý, hệ thống hiển thị bản đồ trực quan khu vực vách đá & vùng cấm bờ Hồ Đá.'
    },
    {
      badge: 'Bước 3 / 5',
      icon: '🛡️',
      title: 'Khoanh Vùng Cấm Bờ Hồ Đá (Geofencing)',
      subtitle: 'Tạo hàng rào điện tử bảo vệ các đoạn bờ vực đá nguy hiểm quanh hồ.',
      features: [
        {
          icon: '✏️',
          title: 'Vẽ đa giác trực tiếp trên khung hình',
          desc: 'Mở tab "Vùng cấm Bờ hồ", nhấn "Vẽ vùng cấm bờ hồ mới" và chấm các đỉnh dọc mép vực đá.'
        },
        {
          icon: '⏱️',
          title: 'Kiểm soát thời gian đứng sát mép vực',
          desc: 'Tự động nâng cấp cảnh báo từ Nhắc nhở sang Báo động đỏ nếu phát hiện người đứng lâu sát vách đá.'
        },
        {
          icon: '🎨',
          title: 'Phân cấp mức độ nguy hiểm',
          desc: 'Hỗ trợ 4 cấp độ từ Vành đai ngoài (Low) đến Tử địa vách đá / nước sâu (Critical).'
        },
        {
          icon: '💾',
          title: 'Đồng bộ thời gian thực với AI Backend',
          desc: 'Vùng cấm vừa lưu sẽ lập tức áp dụng cho bộ nhận diện YOLOv8x-Pose và hiển thị trên Bản đồ 3D.'
        }
      ],
      tip: 'Click chuột phải khi đang vẽ từ 3 điểm trở lên để khép nhanh đa giác vùng cấm.'
    },
    {
      badge: 'Bước 4 / 5',
      icon: '🗺️',
      title: 'Bản đồ 3D Địa hình Hồ Đá & Radar Vành đai',
      subtitle: 'Quan sát trực quan địa hình Làng Đại học ĐHQG TP.HCM và định vị tín hiệu ven hồ.',
      features: [
        {
          icon: '🌊',
          title: 'Mô hình 3D Hồ Đá ĐHQG-HCM',
          desc: 'Tái hiện lòng hồ, vách đá, đường Nguyễn Du, đường Marie Curie, Nhà khách ĐHQG và Viện CNSH.'
        },
        {
          icon: '🧭',
          title: 'Chuyển nhanh góc nhìn 3D',
          desc: 'Sử dụng bảng điều khiển bên trái để bay nhanh tới Bờ Bắc, Bờ Đông hoặc xoay tự do bằng chuột.'
        },
        {
          icon: '📡',
          title: 'Radar 2D Quét Tín hiệu Bờ Hồ',
          desc: 'Ước lượng khoảng cách thiết bị quanh lòng Hồ Đá dựa trên suy hao tín hiệu RSSI trong bán kính 100m.'
        },
        {
          icon: '🚨',
          title: 'Cảnh báo thiết bị đi vào vùng < 11m',
          desc: 'Đánh dấu đỏ các tín hiệu nằm quá sát mép vách đá dựng đứng.'
        }
      ],
      tip: 'Mở tab "Bản đồ 3D Hồ Đá" hoặc "Radar Quét Bờ hồ" trên thanh điều hướng ngang để trải nghiệm.'
    },
    {
      badge: 'Bước 5 / 5',
      icon: '👑',
      title: 'Thương mại hóa, VietQR & Quản trị Doanh thu',
      subtitle: 'Mô hình kinh doanh bền vững từ dự án Hồ Đá ĐHQG-HCM sang đa lĩnh vực.',
      features: [
        {
          icon: '🏫',
          title: 'Gói Pro (10.000đ) — Trường Mầm non & Cụm Bờ Hồ',
          desc: 'Mở khóa 4 trạm camera, xuất báo cáo CSV và gọi khẩn cấp — ứng dụng cho cả Hồ Đá và Trường mầm non tư thục.'
        },
        {
          icon: '🏛️',
          title: 'Gói Business (599.000đ) — Đô thị & Viện Dưỡng lão',
          desc: 'Mở khóa không giới hạn camera cho toàn khu đô thị ĐHQG, Viện dưỡng lão hoặc khu du lịch sinh thái.'
        },
        {
          icon: '💳',
          title: 'Thanh toán VietQR MB Bank tự động',
          desc: 'Sinh mã QR động chính xác tới TK MB Bank 687269944224 (VO THI NGOC TRAM) kèm nút duyệt nhanh 1 chạm khi thuyết trình.'
        },
        {
          icon: '💰',
          title: 'Trang Quản trị & Doanh thu',
          desc: 'Thống kê doanh thu, quản lý đơn hàng và phát hành mã License Key.'
        }
      ],
      tip: 'Nhấn phím ? bất cứ lúc nào để mở lại Cẩm nang vận hành này.'
    }
  ];

  let currentSlide = 0;
  let onboardingContainer = null;

  function showOnboarding(options = {}) {
    const { startStep = 0 } = options;
    currentSlide = Math.max(0, Math.min(startStep, ONBOARDING_SLIDES.length - 1));

    if (onboardingContainer) {
      onboardingContainer.remove();
      onboardingContainer = null;
    }

    const modal = el('div', { class: 'onboarding-modal', id: 'onboardingModal' });
    const backdrop = el('div', { class: 'onboarding-backdrop', onclick: closeOnboarding });
    const card = el('div', { class: 'onboarding-card' });

    const head = el('div', { class: 'onboarding-header' }, [
      el('div', { class: 'onboarding-brand' }, [
        el('span', { class: 'onboarding-brand__badge', id: 'onboardingBadge' }, ONBOARDING_SLIDES[currentSlide].badge),
        el('span', { class: 'onboarding-brand__title' }, 'Cẩm nang Hệ thống Cảnh báo An toàn Hồ Đá — ĐHQG-HCM')
      ]),
      el('button', {
        class: 'icon-btn',
        title: 'Đóng (Esc)',
        html: icon('x'),
        onclick: closeOnboarding
      })
    ]);

    const body = el('div', { class: 'onboarding-body', id: 'onboardingBody' });
    const foot = el('div', { class: 'onboarding-footer' });
    const dotsContainer = el('div', { class: 'onboarding-dots', id: 'onboardingDots' });
    const actions = el('div', { class: 'onboarding-actions', id: 'onboardingActions' });

    foot.appendChild(dotsContainer);
    foot.appendChild(actions);

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);

    modal.appendChild(backdrop);
    modal.appendChild(card);

    document.body.appendChild(modal);
    onboardingContainer = modal;

    renderSlide(currentSlide);

    function onKeyDown(e) {
      if (e.key === 'Escape') closeOnboarding();
      else if (e.key === 'ArrowRight' && currentSlide < ONBOARDING_SLIDES.length - 1) {
        currentSlide++;
        renderSlide(currentSlide);
      } else if (e.key === 'ArrowLeft' && currentSlide > 0) {
        currentSlide--;
        renderSlide(currentSlide);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    modal._cleanup = () => document.removeEventListener('keydown', onKeyDown);
  }

  function renderSlide(index) {
    const slide = ONBOARDING_SLIDES[index];
    const body = $('#onboardingBody');
    const badge = $('#onboardingBadge');
    const dots = $('#onboardingDots');
    const actions = $('#onboardingActions');

    if (!body || !slide) return;
    badge.textContent = slide.badge;
    body.innerHTML = '';

    const slideEl = el('div', { class: 'onboarding-slide' });
    const hero = el('div', { class: 'onboarding-hero' }, [
      el('div', { class: 'onboarding-hero__icon', text: slide.icon }),
      el('div', { class: 'onboarding-hero__text' }, [
        el('h3', { text: slide.title }),
        el('p', { text: slide.subtitle })
      ])
    ]);
    slideEl.appendChild(hero);

    const grid = el('div', { class: 'onboarding-features' });
    slide.features.forEach(f => {
      grid.appendChild(el('div', { class: 'onboarding-feature-item' }, [
        el('div', { class: 'onboarding-feature-item__icon', text: f.icon }),
        el('div', { class: 'onboarding-feature-item__text' }, [
          el('h4', { text: f.title }),
          el('p', { text: f.desc })
        ])
      ]));
    });
    slideEl.appendChild(grid);

    if (slide.tip) {
      slideEl.appendChild(el('div', { class: 'onboarding-tip' }, [
        el('span', {}, '💡'),
        el('div', { html: `<strong>Ghi chú:</strong> ${slide.tip}` })
      ]));
    }

    body.appendChild(slideEl);

    dots.innerHTML = '';
    ONBOARDING_SLIDES.forEach((_, idx) => {
      dots.appendChild(el('div', {
        class: `onboarding-dot ${idx === index ? 'is-active' : ''}`,
        onclick: () => { currentSlide = idx; renderSlide(currentSlide); }
      }));
    });

    actions.innerHTML = '';
    if (index > 0) {
      actions.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '← Quay lại',
        onclick: () => { currentSlide--; renderSlide(currentSlide); }
      }));
    } else {
      actions.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        text: 'Đóng',
        onclick: closeOnboarding
      }));
    }

    if (index < ONBOARDING_SLIDES.length - 1) {
      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--sm',
        text: 'Tiếp theo →',
        onclick: () => { currentSlide++; renderSlide(currentSlide); }
      }));
    } else {
      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--sm',
        text: '✓ Hoàn tất',
        onclick: closeOnboarding
      }));
    }
  }

  function closeOnboarding() {
    utils.storage.set(STORAGE.guideSeen, true);
    if (onboardingContainer) {
      if (onboardingContainer._cleanup) onboardingContainer._cleanup();
      onboardingContainer.remove();
      onboardingContainer = null;
    }
  }

  const SPOTLIGHT_STEPS = [
    {
      target: '#sidebar',
      title: '1. Thanh Điều hướng Trung tâm Chỉ huy',
      desc: 'Chuyển đổi nhanh giữa Trung tâm Điều hành, 6 Camera Bờ hồ, Vùng cấm Bờ hồ, Bản đồ 3D Hồ Đá, Radar Quét Bờ hồ, Nhật ký Sự cố và Thương mại hóa.',
      placement: 'bottom'
    },
    {
      target: '.kpi-strip',
      title: '2. Dải Chỉ số An toàn Bờ Hồ Đá',
      desc: 'Theo dõi tức thời mức độ an toàn bờ hồ, tổng sự cố hôm nay, số trạm camera đang hoạt động và gói bản quyền.',
      placement: 'bottom'
    },
    {
      target: '#overviewRightCol',
      title: '3. Cột Trực ban & Điều phối Ứng cứu',
      desc: 'Hiển thị sự cố mới nhất kèm nút gọi Đội Bảo vệ ĐHQG / 115 và danh sách nhật ký vừa ghi nhận.',
      placement: 'right'
    },
    {
      target: '.camera-picker',
      fallbackTarget: '.card:has(.video)',
      title: '4. Khung Trạm Camera AI & 6 Trạm Vành đai',
      desc: 'Quan sát luồng YOLOv8x-Pose thời gian thực và chuyển đổi giữa 6 trạm xung quanh Hồ Đá ĐHQG-HCM.',
      placement: 'left'
    }
  ];

  let spotlightOverlay = null;

  function startSpotlightTour() {
    if (store.state.view !== 'overview') VC.app.go('overview');
    renderSpotlightStep(0);
  }

  function renderSpotlightStep(index) {
    if (spotlightOverlay) {
      spotlightOverlay.remove();
      spotlightOverlay = null;
    }
    if (index >= SPOTLIGHT_STEPS.length) {
      notify.toast({ title: 'Đã hoàn tất hướng dẫn giao diện!', type: 'ok', duration: 3000 });
      return;
    }
    const step = SPOTLIGHT_STEPS[index];
    let targetEl = document.querySelector(step.target) || (step.fallbackTarget && document.querySelector(step.fallbackTarget));
    if (!targetEl) {
      renderSpotlightStep(index + 1);
      return;
    }
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const overlay = el('div', { class: 'spotlight-overlay', id: 'spotlightOverlay' });
    overlay.appendChild(el('div', { class: 'spotlight-mask', onclick: closeSpotlight }));

    const rect = targetEl.getBoundingClientRect();
    overlay.appendChild(el('div', {
      class: 'spotlight-target-highlight',
      style: `top:${Math.max(4, rect.top - 6)}px;left:${Math.max(4, rect.left - 6)}px;width:${rect.width + 12}px;height:${rect.height + 12}px;`
    }));

    const popover = el('div', { class: 'spotlight-popover' }, [
      el('div', { class: 'spotlight-popover__step' }, `BƯỚC ${index + 1} / ${SPOTLIGHT_STEPS.length}`),
      el('div', { class: 'spotlight-popover__title', text: step.title }),
      el('div', { class: 'spotlight-popover__desc', text: step.desc }),
      el('div', { class: 'spotlight-popover__foot' }, [
        el('button', { class: 'btn btn--ghost btn--sm', text: 'Đóng', onclick: closeSpotlight }),
        el('button', {
          class: 'btn btn--primary btn--sm',
          text: index < SPOTLIGHT_STEPS.length - 1 ? 'Tiếp tục →' : '✓ Xong',
          onclick: () => renderSpotlightStep(index + 1)
        })
      ])
    ]);
    overlay.appendChild(popover);
    document.body.appendChild(overlay);
    spotlightOverlay = overlay;
    positionPopover(popover, rect, step.placement);
  }

  function positionPopover(popover, targetRect, placement) {
    const popoverRect = popover.getBoundingClientRect();
    const margin = 14;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let top = targetRect.bottom + margin;
    let left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
    if (placement === 'right') {
      top = targetRect.top;
      left = targetRect.right + margin;
    } else if (placement === 'left') {
      top = targetRect.top;
      left = targetRect.left - popoverRect.width - margin;
    }
    if (left + popoverRect.width > winW - 16) left = winW - popoverRect.width - 16;
    if (left < 16) left = 16;
    if (top + popoverRect.height > winH - 16) top = winH - popoverRect.height - 16;
    if (top < 16) top = 16;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function closeSpotlight() {
    if (spotlightOverlay) {
      spotlightOverlay.remove();
      spotlightOverlay = null;
    }
  }

  function renderQuickStartBanner() {
    // Keep Overview clean and uncluttered
    return null;
  }

  function showHelpCenter(initialTab = 'start') {
    let activeTab = initialTab;
    const tabs = [
      { id: 'start', label: '🌊 Tổng quan Dự án Hồ Đá' },
      { id: 'features', label: '📖 Các Phân hệ AI' },
      { id: 'shortcuts', label: '⌨️ Phím tắt' }
    ];

    const contentBox = el('div', { class: 'help-content-pane', id: 'helpContentPane' });
    const tabsNav = el('div', { class: 'help-modal-tabs' });
    tabs.forEach(t => {
      tabsNav.appendChild(el('div', {
        class: `help-tab-btn ${t.id === activeTab ? 'is-active' : ''}`,
        text: t.label,
        onclick: (e) => {
          $$('.help-tab-btn').forEach(b => b.classList.remove('is-active'));
          e.currentTarget.classList.add('is-active');
          activeTab = t.id;
          renderTabContent(activeTab, contentBox);
        }
      }));
    });

    const wrap = el('div', {}, [tabsNav, contentBox]);
    renderTabContent(activeTab, contentBox);

    notify.modal({
      title: 'Cẩm nang Vận hành Hệ thống Cảnh báo An toàn Hồ Đá — ĐHQG TP.HCM',
      body: wrap,
      width: 660,
      actions: [{ label: 'Đóng', class: 'btn--ghost' }]
    });
  }

  function renderTabContent(tabId, root) {
    root.innerHTML = '';
    if (tabId === 'start') {
      root.appendChild(el('div', { class: 'help-section-card' }, [
        el('h4', {}, '🌊 Dự án Hệ Thống Cảnh Báo An Toàn Hồ Đá — Ứng dụng Thị giác máy tính & Camera AI'),
        el('p', { style: 'margin-bottom:12px' }, 'Hệ thống giám sát 6 trạm xung quanh khu vực Hồ Đá (Khu đô thị ĐHQG TP.HCM), tự động phát hiện hành vi vượt rào vào vách đá dựng đứng hoặc trượt ngã sát mép nước.'),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
          el('button', {
            class: 'btn btn--primary btn--sm',
            text: '🚀 Xem Slide Giới thiệu 5 Bước',
            onclick: () => {
              const modalRoot = $('#modal-root');
              if (modalRoot) { modalRoot.classList.remove('is-open'); modalRoot.innerHTML = ''; }
              showOnboarding({ startStep: 0 });
            }
          }),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            text: '🎯 Hướng dẫn Trực quan Trên Giao diện',
            onclick: () => {
              const modalRoot = $('#modal-root');
              if (modalRoot) { modalRoot.classList.remove('is-open'); modalRoot.innerHTML = ''; }
              startSpotlightTour();
            }
          })
        ])
      ]));
    } else if (tabId === 'features') {
      const items = [
        ['📹', 'Trung tâm Điều hành & 6 Trạm Camera Bờ hồ', 'Giám sát trực tiếp Bờ Bắc (Vách đá dựng đứng), Bờ Đông (Đ. Nguyễn Du), Mỏm đá Tử thần (Bờ Tây), Lối mòn Khu A, Viện CNSH và Tuyến Ống Nước Thô.'],
        ['🚧', 'Khoanh vùng cấm đa giác (Geofencing)', 'Vẽ vùng giới hạn dọc mép vực đá để cảnh báo ngay khi có người bước vào hoặc đứng quá lâu.'],
        ['🗺️', 'Bản đồ 3D Địa hình Hồ Đá & Radar 2D', 'Mô phỏng không gian 3D khu vực Hồ Đá Làng Đại học và quét tín hiệu thiết bị trong bán kính 100m.'],
        ['👑', 'Thương mại hóa Đa lĩnh vực (VietQR MB Bank)', 'Mở rộng triển khai cho Trường mầm non tư thục (Pro · 10.000đ) và Viện dưỡng lão / Khu đô thị (Business · 599.000đ).']
      ];
      items.forEach(([ico, title, desc]) => {
        root.appendChild(el('div', { class: 'help-section-card' }, [
          el('h4', {}, `${ico} ${title}`),
          el('p', {}, desc)
        ]));
      });
    } else if (tabId === 'shortcuts') {
      const shortcuts = [
        ['1 – 6', 'Chuyển nhanh giữa các phân hệ trên thanh điều hướng'],
        ['S', 'Bật / Tắt còi báo động khẩn cấp'],
        ['T', 'Chuyển đổi chế độ Sáng / Trực đêm'],
        ['R', 'Làm mới dữ liệu'],
        ['?', 'Mở Cẩm nang vận hành']
      ];
      const table = el('table', { class: 'table' });
      table.innerHTML = `<thead><tr><th>Phím</th><th>Chức năng</th></tr></thead><tbody>${shortcuts.map(([k, d]) => `<tr><td><span class="kbd">${k}</span></td><td>${d}</td></tr>`).join('')}</tbody>`;
      root.appendChild(el('div', { class: 'table-wrap' }, [table]));
    }
  }

  function checkFirstVisit() {
    // Do not auto-open modal on startup so interface stays clean
    utils.storage.set(STORAGE.guideSeen, true);
  }

  VC.guide = {
    showOnboarding,
    startSpotlightTour,
    showHelpCenter,
    renderQuickStartBanner,
    checkFirstVisit,
    ONBOARDING_SLIDES
  };
})(window.VC);
