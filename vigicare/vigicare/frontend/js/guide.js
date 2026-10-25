(function (VC) {
  'use strict';

  const { utils, store, notify, STORAGE } = VC;
  const { $, $$, el, icon, escape } = utils;

  const ONBOARDING_SLIDES = [
    {
      badge: 'Bước 1 / 5',
      icon: '🛡️',
      title: 'Chào mừng bạn đến với VigiCare',
      subtitle: 'Hệ thống AI giám sát an toàn & phát hiện té ngã 24/7 cho người cao tuổi.',
      features: [
        {
          icon: '⚡',
          title: 'Phát hiện té ngã tức thời',
          desc: 'AI phân tích 17 điểm khớp xương theo thời gian thực (RTMO + Transformer), độ chính xác cao.'
        },
        {
          icon: '🔒',
          title: 'Bảo mật 100% Offline',
          desc: 'Xử lý hoàn toàn trên thiết bị của bạn, tuyệt đối không gửi hình ảnh video ra ngoài Internet.'
        },
        {
          icon: '🔔',
          title: 'Cảnh báo đa kênh',
          desc: 'Phát còi báo động khẩn cấp tại chỗ, hiển thị pop-up và tự động gửi email cho người giám hộ.'
        },
        {
          icon: '👥',
          title: 'Đa đối tượng & Không gian',
          desc: 'Theo dõi nhiều người cùng lúc, kết hợp Bản đồ 3D và Radar WiFi bảo vệ không gian riêng tư.'
        }
      ],
      tip: 'Hệ thống được thiết kế tối ưu, trực quan và dễ sử dụng cho mọi thành viên trong gia đình.'
    },
    {
      badge: 'Bước 2 / 5',
      icon: '📹',
      title: 'Bật Camera & Bắt đầu Giám sát',
      subtitle: 'Sử dụng webcam tích hợp, webcam USB ngoài hoặc camera giám sát IP có sẵn.',
      features: [
        {
          icon: '🔘',
          title: 'Nút "Bật camera của tôi"',
          desc: 'Tại trang Tổng quan, nhấn nút này để cho phép trình duyệt kích hoạt webcam máy tính hoặc điện thoại.'
        },
        {
          icon: '🔄',
          title: 'Chọn camera linh hoạt',
          desc: 'Dễ dàng chuyển đổi giữa camera trước, camera sau hoặc camera phụ từ danh sách thả xuống.'
        },
        {
          icon: '🌐',
          title: 'Yêu cầu quyền truy cập',
          desc: 'Trình duyệt chỉ cho phép mở camera khi chạy trên http://localhost hoặc https://. Hãy bấm Cho phép (Allow).'
        },
        {
          icon: '🔌',
          title: 'Nút Bật/Tắt AI tại Topbar',
          desc: 'Icon Camera trên thanh trên cùng cho phép tạm dừng AI để giải phóng camera cho ứng dụng khác.'
        }
      ],
      tip: 'Nếu chưa cấp quyền camera, hệ thống sẽ tự động dùng luồng mô phỏng thông minh để bạn trải nghiệm.'
    },
    {
      badge: 'Bước 3 / 5',
      icon: '🚧',
      title: 'Thiết lập Vùng cấm nguy hiểm (Zones)',
      subtitle: 'Bảo vệ người thân khỏi những khu vực tiềm ẩn rủi ro té ngã trong nhà.',
      features: [
        {
          icon: '🪜',
          title: 'Khu vực nhạy cảm',
          desc: 'Khoanh vùng cầu thang, ban công ngoài trời, khu vực bếp lửa hoặc nhà tắm trơn trượt.'
        },
        {
          icon: '✏️',
          title: 'Vẽ trực quan trên camera',
          desc: 'Chọn tab "Vùng cấm" (icon khiên ở menu trái) và dùng chuột chấm các điểm để tạo vùng giới hạn.'
        },
        {
          icon: '⏱️',
          title: 'Cảnh báo đứng lâu (Dwell time)',
          desc: 'Cảnh báo khi người cao tuổi dừng lại quá lâu ở khu vực rủi ro hoặc bất ngờ vào vùng cấm tuyệt đối.'
        },
        {
          icon: '🎨',
          title: 'Độ trong suốt & Màu sắc',
          desc: 'Tùy chỉnh màu sắc cảnh báo (Đỏ/Vàng/Cam) phù hợp với từng mức độ nguy hiểm.'
        }
      ],
      tip: 'Bạn có thể thiết lập nhiều vùng cấm độc lập cho từng vị trí camera khác nhau.'
    },
    {
      badge: 'Bước 4 / 5',
      icon: '📡',
      title: 'Bản đồ 3D & Radar WiFi bảo vệ riêng tư',
      subtitle: 'Công nghệ hiện đại giúp giám sát toàn diện ngôi nhà mà không xâm phạm riêng tư.',
      features: [
        {
          icon: '🏢',
          title: 'Bản đồ số 3D trực quan',
          desc: 'Trực quan hóa toàn bộ căn nhà qua mô hình 3D, hiển thị vị trí người và các camera theo thời gian thực.'
        },
        {
          icon: '🖱️',
          title: 'Tương tác 3D dễ dàng',
          desc: 'Giữ chuột trái để xoay góc nhìn, chuột phải để di chuyển, cuộn chuột để phóng to/thu nhỏ.'
        },
        {
          icon: '📶',
          title: 'Radar WiFi (CSI)',
          desc: 'Giám sát không cần camera trong phòng ngủ, nhà vệ sinh nhờ phân tích sóng tán xạ WiFi.'
        },
        {
          icon: '💓',
          title: 'Nhận diện nhịp thở & Cử động',
          desc: 'Phát hiện người nằm im bất thường hoặc có dấu hiệu nguy cấp mà vẫn giữ được sự riêng tư 100%.'
        }
      ],
      tip: 'Xem thử tab "Bản đồ 3D" và "Radar WiFi" trên menu bên trái để khám phá ngay.'
    },
    {
      badge: 'Bước 5 / 5',
      icon: '🚨',
      title: 'Xử lý Cảnh báo & Phím tắt thao tác nhanh',
      subtitle: 'Nắm vững quy trình phản ứng khẩn cấp và các phím bấm tiện ích.',
      features: [
        {
          icon: '🔊',
          title: 'Chuông báo & Đánh dấu xử lý',
          desc: 'Khi có sự cố té ngã, chuông cảnh báo sẽ vang lên. Nhấn "Đã xử lý" trên thẻ cảnh báo khi đã can thiệp.'
        },
        {
          icon: '✉️',
          title: 'Cấu hình thông báo Email',
          desc: 'Vào "Cài đặt" để bật gửi email kèm ảnh chụp thời điểm xảy ra sự cố tới điện thoại của bạn.'
        },
        {
          icon: '⌨️',
          title: 'Phím số 1 – 6',
          desc: '1: Tổng quan · 2: Vùng cấm · 3: Bản đồ 3D · 4: Radar · 5: Lịch sử · 6: Cài đặt.'
        },
        {
          icon: '⚡',
          title: 'Phím S, T, R, ?',
          desc: 'S: Bật/tắt âm thanh · T: Đổi theme sáng/tối · R: Làm mới dữ liệu · ?: Mở lại hướng dẫn này.'
        }
      ],
      tip: 'Bạn có thể bấm vào nút dấu hỏi (?) trên thanh tiêu đề bất cứ khi nào cần trợ giúp.'
    }
  ];

  /* ============================================================
     1. WELCOME / ONBOARDING MODAL
     ============================================================ */
  let currentSlide = 0;
  let onboardingContainer = null;

  function showOnboarding(options = {}) {
    const { startStep = 0, onFinish = null } = options;
    currentSlide = Math.max(0, Math.min(startStep, ONBOARDING_SLIDES.length - 1));

    if (onboardingContainer) {
      onboardingContainer.remove();
      onboardingContainer = null;
    }

    const modal = el('div', { class: 'onboarding-modal', id: 'onboardingModal' });
    const backdrop = el('div', { class: 'onboarding-backdrop', onclick: closeOnboarding });

    const card = el('div', { class: 'onboarding-card' });

    // Header
    const head = el('div', { class: 'onboarding-header' }, [
      el('div', { class: 'onboarding-brand' }, [
        el('span', { class: 'onboarding-brand__badge', id: 'onboardingBadge' }, ONBOARDING_SLIDES[currentSlide].badge),
        el('span', { class: 'onboarding-brand__title' }, 'Hướng dẫn người dùng mới')
      ]),
      el('button', {
        class: 'icon-btn',
        title: 'Đóng (Esc)',
        html: icon('x'),
        onclick: closeOnboarding
      })
    ]);

    // Body
    const body = el('div', { class: 'onboarding-body', id: 'onboardingBody' });

    // Footer
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

    // Escape listener
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

    // Render Body
    body.innerHTML = '';
    const slideEl = el('div', { class: 'onboarding-slide' });

    // Hero box
    const hero = el('div', { class: 'onboarding-hero' }, [
      el('div', { class: 'onboarding-hero__icon', text: slide.icon }),
      el('div', { class: 'onboarding-hero__text' }, [
        el('h3', { text: slide.title }),
        el('p', { text: slide.subtitle })
      ])
    ]);
    slideEl.appendChild(hero);

    // Features grid
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

    // Tip box
    if (slide.tip) {
      slideEl.appendChild(el('div', { class: 'onboarding-tip' }, [
        el('span', {}, '💡'),
        el('div', { html: `<strong>Mẹo:</strong> ${slide.tip}` })
      ]));
    }

    body.appendChild(slideEl);

    // Render Dots
    dots.innerHTML = '';
    ONBOARDING_SLIDES.forEach((_, idx) => {
      const dot = el('div', {
        class: `onboarding-dot ${idx === index ? 'is-active' : ''}`,
        title: `Đến bước ${idx + 1}`,
        onclick: () => {
          currentSlide = idx;
          renderSlide(currentSlide);
        }
      });
      dots.appendChild(dot);
    });

    // Render Action Buttons
    actions.innerHTML = '';

    if (index > 0) {
      actions.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '← Quay lại',
        onclick: () => {
          currentSlide--;
          renderSlide(currentSlide);
        }
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
        onclick: () => {
          currentSlide++;
          renderSlide(currentSlide);
        }
      }));
    } else {
      // Last slide: Complete + Explore Tour
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
            message: 'Bấm nút (?) bất cứ lúc nào để mở lại hướng dẫn.',
            type: 'ok',
            duration: 4000
          });
        }
      }));
    }
  }

  function closeOnboarding() {
    // Save that user has completed onboarding
    utils.storage.set(STORAGE.guideSeen, true);

    if (onboardingContainer) {
      if (onboardingContainer._cleanup) onboardingContainer._cleanup();
      onboardingContainer.remove();
      onboardingContainer = null;
    }
  }

  /* ============================================================
     2. INTERACTIVE SPOTLIGHT WALKTHROUGH (TOUR GIAO DIỆN)
     ============================================================ */
  const SPOTLIGHT_STEPS = [
    {
      target: '#sidebar',
      title: '1. Menu điều hướng chính',
      desc: 'Truy cập nhanh các phân hệ: Tổng quan camera, Vùng cấm nguy hiểm, Bản đồ 3D Three.js, Radar WiFi CSI, Lịch sử cảnh báo và Cài đặt.',
      placement: 'right'
    },
    {
      target: '.camera-picker',
      fallbackTarget: '.card:has(.video), .card',
      title: '2. Bật Webcam & Giám sát',
      desc: 'Bấm "Bật camera của tôi" để dùng ngay webcam máy tính/điện thoại, hoặc chọn giữa các camera trong nhà.',
      placement: 'bottom'
    },
    {
      target: '.alert-card, .card:has(.ico.is-danger), .card:has(.badge--ok)',
      title: '3. Thẻ Cảnh báo AI thời gian thực',
      desc: 'Khi phát hiện người té ngã hoặc bất thường, thông tin chi tiết kèm độ tin cậy AI sẽ hiển thị ở đây để bạn xử lý kịp thời.',
      placement: 'left'
    },
    {
      target: '#topbar .topbar__actions',
      title: '4. Thanh công cụ tiện ích',
      desc: 'Quản lý bật/tắt camera AI, chuông báo động (phím S), giao diện Sáng/Tối (phím T) và nút Trợ giúp (?) bất kỳ lúc nào.',
      placement: 'bottom'
    }
  ];

  let currentSpotlightIndex = 0;
  let spotlightOverlay = null;

  function startSpotlightTour() {
    // If not in overview view, go to overview first
    if (store.state.view !== 'overview') {
      VC.app.go('overview');
    }

    currentSpotlightIndex = 0;
    renderSpotlightStep(currentSpotlightIndex);
  }

  function renderSpotlightStep(index) {
    if (spotlightOverlay) {
      spotlightOverlay.remove();
      spotlightOverlay = null;
    }

    if (index >= SPOTLIGHT_STEPS.length) {
      notify.toast({
        title: 'Hoàn tất chuyến tham quan!',
        message: 'Bạn đã sẵn sàng sử dụng hệ thống VigiCare.',
        type: 'ok',
        duration: 3500
      });
      return;
    }

    const step = SPOTLIGHT_STEPS[index];
    let targetEl = document.querySelector(step.target);
    if (!targetEl && step.fallbackTarget) {
      targetEl = document.querySelector(step.fallbackTarget);
    }

    if (!targetEl) {
      // Skip to next step if element not found
      renderSpotlightStep(index + 1);
      return;
    }

    // Scroll element into view smoothly if needed
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const overlay = el('div', { class: 'spotlight-overlay', id: 'spotlightOverlay' });
    const mask = el('div', { class: 'spotlight-mask', onclick: closeSpotlight });
    overlay.appendChild(mask);

    const rect = targetEl.getBoundingClientRect();

    // Highlight border box around target
    const highlight = el('div', {
      class: 'spotlight-target-highlight',
      style: `
        top: ${Math.max(4, rect.top - 6)}px;
        left: ${Math.max(4, rect.left - 6)}px;
        width: ${rect.width + 12}px;
        height: ${rect.height + 12}px;
      `
    });
    overlay.appendChild(highlight);

    // Popover Box
    const popover = el('div', { class: 'spotlight-popover' });

    popover.appendChild(el('div', { class: 'spotlight-popover__step' }, `BƯỚC ${index + 1} / ${SPOTLIGHT_STEPS.length}`));
    popover.appendChild(el('div', { class: 'spotlight-popover__title', text: step.title }));
    popover.appendChild(el('div', { class: 'spotlight-popover__desc', text: step.desc }));

    const foot = el('div', { class: 'spotlight-popover__foot' });

    // Buttons
    foot.appendChild(el('button', {
      class: 'btn btn--ghost btn--sm',
      text: 'Đóng',
      onclick: closeSpotlight
    }));

    const nextBtnGroup = el('div', { style: 'display:flex;gap:6px' });

    if (index > 0) {
      nextBtnGroup.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '← Trước',
        onclick: () => renderSpotlightStep(index - 1)
      }));
    }

    nextBtnGroup.appendChild(el('button', {
      class: 'btn btn--primary btn--sm',
      text: index < SPOTLIGHT_STEPS.length - 1 ? 'Tiếp tục →' : '✓ Hoàn tất',
      onclick: () => renderSpotlightStep(index + 1)
    }));

    foot.appendChild(nextBtnGroup);
    popover.appendChild(foot);
    overlay.appendChild(popover);

    document.body.appendChild(overlay);
    spotlightOverlay = overlay;

    // Calculate popover positioning
    positionPopover(popover, rect, step.placement);
  }

  function positionPopover(popover, targetRect, placement) {
    const popoverRect = popover.getBoundingClientRect();
    const margin = 14;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let top = 0;
    let left = 0;

    if (placement === 'bottom') {
      top = targetRect.bottom + margin;
      left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
    } else if (placement === 'top') {
      top = targetRect.top - popoverRect.height - margin;
      left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
    } else if (placement === 'right') {
      top = targetRect.top + (targetRect.height - popoverRect.height) / 2;
      left = targetRect.right + margin;
    } else if (placement === 'left') {
      top = targetRect.top + (targetRect.height - popoverRect.height) / 2;
      left = targetRect.left - popoverRect.width - margin;
    }

    // Viewport bounding clamp
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
     3. QUICK START BANNER ON OVERVIEW
     ============================================================ */
  function renderQuickStartBanner() {
    const isDismissed = utils.storage.get(STORAGE.guideBannerDismissed, false);
    if (isDismissed) return null;

    const banner = el('div', { class: 'quickstart-banner' });

    banner.appendChild(el('div', { class: 'quickstart-banner__head' }, [
      el('div', { class: 'quickstart-banner__title' }, [
        el('span', {}, '🚀'),
        'Hướng dẫn nhanh cho người dùng mới'
      ]),
      el('button', {
        class: 'icon-btn',
        title: 'Ẩn hướng dẫn này',
        html: icon('x'),
        onclick: () => {
          utils.storage.set(STORAGE.guideBannerDismissed, true);
          banner.style.transition = 'all 0.25s ease';
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-10px)';
          setTimeout(() => banner.remove(), 260);
        }
      })
    ]));

    // 3 Step cards
    const steps = el('div', { class: 'quickstart-steps' });

    // Step 1
    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: async () => {
        const pickerBtn = document.querySelector('.camera-picker button');
        if (pickerBtn) pickerBtn.click();
        else notify.toast({ title: 'Bật Camera', message: 'Bấm nút "Bật camera của tôi" ở khung bên dưới.', type: 'info' });
      }
    }, [
      el('div', { class: 'quickstart-step__num' }, '1'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Bật Camera của bạn'),
        el('p', {}, 'Nhấn để mở webcam và bắt đầu AI nhận diện dáng người 17 khớp.')
      ])
    ]));

    // Step 2
    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: () => VC.app.go('zones')
    }, [
      el('div', { class: 'quickstart-step__num' }, '2'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Thiết lập Vùng cấm'),
        el('p', {}, 'Khoanh vùng cầu thang, nhà tắm hoặc bếp để nhận cảnh báo khi tiếp cận.')
      ])
    ]));

    // Step 3
    steps.appendChild(el('div', {
      class: 'quickstart-step',
      onclick: () => VC.app.go('settings')
    }, [
      el('div', { class: 'quickstart-step__num' }, '3'),
      el('div', { class: 'quickstart-step__info' }, [
        el('h5', {}, 'Cấu hình thông báo'),
        el('p', {}, 'Bật gửi email khẩn cấp và kiểm tra chuông báo khi xảy ra sự cố.')
      ])
    ]));

    banner.appendChild(steps);

    // Banner Foot Actions
    banner.appendChild(el('div', { class: 'quickstart-banner__foot' }, [
      el('span', {}, 'Chưa rõ cách sử dụng? Hãy xem các tài liệu hướng dẫn trực quan:'),
      el('div', { style: 'display:flex;gap:8px' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm',
          text: '🎯 Tour giao diện',
          onclick: () => startSpotlightTour()
        }),
        el('button', {
          class: 'btn btn--primary btn--sm',
          text: '📖 Hướng dẫn chi tiết',
          onclick: () => showHelpCenter('start')
        })
      ])
    ]));

    return banner;
  }

  /* ============================================================
     4. COMPREHENSIVE HELP & GUIDE CENTER MODAL
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
      title: 'Trung tâm Hướng dẫn & Trợ giúp VigiCare',
      body: wrap,
      width: 680,
      actions: [
        { label: 'Đóng', class: 'btn--ghost' }
      ]
    });
  }

  function renderTabContent(tabId, root) {
    root.innerHTML = '';

    if (tabId === 'start') {
      root.appendChild(el('div', { class: 'help-section-card' }, [
        el('h4', {}, ['✨', ' Bạn muốn xem lại hướng dẫn từ đầu?']),
        el('p', { style: 'margin-bottom:12px' }, 'Khởi chạy lại Onboarding từng bước hoặc chuyến tham quan trực tiếp các thành phần trên giao diện:'),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
          el('button', {
            class: 'btn btn--primary btn--sm',
            text: '🚀 Mở Onboarding 5 bước',
            onclick: () => {
              const modalRoot = $('#modal-root');
              modalRoot.classList.remove('is-open');
              modalRoot.innerHTML = '';
              showOnboarding({ startStep: 0 });
            }
          }),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            text: '🎯 Bắt đầu Tour giao diện tương tác',
            onclick: () => {
              const modalRoot = $('#modal-root');
              modalRoot.classList.remove('is-open');
              modalRoot.innerHTML = '';
              startSpotlightTour();
            }
          })
        ])
      ]));

      root.appendChild(el('div', { class: 'help-section-card' }, [
        el('h4', {}, ['📹', ' 3 bước khởi động nhanh nhất:']),
        el('ul', { style: 'padding-left:18px;margin-top:6px;line-height:1.7' }, [
          el('li', {}, '1. Ở trang Tổng quan, bấm nút "Bật camera của tôi" và Cho phép (Allow) quyền camera.'),
          el('li', {}, '2. Đứng trước camera, AI sẽ tự động định vị khung xương người và bắt đầu giám sát.'),
          el('li', {}, '3. Kiểm tra âm thanh cảnh báo bằng cách nhấn phím S hoặc icon loa trên topbar.')
        ])
      ]));
    } else if (tabId === 'features') {
      const items = [
        {
          title: 'Tổng quan & Camera AI',
          icon: '📹',
          desc: 'Hiển thị luồng video realtime từ camera. AI nhận diện khung xương người 17 khớp (RTMO) và nhận định tư thế (đứng, ngồi, nằm, té ngã) bằng Pose Autoencoder và Transformer.'
        },
        {
          title: 'Vùng cấm nguy hiểm (Zones)',
          icon: '🚧',
          desc: 'Cho phép người dùng vẽ các vùng đa giác cảnh báo (ví dụ cầu thang, ban công, mép hồ, nhà bếp). Khi phát hiện người cao tuổi bước vào hoặc lưu lại quá lâu, hệ thống sẽ phát tín hiệu cảnh báo ngay.'
        },
        {
          title: 'Bản đồ 3D Không gian nhà',
          icon: '🏢',
          desc: 'Mô hình hóa toàn bộ ngôi nhà bằng Three.js. Thể hiện vị trí lắp đặt camera và tọa độ của người trong không gian 3D, giúp người nhà dễ hình dung vị trí xảy ra sự cố.'
        },
        {
          title: 'Radar WiFi (CSI)',
          icon: '📶',
          desc: 'Giải pháp bảo vệ quyền riêng tư tuyệt đối cho phòng ngủ và nhà tắm. Sử dụng phân tích sóng tín hiệu WiFi để nhận diện chuyển động và phát hiện người ngã mà không cần bất kỳ camera nào.'
        },
        {
          title: 'Lịch sử & Phân tích',
          icon: '📊',
          desc: 'Lưu trữ toàn bộ các sự kiện cảnh báo kèm hình ảnh snapshot thời điểm xảy ra sự cố, hỗ trợ lọc theo ngày giờ, loại sự cố và xuất báo cáo CSV.'
        }
      ];

      items.forEach(it => {
        root.appendChild(el('div', { class: 'help-section-card' }, [
          el('h4', {}, [it.icon, ' ' + it.title]),
          el('p', {}, it.desc)
        ]));
      });
    } else if (tabId === 'shortcuts') {
      const shortcuts = [
        { key: '1', desc: 'Chuyển đến trang Tổng quan (Overview)' },
        { key: '2', desc: 'Chuyển đến trang Giám sát đa camera / Vùng cấm' },
        { key: '3', desc: 'Chuyển đến trang Bản đồ 3D (Map 3D)' },
        { key: '4', desc: 'Chuyển đến trang Radar WiFi' },
        { key: '5', desc: 'Chuyển đến trang Lịch sử cảnh báo' },
        { key: '6', desc: 'Chuyển đến trang Cài đặt hệ thống' },
        { key: 'S', desc: 'Bật / Tắt âm thanh cảnh báo (Sound)' },
        { key: 'T', desc: 'Chuyển đổi giao diện Sáng / Tối (Theme)' },
        { key: 'R', desc: 'Làm mới dữ liệu (Refresh)' },
        { key: '?', desc: 'Mở cửa sổ Hướng dẫn sử dụng này' },
        { key: 'Esc', desc: 'Đóng cửa sổ modal hoặc thoát chế độ toàn màn hình' }
      ];

      const table = el('table', { class: 'table' });
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width:120px">Phím bấm</th>
            <th>Chức năng thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${shortcuts.map(s => `
            <tr>
              <td><span class="kbd" style="font-weight:700;font-size:12px">${s.key}</span></td>
              <td style="font-size:12.5px;color:var(--text)">${s.desc}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
      root.appendChild(el('div', { class: 'table-wrap' }, [table]));
    } else if (tabId === 'faq') {
      const faqs = [
        {
          q: 'Tại sao trình duyệt không mở được camera khi bấm "Bật camera"?',
          a: 'Trình duyệt yêu cầu kết nối bảo mật (HTTPS) hoặc localhost để truy cập camera. Nếu bạn mở qua IP máy khác (ví dụ http://192.168.x.x), trình duyệt sẽ chặn. Hãy mở qua http://localhost:8000 hoặc thiết lập HTTPS và bấm "Cho phép" khi trình duyệt hỏi quyền.'
        },
        {
          q: 'Dữ liệu hình ảnh camera có bị gửi lên Internet không?',
          a: 'Tuyệt đối không! Toàn bộ quá trình xử lý AI và phân tích hình ảnh diễn ra 100% nội bộ trên máy chủ/máy tính của bạn (Local Offline). Không có bất kỳ hình ảnh hay video nào bị gửi ra máy chủ đám mây.'
        },
        {
          q: 'Làm thế nào để nhận thông báo qua Email khi có người té ngã?',
          a: 'Vào mục "Cài đặt" (phím 6), cuộn xuống phần "Gửi email cảnh báo", bật công tắc cho sự kiện "Té ngã" hoặc "Nghi đột quỵ". Đảm bảo cấu hình thông tin SMTP trong file cấu hình hệ thống.'
        },
        {
          q: 'Hệ thống có phân biệt được giữa việc cúi nhặt đồ và té ngã thật không?',
          a: 'Có. Mô hình AI kết hợp Pose Autoencoder và Transformer chuỗi thời gian phân tích tốc độ rơi của trọng tâm cơ thể và thời gian bất động sau đó, giúp giảm tối đa báo động giả.'
        },
        {
          q: 'Làm sao để xóa hoặc thiết lập lại trạng thái để xem lại hướng dẫn?',
          a: 'Bạn chỉ cần bấm vào icon (?) trên thanh tiêu đề, hoặc vào Cài đặt và bấm nút "Xem lại hướng dẫn ban đầu".'
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

  /* ============================================================
     5. INIT & FIRST VISIT CHECK
     ============================================================ */
  function checkFirstVisit() {
    const hasSeenGuide = utils.storage.get(STORAGE.guideSeen, false);
    if (!hasSeenGuide) {
      setTimeout(() => {
        showOnboarding({ startStep: 0 });
      }, 750);
    }
  }

  // Export to VC namespace
  VC.guide = {
    showOnboarding,
    startSpotlightTour,
    showHelpCenter,
    renderQuickStartBanner,
    checkFirstVisit,
    ONBOARDING_SLIDES
  };

})(window.VC);
