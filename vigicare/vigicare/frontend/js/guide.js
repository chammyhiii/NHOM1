(function (VC) {
  'use strict';

  const { utils, store, notify, STORAGE } = VC;
  const { $, $$, el, icon } = utils;

  const ONBOARDING_SLIDES = [
    {
      badge: 'Bước 1 / 5',
      icon: '🌊',
      title: 'Chào mừng đến với Hệ thống Cảnh báo An toàn Hồ Đá — ĐHQG-HCM',
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
      tip: 'Giao diện được tinh gọn tối đa — bạn chỉ cần rà chuột (hover) vào từng mục hoặc thanh công cụ để xem thông tin chi tiết.'
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
          title: 'Trang Quản trị & Doanh thu (609.000đ)',
          desc: 'Lưu trữ đầy đủ các đơn hàng đã thanh toán thành công, thống kê doanh thu và phát hành mã License Key.'
        }
      ],
      tip: 'Bạn có thể bấm vào nút dấu hỏi (?) trên thanh tiêu đề bất cứ khi nào cần mở lại Hướng dẫn sử dụng.'
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
        el('span', { class: 'onboarding-brand__title' }, 'Hướng dẫn sử dụng Hệ thống Cảnh báo An toàn Hồ Đá')
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
        el('div', { html: `<strong>Mẹo:</strong> ${slide.tip}` })
      ]));
    }

    body.appendChild(slideEl);

    dots.innerHTML = '';
    ONBOARDING_SLIDES.forEach((_, idx) => {
      dots.appendChild(el('div', {
        class: `onboarding-dot ${idx === index ? 'is-active' : ''}`,
        title: `Đến bước ${idx + 1}`,
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
        text: 'Bỏ qua',
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
        class: 'btn btn--ghost btn--sm',
        text: '🎯 Tour giao diện',
        title: 'Khám phá trực quan từng vị trí trên giao diện',
        onclick: () => {
          closeOnboarding();
          setTimeout(() => startSpotlightTour(), 300);
        }
      }));
      actions.appendChild(el('button', {
        class: 'btn btn--primary btn--sm',
        text: '✓ Bắt đầu sử dụng',
        onclick: () => {
          closeOnboarding();
          notify.toast({
            title: 'Chúc bạn trải nghiệm tốt!',
            message: 'Bấm nút (?) trên thanh tiêu đề bất cứ lúc nào để mở lại hướng dẫn.',
            type: 'ok',
            duration: 4000
          });
        }
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
      desc: 'Rà chuột vào các icon để xem tên phân hệ: Trung tâm Điều hành, 6 Camera Bờ hồ, Vùng cấm Bờ hồ, Bản đồ 3D Hồ Đá, Radar Quét Bờ hồ, Nhật ký Sự cố và Quản trị Doanh thu.',
      placement: 'bottom'
    },
    {
      target: '.kpi-strip',
      title: '2. Dải Chỉ số An toàn Bờ Hồ Đá',
      desc: 'Theo dõi tức thời mức độ an toàn bờ hồ, tổng sự cố hôm nay, số trạm camera và gói bản quyền. Rà chuột vào từng ô để xem chú thích chi tiết.',
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
    },
    {
      target: '#topbar .topbar__actions',
      title: '5. Thanh công cụ tiện ích & Hướng dẫn (?)',
      desc: 'Quản lý Doanh thu, Tài khoản, bật/tắt Camera AI, Chuông báo động (S), Giao diện Sáng/Tối (T) và nút Hướng dẫn sử dụng (?) bất kỳ lúc nào.',
      placement: 'bottom'
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
      notify.toast({
        title: 'Hoàn tất chuyến tham quan!',
        message: 'Bạn đã sẵn sàng vận hành Hệ thống Cảnh báo An toàn Hồ Đá.',
        type: 'ok',
        duration: 3500
      });
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

    const foot = el('div', { class: 'spotlight-popover__foot' });
    foot.appendChild(el('button', { class: 'btn btn--ghost btn--sm', text: 'Đóng', onclick: closeSpotlight }));
    const nextGroup = el('div', { style: 'display:flex;gap:6px' });
    if (index > 0) {
      nextGroup.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '← Trước',
        onclick: () => renderSpotlightStep(index - 1)
      }));
    }
    nextGroup.appendChild(el('button', {
      class: 'btn btn--primary btn--sm',
      text: index < SPOTLIGHT_STEPS.length - 1 ? 'Tiếp tục →' : '✓ Hoàn tất',
      onclick: () => renderSpotlightStep(index + 1)
    }));
    foot.appendChild(nextGroup);

    const popover = el('div', { class: 'spotlight-popover' }, [
      el('div', { class: 'spotlight-popover__step' }, `BƯỚC ${index + 1} / ${SPOTLIGHT_STEPS.length}`),
      el('div', { class: 'spotlight-popover__title', text: step.title }),
      el('div', { class: 'spotlight-popover__desc', text: step.desc }),
      foot
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

  /* ============================================================
     3. QUICK START BANNER TRÊN TRANG TỔNG QUAN (KHÔI PHỤC ĐẦY ĐỦ)
     ============================================================ */
  function renderQuickStartBanner() {
    const isDismissed = utils.storage.get(STORAGE.guideBannerDismissed, false);
    if (isDismissed) return null;

    const banner = el('div', { class: 'quickstart-banner' });

    banner.appendChild(el('div', { class: 'quickstart-banner__head' }, [
      el('div', { class: 'quickstart-banner__title' }, [
        el('span', {}, '🚀'),
        'Hướng dẫn sử dụng nhanh (Rà chuột vào từng bước để xem chi tiết)'
      ]),
      el('div', { style: 'display:flex;align-items:center;gap:6px' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm',
          style: 'height:26px;padding:0 8px;font-size:11px',
          text: '🎯 Tour giao diện',
          onclick: () => startSpotlightTour()
        }),
        el('button', {
          class: 'btn btn--primary btn--sm',
          style: 'height:26px;padding:0 8px;font-size:11px',
          text: '📖 Hướng dẫn chi tiết',
          onclick: () => showHelpCenter('start')
        }),
        el('button', {
          class: 'icon-btn',
          style: 'width:26px;height:26px',
          title: 'Ẩn thanh hướng dẫn này',
          html: icon('x'),
          onclick: () => {
            utils.storage.set(STORAGE.guideBannerDismissed, true);
            banner.style.transition = 'all 0.25s ease';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-10px)';
            setTimeout(() => banner.remove(), 260);
          }
        })
      ])
    ]));

    const steps = el('div', { class: 'quickstart-steps' });

    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: async () => {
        const pickerBtn = document.querySelector('.camera-picker button');
        if (pickerBtn) pickerBtn.click();
        else notify.toast({ title: 'Bật Camera', message: 'Bấm nút "🎥 Kết nối Camera Thực tế" ở khung bên phải.', type: 'info' });
      }
    }, [
      el('div', { class: 'quickstart-step__num' }, '1'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Bật Camera AI của bạn'),
        el('p', {}, 'Nhấn để mở webcam và bắt đầu AI nhận diện dáng người 17 khớp xương tại bờ Hồ Đá.')
      ])
    ]));

    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: () => VC.app.go('zones')
    }, [
      el('div', { class: 'quickstart-step__num' }, '2'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Thiết lập Vùng cấm Bờ hồ'),
        el('p', {}, 'Khoanh vùng đa giác dọc vách đá dựng đứng & mép nước sâu để báo động khi có người vượt rào.')
      ])
    ]));

    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: () => VC.app.go('admin')
    }, [
      el('div', { class: 'quickstart-step__num' }, '3'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Xem Đơn hàng & Doanh thu (609.000đ)'),
        el('p', {}, 'Kiểm tra 3 đơn hàng đã thanh toán thành công, mã VietQR MB Bank và quản lý License Key.')
      ])
    ]));

    banner.appendChild(steps);

    banner.appendChild(el('div', { class: 'quickstart-banner__foot' }, [
      el('span', {}, 'Bạn có thể nhấn phím (?) bất kỳ lúc nào để mở Trung tâm Trợ giúp & Hướng dẫn 5 bước.')
    ]));

    return banner;
  }

  /* ============================================================
     4. TRUNG TÂM HƯỚNG DẪN & TRỢ GIÚP (ĐẦY ĐỦ 4 TAB NHƯ CŨ)
     ============================================================ */
  function showHelpCenter(initialTab = 'start') {
    let activeTab = initialTab;
    const tabs = [
      { id: 'start', label: '🚀 Bắt đầu nhanh' },
      { id: 'features', label: '📖 Hướng dẫn tính năng' },
      { id: 'shortcuts', label: '⌨️ Phím tắt' },
      { id: 'faq', label: '❓ FAQ & Sự cố' }
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
      title: 'Trung tâm Hướng dẫn & Trợ giúp — SafeZone Hồ Đá ĐHQG-HCM',
      body: wrap,
      width: 680,
      actions: [{ label: 'Đóng', class: 'btn--ghost' }]
    });
  }

  function renderTabContent(tabId, root) {
    root.innerHTML = '';
    if (tabId === 'start') {
      root.appendChild(el('div', { class: 'help-section-card' }, [
        el('h4', {}, '✨ Xem lại hướng dẫn từ đầu & Tour giao diện'),
        el('p', { style: 'margin-bottom:12px' }, 'Khởi chạy lại màn hình chào mừng 5 bước (Onboarding) hoặc chuyến tham quan trực tiếp các thành phần trên giao diện:'),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
          el('button', {
            class: 'btn btn--primary btn--sm',
            text: '🚀 Mở Onboarding 5 bước',
            onclick: () => {
              const modalRoot = $('#modal-root');
              if (modalRoot) { modalRoot.classList.remove('is-open'); modalRoot.innerHTML = ''; }
              showOnboarding({ startStep: 0 });
            }
          }),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            text: '🎯 Bắt đầu Tour giao diện tương tác',
            onclick: () => {
              const modalRoot = $('#modal-root');
              if (modalRoot) { modalRoot.classList.remove('is-open'); modalRoot.innerHTML = ''; }
              startSpotlightTour();
            }
          })
        ])
      ]));

      root.appendChild(el('div', { class: 'help-section-card' }, [
        el('h4', {}, '📹 3 bước khởi động nhanh nhất:'),
        el('ul', { style: 'padding-left:18px;margin-top:6px;line-height:1.7' }, [
          el('li', {}, '1. Ở trang Trung tâm Điều hành, bấm nút "🎥 Kết nối Camera Thực tế" và Cho phép (Allow) quyền camera.'),
          el('li', {}, '2. Đứng trước camera, AI sẽ tự động định vị khung xương người 17 khớp và giám sát vùng cấm bờ Hồ Đá.'),
          el('li', {}, '3. Rà chuột (hover) lên thanh điều hướng hoặc các thẻ trên màn hình để xem thông tin mở rộng.')
        ])
      ]));
    } else if (tabId === 'features') {
      const items = [
        ['📹', 'Trung tâm Điều hành & 6 Trạm Camera Bờ hồ', 'Giám sát trực tiếp Bờ Bắc (Vách đá dựng đứng), Bờ Đông (Đ. Nguyễn Du), Mỏm đá Tử thần (Bờ Tây), Lối mòn Khu A, Viện CNSH và Tuyến Ống Nước Thô bằng YOLOv8x-Pose.'],
        ['🚧', 'Vùng cấm Bờ hồ (Polygon Geofencing)', 'Cho phép vẽ các vùng đa giác cảnh báo dọc mép vực đá. Khi phát hiện người bước vào hoặc đứng quá lâu sát vách đá, hệ thống sẽ phát tín hiệu cảnh báo ngay.'],
        ['🗺️', 'Bản đồ 3D Địa hình Hồ Đá & Radar 2D', 'Mô phỏng không gian 3D khu vực Hồ Đá Làng Đại học bằng Three.js và quét tín hiệu thiết bị quanh lòng hồ trong bán kính 100m.'],
        ['👑', 'Thương mại hóa Đa lĩnh vực & Quản trị Doanh thu', 'Mở rộng triển khai cho Trường mầm non tư thục (Pro · 10.000đ) và Viện dưỡng lão / Khu đô thị (Business · 599.000đ) với thanh toán VietQR MB Bank tự động.']
      ];
      items.forEach(([ico, title, desc]) => {
        root.appendChild(el('div', { class: 'help-section-card' }, [
          el('h4', {}, `${ico} ${title}`),
          el('p', {}, desc)
        ]));
      });
    } else if (tabId === 'shortcuts') {
      const shortcuts = [
        ['1', 'Chuyển đến trang Trung tâm Điều hành (Overview)'],
        ['2', 'Chuyển đến trang Vùng cấm Bờ hồ / Đa camera'],
        ['3', 'Chuyển đến trang Bản đồ 3D Hồ Đá (Map 3D)'],
        ['4', 'Chuyển đến trang Radar Quét Bờ hồ'],
        ['5', 'Chuyển đến trang Nhật ký Sự cố'],
        ['6', 'Chuyển đến trang Cài đặt hệ thống'],
        ['S', 'Bật / Tắt còi báo động khẩn cấp (Sound)'],
        ['T', 'Chuyển đổi chế độ Sáng / Trực đêm (Theme)'],
        ['R', 'Làm mới dữ liệu (Refresh)'],
        ['?', 'Mở cửa sổ Hướng dẫn sử dụng này'],
        ['Esc', 'Đóng cửa sổ modal hoặc thoát chế độ toàn màn hình']
      ];
      const table = el('table', { class: 'table' });
      table.innerHTML = `<thead><tr><th style="width:110px">Phím bấm</th><th>Chức năng thao tác</th></tr></thead><tbody>${shortcuts.map(([k, d]) => `<tr><td><span class="kbd" style="font-weight:700">${k}</span></td><td>${d}</td></tr>`).join('')}</tbody>`;
      root.appendChild(el('div', { class: 'table-wrap' }, [table]));
    } else if (tabId === 'faq') {
      const faqs = [
        {
          q: 'Tại sao giao diện ẩn bớt các dòng chữ mô tả?',
          a: 'Để màn hình giám sát Camera AI Hồ Đá luôn thoáng và gọn gàng nhất, các chú thích phụ được ẩn đi và sẽ tự động trượt ra mượt mà ngay khi bạn rà chuột (hover) vào từng thẻ hoặc nút bấm.'
        },
        {
          q: 'Xem thông tin các đơn hàng đã thanh toán thành công (609.000đ) ở đâu?',
          a: 'Bạn bấm vào nút "💰 Doanh thu" trên thanh tiêu đề phía trên cùng (hoặc tab "Quản trị doanh thu" trên thanh điều hướng) để xem 3 đơn hàng đã thanh toán (VGC510743, VGC287162, VGC080979) cùng danh sách License Key.'
        },
        {
          q: 'Làm sao để mở lại màn hình chào mừng 5 bước khi mới vào web?',
          a: 'Trong cửa sổ này, chọn tab "🚀 Bắt đầu nhanh" rồi bấm "Mở Onboarding 5 bước", hoặc vào trang Cài đặt → Hướng dẫn & Trợ giúp → bấm "🔄 Đặt lại".'
        }
      ];
      faqs.forEach(f => {
        const item = el('div', { class: 'help-faq-item' });
        const qEl = el('div', { class: 'help-faq-q' }, [
          el('span', {}, f.q),
          el('span', { style: 'color:var(--muted);font-size:11px' }, '▼')
        ]);
        const aEl = el('div', { class: 'help-faq-a', html: f.a });
        aEl.style.display = 'none';
        qEl.onclick = () => {
          const isOpen = aEl.style.display !== 'none';
          aEl.style.display = isOpen ? 'none' : 'block';
          qEl.querySelector('span:last-child').textContent = isOpen ? '▼' : '▲';
        };
        item.appendChild(qEl);
        item.appendChild(aEl);
        root.appendChild(item);
      });
    }
  }

  function checkFirstVisit() {
    const hasSeenGuide = utils.storage.get(STORAGE.guideSeen, false);
    if (!hasSeenGuide) {
      setTimeout(() => {
        showOnboarding({ startStep: 0 });
      }, 750);
    }
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
