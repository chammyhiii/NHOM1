/* ============================================================
   SafeZone-HD — map3d.js
   Hồ đá ĐHQG — Realistic Daytime Scene
   ============================================================ */
(function (VC) {
  'use strict';

  const { utils } = VC;
  const { el, icon } = utils;

  let renderer, scene, camera, controls;
  let animId = null;
  let isActive = false;
  let zoneMeshes = [];
  let alertMarkers = [];
  let clouds = [];

  // ============================================================
  // HỒ ĐÁ — Polygon mô phỏng từ ảnh vệ tinh
  // ============================================================
  const LAKE_OUTLINE = [
    [ 90, -75], [130, -60], [150, -30], [155,  10],
    [140,  40], [110,  65], [ 70,  75], [ 30,  75],
    [-10,  70], [-50,  60], [-80,  40], [-100, 15],
    [-105,-15], [-95, -45], [-70, -65], [-35, -78],
    [  5, -82], [ 45, -80],
  ];

  // ============================================================
  // NHÀ CAO TẦNG XA — mô phỏng khu đô thị ĐHQG phía sau
  // ============================================================
  const SKYSCRAPERS = [
    [220, -100, 15, 15, 60],
    [250, -90, 18, 18, 75],
    [280, -110, 20, 20, 85],
    [235, -140, 16, 16, 65],
    [265, -150, 22, 22, 90],
    [300, -130, 18, 18, 70],
    [210, 50, 15, 15, 55],
    [240, 70, 18, 18, 65],
  ];

  // ============================================================
  // NHÀ THẤP GẦN HỒ — các dãy nhà mái đỏ ĐHQG
  // ============================================================
  const LOW_BUILDINGS = [
    [ 180, 30, 30, 15, 8],
    [ 190, 65, 28, 14, 7],
    [ 170, 100, 25, 12, 7],
    [-180, 60, 28, 14, 6],
    [-170, 95, 25, 12, 6],
    [-150, 130, 30, 15, 7],
  ];

  function generateTrees() {
    const trees = [];
    const target = 180;
    const attempts = 3000;

    for (let i = 0; i < attempts && trees.length < target; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 110 + Math.random() * 130;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Tránh hồ
      if (pointInLake(x, z)) continue;

      // Tránh nhà
      const nearBuilding = [...SKYSCRAPERS, ...LOW_BUILDINGS].some(b =>
        Math.abs(x - b[0]) < 25 && Math.abs(z - b[1]) < 25
      );
      if (nearBuilding) continue;

      // Tránh đường
      if (Math.abs(Math.sqrt(x * x + z * z) - 280) < 15) continue;

      trees.push({
        x, z,
        scale: 0.8 + Math.random() * 0.8,
        rotation: Math.random() * Math.PI * 2,
      });
    }
    return trees;
  }

  function pointInLake(px, pz) {
    let inside = false;
    const n = LAKE_OUTLINE.length;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
      const xi = LAKE_OUTLINE[i][0], zi = LAKE_OUTLINE[i][1];
      const xj = LAKE_OUTLINE[j][0], zj = LAKE_OUTLINE[j][1];
      if (((zi > pz) !== (zj > pz)) &&
          (px < (xj - xi) * (pz - zi) / (zj - zi + 1e-9) + xi)) {
        inside = !inside;
      }
      j = i;
    }
    return inside;
  }

  function focusCam(px, py, pz, tx, ty, tz) {
    if (!camera || !controls) return;
    camera.position.set(px, py, pz);
    controls.target.set(tx, ty, tz);
    controls.update();
  }

  function renderMap3D(root) {
    root.innerHTML = '';

    const deck = el('div', { class: 'command-deck' });

    const sideCard = el('div', { class: 'card' });
    sideCard.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('map') }),
        'Tọa độ & Góc nhìn 3D Hồ Đá'
      ]),
      el('span', { class: 'badge badge--ok' }, 'GIS 3D')
    ]));

    sideCard.appendChild(el('p', {
      style: 'font-size:12px;color:var(--text-dim);margin-bottom:12px;line-height:1.55',
      text: 'Mô hình không gian 3 chiều khu vực Hồ Đá Làng Đại học ĐHQG-HCM, tích hợp vị trí các trạm Camera AI và vùng cấm vách đá dựng đứng.'
    }));

    const presetList = el('div', { style: 'display:grid;gap:8px;margin-bottom:14px' }, [
      el('button', { class: 'btn btn--primary btn--sm', style: 'justify-content:flex-start', onclick: () => focusCam(200, 180, 260, 0, 0, 0) }, '🌊 Toàn cảnh Cụm Hồ Đá ĐHQG-HCM'),
      el('button', { class: 'btn btn--ghost btn--sm', style: 'justify-content:flex-start', onclick: () => focusCam(0, 85, -170, 0, 5, -40) }, '🪨 Bờ Bắc · Vách đá dựng đứng & Đ. Nguyễn Du'),
      el('button', { class: 'btn btn--ghost btn--sm', style: 'justify-content:flex-start', onclick: () => focusCam(190, 90, 110, 60, 5, 40) }, '📹 Bờ Đông · Nhà khách ĐHQG & Đ. Marie Curie'),
      el('button', { class: 'btn btn--ghost btn--sm', style: 'justify-content:flex-start', onclick: () => focusCam(-180, 95, 160, -40, 5, 50) }, '🛡️ Bờ Tây - Nam · Viện CNSH & Ống Nước Thô')
    ]);
    sideCard.appendChild(presetList);

    const legendBox = el('div', {
      style: 'background:var(--bg-2);border:1px solid var(--border);padding:12px;border-radius:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px'
    }, [
      legendItem('#0a4a8a', 'Lòng Hồ Đá sâu'),
      legendItem('#8a7a5a', 'Vách đá bờ hồ'),
      legendItem('#ef4444', 'Vùng cấm AI'),
      legendItem('#06b6d4', 'Trạm Camera AI'),
      legendItem('#a82020', 'Cơ sở ĐHQG-HCM'),
      legendItem('#2d5a2d', 'Rừng cây ven hồ')
    ]);
    sideCard.appendChild(legendBox);

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card__head' }, [
      el('div', { class: 'card__title' }, [
        el('div', { class: 'ico', html: icon('activity') }),
        'Mô phỏng Không gian 3D Địa hình Hồ Đá — Khu đô thị ĐHQG TP.HCM'
      ]),
      el('span', { class: 'badge badge--primary' }, 'Xoay / Thu phóng bằng chuột')
    ]));

    const stage = el('div', {
      id: 'map3dStage',
      style: 'position:relative;width:100%;aspect-ratio:16/10;background:#87ceeb;border-radius:12px;overflow:hidden'
    });
    card.appendChild(stage);

    deck.appendChild(sideCard);
    deck.appendChild(card);
    root.appendChild(deck);

    requestAnimationFrame(() => {
      init3D(stage);
      isActive = true;
      animate();

      if (VC.api && VC.api.onRealtimeAlert) {
        VC.api.onRealtimeAlert(handleAlert);
      }
    });
  }

  function legendItem(color, label) {
    return el('span', { style: 'display:inline-flex;align-items:center;gap:5px' }, [
      el('span', { style: `width:10px;height:10px;border-radius:50%;background:${color}` }),
      document.createTextNode(label)
    ]);
  }

  function init3D(container) {
    scene = new THREE.Scene();

    // ===== BẦU TRỜI GRADIENT =====
    const skyGeo = new THREE.SphereGeometry(600, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x4a90e2) },
        bottomColor: { value: new THREE.Color(0xd4e8f7) },
        offset: { value: 50 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    scene.fog = new THREE.Fog(0xb8d8f0, 400, 700);

    const w = container.clientWidth;
    const h = container.clientHeight;

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1500);
    camera.position.set(200, 180, 260);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 80;
    controls.maxDistance = 600;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    // ===== ÁNH SÁNG BAN NGÀY =====
    const hemi = new THREE.HemisphereLight(0xa8d8ff, 0x6b7a5a, 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8);
    sun.position.set(200, 300, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -350;
    sun.shadow.camera.right = 350;
    sun.shadow.camera.top = 350;
    sun.shadow.camera.bottom = -350;
    sun.shadow.camera.far = 1000;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // ===== ĐẤT — với đồi nhấp nhô =====
    drawTerrain();

    // ===== HỒ ĐÁ =====
    drawLake();

    // ===== BỜ ĐÁ DỐC =====
    drawShore();

    // ===== CÂY =====
    const trees = generateTrees();
    trees.forEach(t => drawTree(t.x, t.z, t.scale, t.rotation));

    // ===== NHÀ CAO TẦNG =====
    SKYSCRAPERS.forEach(b => drawSkyscraper(...b));

    // ===== NHÀ THẤP =====
    LOW_BUILDINGS.forEach(b => drawLowBuilding(...b));

    // ===== ĐƯỜNG VÒNG =====
    drawRoad();

    // ===== CAMERA AN NINH =====
    drawSecurityCam(-130, 120);
    drawSecurityCam(140, 120);
    drawSecurityCam(0, -160);

    // ===== TÊN ĐỊA ĐIỂM =====
    drawPlaceLabels();

    // ===== MÂY =====
    drawClouds();

    loadZonesToMap();

    window.addEventListener('resize', onResize);
  }

  // ============================================================
  // ĐẤT
  // ============================================================
  function drawTerrain() {
    const groundGeom = new THREE.PlaneGeometry(1200, 1200, 80, 80);
    const pos = groundGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Đồi nhấp nhô nhẹ xung quanh hồ
      const dist = Math.sqrt(x * x + y * y);
      const hill = Math.max(0, (dist - 130) * 0.05);
      const noise = Math.sin(x * 0.03) * Math.cos(y * 0.03) * 2;
      pos.setZ(i, hill + noise);
    }
    groundGeom.computeVertexNormals();

    const ground = new THREE.Mesh(
      groundGeom,
      new THREE.MeshStandardMaterial({
        color: 0x4a6a3a,
        roughness: 0.95,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ============================================================
  // HỒ ĐÁ — với nước phản chiếu
  // ============================================================
  function drawLake() {
    // Tạo shape polygon
    const shape = new THREE.Shape();
    shape.moveTo(LAKE_OUTLINE[0][0], LAKE_OUTLINE[0][1]);
    for (let i = 1; i < LAKE_OUTLINE.length; i++) {
      shape.lineTo(LAKE_OUTLINE[i][0], LAKE_OUTLINE[i][1]);
    }
    shape.closePath();

    const geom = new THREE.ShapeGeometry(shape, 12);

    // Nước xanh đậm
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a4a8a,
      metalness: 0.7,
      roughness: 0.1,
      emissive: 0x0a2a5a,
      emissiveIntensity: 0.15,
    });

    const lake = new THREE.Mesh(geom, mat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = 0.1;
    lake.receiveShadow = true;
    scene.add(lake);

    // Lớp phản chiếu bầu trời (dùng MeshBasicMaterial xanh nhạt)
    const reflectMat = new THREE.MeshBasicMaterial({
      color: 0x5a9ad0,
      transparent: true,
      opacity: 0.25,
    });
    const reflect = new THREE.Mesh(geom, reflectMat);
    reflect.rotation.x = -Math.PI / 2;
    reflect.position.y = 0.15;
    scene.add(reflect);

    // Gợn sóng — nhiều vòng
    for (let i = 0; i < 3; i++) {
      const rippleGeom = new THREE.RingGeometry(10 + i * 15, 11 + i * 15, 40);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0x9ac8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide
      });
      const ripple = new THREE.Mesh(rippleGeom, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = 0.2;
      ripple.userData.phase = i * 0.5;
      scene.add(ripple);
    }
  }

  // ============================================================
  // BỜ ĐÁ — đá lớn nhỏ rải rác
  // ============================================================
  function drawShore() {
    const rockColors = [0x8a7a5a, 0x6a5a4a, 0xa09070, 0x5a4a3a];

    LAKE_OUTLINE.forEach((p, i) => {
      // Đá lớn ở mỗi đỉnh
      const next = LAKE_OUTLINE[(i + 1) % LAKE_OUTLINE.length];
      const dx = next[0] - p[0];
      const dz = next[1] - p[1];
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;

      // 2-3 viên đá mỗi đoạn
      for (let k = 0; k < 3; k++) {
        const size = 4 + Math.random() * 5;
        const offset = 2 + k * 3 + Math.random() * 2;
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(size, 0),
          new THREE.MeshStandardMaterial({
            color: rockColors[Math.floor(Math.random() * rockColors.length)],
            roughness: 0.95,
            flatShading: true,
          })
        );
        rock.position.set(
          p[0] + nx * offset + Math.random() * 3,
          size * 0.3 + Math.random() * 1.5,
          p[1] + nz * offset + Math.random() * 3
        );
        rock.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        rock.scale.set(1, 0.7 + Math.random() * 0.3, 1);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
      }
    });
  }

  // ============================================================
  // CÂY — 3 tầng nón
  // ============================================================
  function drawTree(x, z, scale, rotation) {
    const g = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 * scale, 0.7 * scale, 3.5 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 1 })
    );
    trunk.position.y = 1.75 * scale;
    trunk.castShadow = true;
    g.add(trunk);

    const greenBase = 0.25 + Math.random() * 0.1;
    for (let i = 0; i < 3; i++) {
      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry((3 - i * 0.6) * scale, 3 * scale, 8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.28, 0.55, greenBase + i * 0.05),
          roughness: 0.85,
          flatShading: true,
        })
      );
      leaves.position.y = (3.5 + i * 1.5) * scale;
      leaves.rotation.y = i * 0.5;
      leaves.castShadow = true;
      g.add(leaves);
    }

    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    scene.add(g);
  }

  // ============================================================
  // NHÀ CAO TẦNG
  // ============================================================
  function drawSkyscraper(x, z, w, d, h) {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: 0xb0c0d0,
        roughness: 0.6,
        metalness: 0.3,
      })
    );
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Kính trên tường
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x5a8ac0,
      emissive: 0x3a5a80,
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.7,
    });
    for (let floor = 1; floor < 8; floor++) {
      for (let side = 0; side < 4; side++) {
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.7, 2),
          glassMat
        );
        const y = floor * (h / 9);
        if (side === 0) { glass.position.set(0, y, d / 2 + 0.05); }
        else if (side === 1) { glass.position.set(0, y, -d / 2 - 0.05); glass.rotation.y = Math.PI; }
        else if (side === 2) { glass.position.set(w / 2 + 0.05, y, 0); glass.rotation.y = Math.PI / 2; }
        else { glass.position.set(-w / 2 - 0.05, y, 0); glass.rotation.y = -Math.PI / 2; }
        g.add(glass);
      }
    }

    // Nóc
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, 1, d * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x808890 })
    );
    top.position.y = h + 0.5;
    g.add(top);

    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ============================================================
  // NHÀ THẤP — mái đỏ
  // ============================================================
  function drawLowBuilding(x, z, w, d, h) {
    const g = new THREE.Group();

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.9 })
    );
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    // Mái đỏ dạng pyramid
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.5, 4),
      new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.7, flatShading: true })
    );
    roof.position.y = h + 1.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);

    // Cửa sổ
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x88bbff,
      emissive: 0x6688bb,
      emissiveIntensity: 0.3,
    });
    for (let i = -2; i <= 2; i++) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 0.15),
        winMat
      );
      win.position.set(i * (w * 0.18), h * 0.55, d / 2 + 0.08);
      g.add(win);

      const win2 = win.clone();
      win2.position.z = -d / 2 - 0.08;
      g.add(win2);
    }

    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ============================================================
  // ĐƯỜNG — vòng + vỉa hè + đèn
  // ============================================================
  function drawRoad() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.9 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });

    const road = new THREE.Mesh(new THREE.RingGeometry(265, 295, 80), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.1;
    road.receiveShadow = true;
    scene.add(road);

    const line = new THREE.Mesh(new THREE.RingGeometry(279, 281, 80), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.15;
    scene.add(line);

    // Vỉa hè
    const side1 = new THREE.Mesh(new THREE.RingGeometry(295, 300, 80), sidewalkMat);
    side1.rotation.x = -Math.PI / 2;
    side1.position.y = 0.12;
    scene.add(side1);

    const side2 = new THREE.Mesh(new THREE.RingGeometry(260, 265, 80), sidewalkMat);
    side2.rotation.x = -Math.PI / 2;
    side2.position.y = 0.12;
    scene.add(side2);

    // Đèn đường
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const x = Math.cos(angle) * 300;
      const z = Math.sin(angle) * 300;

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
      );
      pole.position.set(x, 4, z);
      scene.add(pole);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffee88,
          emissive: 0xffee88,
          emissiveIntensity: 0.6,
        })
      );
      lamp.position.set(x, 8, z);
      scene.add(lamp);
    }
  }

  // ============================================================
  // CAMERA AN NINH
  // ============================================================
  function drawSecurityCam(x, z) {
    const g = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a })
    );
    pole.position.y = 6;
    pole.castShadow = true;
    g.add(pole);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.5, 4),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.6,
      })
    );
    head.position.y = 12;
    head.castShadow = true;
    g.add(head);

    // Ánh sáng tỏa ra
    const spot = new THREE.SpotLight(0x88ddff, 0.5, 100, Math.PI / 6, 0.5);
    spot.position.set(0, 12, 0);
    spot.target.position.set(0, 0, 0);
    g.add(spot);
    g.add(spot.target);

    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ============================================================
  // MÂY — sprites trắng
  // ============================================================
  function drawClouds() {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
    });

    for (let i = 0; i < 15; i++) {
      const cloud = new THREE.Group();
      const numPuff = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numPuff; j++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(8 + Math.random() * 6, 8, 8),
          cloudMat
        );
        puff.position.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 10
        );
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      cloud.position.set(
        (Math.random() - 0.5) * 800,
        120 + Math.random() * 60,
        (Math.random() - 0.5) * 800
      );
      cloud.userData.speed = 0.05 + Math.random() * 0.1;
      scene.add(cloud);
      clouds.push(cloud);
    }
  }

  // ============================================================
  // ZONES
  // ============================================================
  async function loadZonesToMap() {
    try {
      const r = await fetch(VC.api.url('/api/zones'));
      const data = await r.json();
      (data.items || []).forEach(z => drawZoneOnMap(z));
    } catch (e) {
      console.warn('Không load được zones:', e);
    }
  }

  function drawZoneOnMap(zone) {
    const videoW = 1280, videoH = 720;
    const scaleX = 400 / videoW;
    const scaleZ = 300 / videoH;

    const shape = new THREE.Shape();
    zone.polygon.forEach((p, i) => {
      const x = (p[0] - videoW / 2) * scaleX;
      const z = (p[1] - videoH / 2) * scaleZ;
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    });
    shape.closePath();

    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: zone.severity === 'critical' ? 0xef4444 : 0xf59e0b,
      transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.5;
    mesh.userData = { zoneId: zone.id, zoneName: zone.name };
    scene.add(mesh);
    zoneMeshes.push(mesh);

    const edgeGeom = new THREE.EdgesGeometry(geom);
    const line = new THREE.LineSegments(
      edgeGeom,
      new THREE.LineBasicMaterial({ color: 0xff3060, linewidth: 2 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.55;
    scene.add(line);
  }

  function handleAlert(alert) {
    if (!scene) return;
    if (!alert.type || !alert.type.startsWith('zone_')) return;

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    marker.position.set(0, 8, 0);
    scene.add(marker);
    alertMarkers.push({ mesh: marker, ts: Date.now() });

    zoneMeshes.forEach(zm => {
      if (zm.userData.zoneId === alert.zoneId) {
        zm.material.opacity = 0.8;
        setTimeout(() => { zm.material.opacity = 0.45; }, 1500);
      }
    });
  }

  function animate() {
    if (!isActive) return;
    animId = requestAnimationFrame(animate);

    const t = Date.now() * 0.001;

    zoneMeshes.forEach(zm => {
      zm.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
    });

    clouds.forEach(c => {
      c.position.x += c.userData.speed;
      if (c.position.x > 400) c.position.x = -400;
    });

    alertMarkers = alertMarkers.filter(m => {
      if (Date.now() - m.ts > 10000) {
        scene.remove(m.mesh);
        return false;
      }
      m.mesh.scale.setScalar(1 + Math.sin(t * 6) * 0.4);
      m.mesh.position.y = 8 + Math.sin(t * 4) * 2;
      return true;
    });

    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    const stage = document.getElementById('map3dStage');
    if (!stage || !renderer) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  // ============================================================
  // ĐỊA ĐIỂM XUNG QUANH — labels giống Google Maps
  // ============================================================
  const PLACES = [
    // [x, z, label, type]
    // type: 'water' (xanh dương), 'school' (xanh lá), 'shop' (cam), 'road' (xám)
    [   0,    0, 'Hồ Đá Làng Đại Học', 'water'],
    [  20,  -180, 'Trường Nghiên cứu Tiên tiến', 'school'],
    [ 180,  -180, 'Nhà khách ĐH Quốc gia', 'school'],
    [ 230,   -60, 'TT Quản lý Nước & Biến đổi KH', 'school'],
    [-180,  -140, 'Vườn ươm Khu Đô Thị', 'school'],
    [-260,   -50, 'Vườn ươm SG TREE', 'school'],
    [-220,    60, 'Vườn ươm Bồ môn Cảnh quan', 'school'],
    [-180,   130, 'Cà phê FarmCoffee', 'shop'],
    [-100,   160, 'Trại thực nghiệm Thủy sản', 'school'],
    [ -50,   200, 'Xưởng Dược Thú Y', 'school'],
    [-130,   220, 'Trại Thực Nghiệm Chăn Nuôi', 'school'],
    [ 130,   130, 'Lẩu Bò Nhà Cũ - Hồ Đất Chill', 'shop'],
    [ 230,    80, 'MEOW STORE', 'shop'],
    [  50,   240, 'Viện NC Công nghệ Sinh học', 'school'],
    [ 300,  -140, 'Bamboo T', 'shop'],
    // Đường phố
    [ 100,  -290, 'Đ. Nguyễn Du', 'road'],
    [ 340,     0, 'Đ. Marie Curie', 'road'],
    [-120,   240, 'Đ. Số 11', 'road'],
    [   0,   280, 'Đ. Số 1', 'road'],
    [ 240,   240, 'Đ. Số 5', 'road'],
    [-320,   -80, 'Bảo Vệ Tuyến Ống Nước Thô', 'road'],
  ];

  const TYPE_COLORS = {
    water:  { bg: '#1a73e8', text: '#ffffff', icon: '🌊' },
    school: { bg: '#ffffff', text: '#1a73e8', icon: '🎓' },
    shop:   { bg: '#ffffff', text: '#d97706', icon: '☕' },
    road:   { bg: '#f1f3f4', text: '#5f6368', icon: '' },
  };

  function makeLabelSprite(text, type, scale = 1) {
    const cfg = TYPE_COLORS[type] || TYPE_COLORS.school;
    const padding = 16;
    const fontSize = 17;
    const font = `600 ${fontSize}px Inter, Arial, sans-serif`;

    // Đo kích thước text
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.font = font;
    const textWidth = tmpCtx.measureText(text).width;

    const iconWidth = cfg.icon ? fontSize + 8 : 0;
    const canvasW = textWidth + iconWidth + padding * 2;
    const canvasH = fontSize + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    // Nền
    ctx.fillStyle = cfg.bg;
    roundRect(ctx, 2, 2, canvasW - 4, canvasH - 4, 10);
    ctx.fill();

    // Viền nhẹ
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    roundRect(ctx, 2, 2, canvasW - 4, canvasH - 4, 10);
    ctx.stroke();

    // Icon + Text
    ctx.font = font;
    ctx.fillStyle = cfg.text;
    ctx.textBaseline = 'middle';

    let x = padding;
    if (cfg.icon) {
      ctx.fillText(cfg.icon, x, canvasH / 2);
      x += iconWidth;
    }
    ctx.fillText(text, x, canvasH / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);

    // Kích thước sprite trong 3D
    const s = 0.15 * scale;
    sprite.scale.set(canvasW * s, canvasH * s, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPlaceLabels() {
    PLACES.forEach(([x, z, label, type]) => {
      const sprite = makeLabelSprite(label, type, type === 'water' ? 1.3 : 0.8);
      sprite.position.set(x, type === 'water' ? 8 : 15, z);
      scene.add(sprite);

      // Cột mốc cho địa điểm quan trọng
      if (type === 'shop' || type === 'school') {
        const pin = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 8, 8),
          new THREE.MeshBasicMaterial({
            color: type === 'shop' ? 0xd97706 : 0x1a73e8,
          })
        );
        pin.position.set(x, 4, z);
        scene.add(pin);
      }
    });
  }

  VC.views = VC.views || {};
  VC.views.map3d = renderMap3D;
})(window.VC);