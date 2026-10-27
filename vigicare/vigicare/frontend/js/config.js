(function (global) {
  'use strict';

  const APP = {
    name: 'SafeZone Hồ Đá · ĐHQG-HCM',
    tagline: 'Hệ thống Cảnh báo An toàn Hồ Đá — Ứng dụng Thị giác Máy tính & Camera AI tại Khu đô thị ĐHQG TP.HCM',
    version: '2.0.0',
    build: '2026.10'
  };

  // Hình minh họa cảnh quan Hồ Đá ĐHQG-HCM (vách đá dựng đứng + lòng hồ sâu + hàng rào cảnh báo)
  const LAKE_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0f293a"/>
        <stop offset="55%" stop-color="#164e63"/>
        <stop offset="100%" stop-color="#0e7490"/>
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0284c7"/>
        <stop offset="45%" stop-color="#0369a1"/>
        <stop offset="100%" stop-color="#082f49"/>
      </linearGradient>
      <linearGradient id="cliff" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#475569"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="410" fill="url(#sky)"/>
    <polygon points="0,390 190,220 350,280 530,210 740,300 940,225 1130,275 1280,210 1280,415 0,415" fill="url(#cliff)"/>
    <polygon points="0,410 260,360 470,395 790,370 1050,395 1280,365 1280,430 0,430" fill="#334155"/>
    <rect y="405" width="1280" height="315" fill="url(#water)"/>
    <path d="M80 470 Q320 455 560 470 T1040 468" stroke="rgba(255,255,255,0.18)" stroke-width="2" fill="none"/>
    <path d="M180 545 Q460 530 760 548 T1180 540" stroke="rgba(255,255,255,0.14)" stroke-width="2" fill="none"/>
    <polygon points="90,360 440,345 500,455 70,455" fill="rgba(225,29,72,0.22)" stroke="#f43f5e" stroke-width="3" stroke-dasharray="10,6"/>
    <text x="115" y="388" fill="#fecdd3" font-family="Inter,Arial,sans-serif" font-size="19" font-weight="700">⚠ VÙNG CẤM: VÁCH ĐÁ DỰNG ĐỨNG · MỰC NƯỚC SÂU &gt;30M</text>
    <text x="640" y="645" text-anchor="middle" fill="#e0f2fe" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700">TRẠM CAMERA AI GIÁM SÁT AN TOÀN HỒ ĐÁ — KHU ĐÔ THỊ ĐHQG TP.HCM</text>
    <text x="640" y="678" text-anchor="middle" fill="#7dd3fc" font-family="Inter,Arial,sans-serif" font-size="16">Nhấn "Bật camera thực tế" ở góc trên khung hình để kết nối trực tiếp với Camera / Webcam</text>
  </svg>`;
  const LAKE_FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(LAKE_FALLBACK_SVG);

  const CAMERAS = [
    { id: 'cam-01', name: 'Bờ Bắc · Vách đá dựng đứng', zone: 'Cụm Hồ Chính ĐHQG',     online: true,  fps: 30, target: true },
    { id: 'cam-02', name: 'Bờ Đông · Đường Nguyễn Du',  zone: 'Ven đường Nguyễn Du',   online: true,  fps: 28, target: true },
    { id: 'cam-03', name: 'Mỏm đá Tử thần · Bờ Tây',   zone: 'Vách đá sâu >30m',      online: true,  fps: 30, target: true },
    { id: 'cam-04', name: 'Lối mòn Hàng rào Khu A',     zone: 'Giáp KTX Khu A',        online: false, fps: 0,  target: false },
    { id: 'cam-05', name: 'Bờ Nam · Giáp Viện CNSH',    zone: 'Đường Marie Curie',     online: true,  fps: 25, target: false },
    { id: 'cam-06', name: 'Chốt Bảo vệ Ống Nước Thô',   zone: 'Cổng tuần tra Tây Nam', online: true,  fps: 30, target: true }
  ];

  const ALERT_TYPES = {
    fall:          { id: 'fall',          label: 'Trượt ngã sát mép Hồ Đá',     color: 'danger', icon: '🚨' },
    stroke:        { id: 'stroke',        label: 'Bất tỉnh / Đuối sức ven hồ',  color: 'danger', icon: '🆘' },
    abnormal:      { id: 'abnormal',      label: 'Vượt rào / Leo mỏm đá',       color: 'warn',   icon: '⚠️' },
    inactive:      { id: 'inactive',      label: 'Đứng lâu sát vách đá Hồ Đá',  color: 'warn',   icon: '⏱️' },
    zone_enter:    { id: 'zone_enter',    label: 'Xâm nhập vùng cấm bờ hồ',     color: 'warn',   icon: '🚧' },
    zone_dwell:    { id: 'zone_dwell',    label: 'Nán lại lâu ở mép vực Hồ Đá', color: 'danger', icon: '⚠️' },
    zone_critical: { id: 'zone_critical', label: 'KHẨN CẤP — Sát vực nước sâu', color: 'danger', icon: '🚨' },
    zone_exit:     { id: 'zone_exit',     label: 'Đã rời vùng cấm bờ hồ',       color: 'ok',     icon: '✓' },
    resolved:      { id: 'resolved',      label: 'An toàn / Đã rời bờ hồ',      color: 'ok',     icon: '✓' }
  };

  const STATUS = {
    pending:    { id: 'pending',    label: 'Chờ ứng cứu',  color: 'warn' },
    processing: { id: 'processing', label: 'Đang tuần tra', color: 'warn' },
    resolved:   { id: 'resolved',   label: 'Đã xử lý',     color: 'ok' },
    dismissed:  { id: 'dismissed',  label: 'Báo nhầm',     color: 'muted' }
  };

  const NAV = [
    { id: 'overview',  label: 'Giám sát Hồ Đá',     icon: 'camera' },
    { id: 'zones',     label: 'Vùng cấm bờ hồ',     icon: 'shield' },
    { id: 'map3d',     label: 'Bản đồ 3D Hồ Đá',    icon: 'activity' },
    { id: 'radar',     label: 'Radar Quanh Hồ',     icon: 'radar' },
    { id: 'history',   label: 'Nhật ký sự cố',      icon: 'clock' },
    { id: 'analytics', label: 'Thống kê bờ hồ',     icon: 'chart' },
    { id: 'upgrade',   label: 'Thương mại & Pro',   icon: 'crown' },
    { id: 'settings',  label: 'Cài đặt',            icon: 'settings' }
  ];

  const ICONS = {
    home:     '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    camera:   '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    radar:    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="12" x2="19" y2="5"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    chart:    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    play:     '<polygon points="6 4 20 12 6 20 6 4"/>',
    pause:    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    volume:   '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    mute:     '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    expand:   '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon:     '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    bell:     '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x:        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check:    '<polyline points="20 6 9 17 4 12"/>',
    alert:    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    user:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    refresh:  '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    help:     '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    crown:    '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    lock:     '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
  };

  const KEYBINDS = {
    '1': 'overview', '2': 'zones', '3': 'map3d', '4': 'radar',
    '5': 'history', '6': 'analytics', '7': 'upgrade', '8': 'settings',
    's': 'toggle-sound', 't': 'toggle-theme', 'r': 'refresh',
    '?': 'help', 'h': 'help'
  };

  const THRESHOLDS = {
    fallConfidence: 0.85,
    inactivitySeconds: 30,
    alertCooldown: 15
  };

  const STORAGE = {
    theme: 'vigicare.theme',
    sound: 'vigicare.sound',
    settings: 'vigicare.settings',
    history: 'vigicare.history',
    guideSeen: 'vigicare.guide_seen',
    guideBannerDismissed: 'vigicare.guide_banner_dismissed'
  };

  global.VC = global.VC || {};
  Object.assign(global.VC, {
    APP, CAMERAS, ALERT_TYPES, STATUS, NAV, ICONS, KEYBINDS, THRESHOLDS, STORAGE, LAKE_FALLBACK_IMG
  });
})(window);
