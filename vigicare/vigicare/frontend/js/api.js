(function (VC) {
  'use strict';

  const { utils, ALERT_TYPES } = VC;
  const { uid, rand, randInt, pick } = utils;

  function makeAlert({ type, cam, ts = Date.now(), status = 'pending', confidence = 0.9, note = '' }) {
    const t = ALERT_TYPES[type] || ALERT_TYPES.abnormal;
    return {
      id: 'AL-' + uid('x').split('-')[1].toUpperCase(),
      type: t.id,
      typeLabel: t.label,
      typeIcon: t.icon,
      severity: t.color,
      cameraId: cam.id,
      cameraName: cam.name,
      zone: cam.zone,
      confidence,
      status,
      note,
      ts,
      resolvedAt: status === 'resolved' ? ts + 60000 : null
    };
  }

  function seedAlerts(n = 24) {
    const types = ['fall', 'abnormal', 'inactive', 'stroke'];
    const statuses = ['resolved', 'resolved', 'resolved', 'dismissed', 'pending'];
    const cams = VC.CAMERAS.filter(c => c.online);
    const now = Date.now();
    const out = [];
    for (let i = 0; i < n; i++) {
      const type = pick(types);
      const cam = pick(cams);
      const ts = now - i * randInt(20, 90) * 60 * 1000;
      const status = i < 3 ? pick(['pending', 'processing']) : pick(statuses);
      out.push(makeAlert({
        type, cam, ts, status,
        confidence: +(rand(0.72, 0.99).toFixed(3))
      }));
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  let intervalId = null;
  function startStream(onAlert, opts = {}) {
    stopStream();
    const minDelay = opts.minDelay || 25000;
    const maxDelay = opts.maxDelay || 55000;
    const schedule = () => {
      const delay = randInt(minDelay, maxDelay);
      intervalId = setTimeout(() => {
        const cam = pick(VC.CAMERAS.filter(c => c.online));
        const type = pick(['fall', 'abnormal', 'inactive']);
        const alert = makeAlert({
          type, cam,
          confidence: +rand(0.78, 0.99).toFixed(3),
          status: 'pending'
        });
        try { onAlert(alert); } catch (e) { console.error(e); }
        schedule();
      }, delay);
    };
    schedule();
  }

  function stopStream() {
    if (intervalId) { clearTimeout(intervalId); intervalId = null; }
  }

  function computeMetrics(alerts, cameras) {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const todayAlerts = alerts.filter(a => a.ts >= dayStart.getTime());
    const resolved = todayAlerts.filter(a => a.status === 'resolved').length;
    const pending = alerts.filter(a => a.status === 'pending' || a.status === 'processing').length;
    const onlineCams = cameras.filter(c => c.online && !c.locked).length;

    let risk = 'low';
    if (pending >= 3) risk = 'high';
    else if (pending >= 1) risk = 'medium';

    return {
      totalAlerts: todayAlerts.length,
      resolvedToday: resolved,
      pendingAlerts: pending,
      activeCameras: onlineCams,
      totalCameras: cameras.length,
      riskLevel: risk,
      uptimeStart: VC.store.state.metrics.uptimeStart
    };
  }

  function aggregateByDay(alerts, days = 7) {
    const buckets = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const count = alerts.filter(a => a.ts >= start && a.ts < end).length;
      buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: count, ts: start });
    }
    return buckets;
  }

  function aggregateByCamera(alerts, cameras) {
    const grouped = utils.groupBy(alerts, a => a.cameraId);
    return cameras.map(c => ({
      id: c.id, name: c.name,
      value: (grouped[c.id] || []).length
    })).sort((a, b) => b.value - a.value);
  }

  function aggregateByHour(alerts) {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, value: 0, hour: h }));
    alerts.forEach(a => {
      const h = new Date(a.ts).getHours();
      buckets[h].value++;
    });
    return buckets;
  }

  function aggregateByType(alerts) {
    const grouped = utils.groupBy(alerts, a => a.type);
    return Object.keys(grouped).map(k => ({
      id: k,
      label: (VC.ALERT_TYPES[k] || {}).label || k,
      value: grouped[k].length
    }));
  }

  VC.api = {
    seedAlerts, makeAlert, startStream, stopStream,
    computeMetrics, aggregateByDay, aggregateByCamera,
    aggregateByHour, aggregateByType
  };
  /* ============================================================
     Real backend integration
     ============================================================ */

  const BACKEND = {
    base: (location.protocol === 'file:' || location.port === '5500')
      ? 'http://127.0.0.1:8000'
      : '',
    wsUrl() {
      const isLocalFrontend = location.protocol === 'file:' || location.port === '5500';
      const proto = location.protocol === 'https:' && !isLocalFrontend ? 'wss' : 'ws';
      const host = isLocalFrontend ? '127.0.0.1:8000' : location.host;
      return `${proto}://${host}/ws`;
    },
  };

  function url(path) {
    return `${BACKEND.base}${path}`;
  }

  async function fetchAlerts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(url(`/api/alerts${qs ? '?' + qs : ''}`));
    if (!r.ok) throw new Error('Không lấy được alerts');
    return r.json();
  }

  async function fetchCameras() {
    const r = await fetch(url('/api/cameras'));
    if (!r.ok) throw new Error('Không lấy được cameras');
    return r.json();
  }

  async function resolveAlert(id) {
    const r = await fetch(url(`/api/alerts/${id}/resolve`), { method: 'POST' });
    return r.ok ? r.json() : null;
  }

  async function dismissAlert(id) {
    const r = await fetch(url(`/api/alerts/${id}/dismiss`), { method: 'POST' });
    return r.ok ? r.json() : null;
  }

  async function clearAlerts() {
    const r = await fetch(url('/api/alerts'), { method: 'DELETE' });
    return r.ok ? r.json() : null;
  }

  let ws = null;
  let wsReconnectTimer = null;
  let wsListeners = new Set();
  let detectionListeners = new Set();
  const seenAlertIds = new Set();

  function emitRealtimeAlert(alert) {
    if (!alert) return;
    if (alert.id) {
      if (seenAlertIds.has(alert.id)) return;
      seenAlertIds.add(alert.id);
    }
    wsListeners.forEach(fn => {
      try { fn(alert); } catch (err) { console.error(err); }
    });
  }

  function emitRealtimeDetections(data) {
    if (!data) return;
    detectionListeners.forEach(fn => {
      try { fn(data); } catch (err) { console.error(err); }
    });
  }

  function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    try {
      ws = new WebSocket(BACKEND.wsUrl());
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[VC] WS connected');
      clearInterval(wsReconnectTimer);
      wsReconnectTimer = null;
      const pinger = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping');
        else clearInterval(pinger);
      }, 20000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'alert') {
          emitRealtimeAlert(msg.data);
        }
        // Không nhận detections từ WebSocket chung để đảm bảo camera của mỗi laptop là PRIVATE 100%
      } catch (err) { /* ignore */ }
    };

    ws.onclose = () => {
      console.warn('[VC] WS closed — reconnecting in 3s');
      scheduleReconnect();
    };
    ws.onerror = () => { /* noop */ };
  }

  function scheduleReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      connectWS();
    }, 3000);
  }

  function onRealtimeAlert(fn) {
    wsListeners.add(fn);
    return () => wsListeners.delete(fn);
  }

  function onRealtimeDetections(fn) {
    detectionListeners.add(fn);
    return () => detectionListeners.delete(fn);
  }

  function streamUrl() {
    return url('/stream');
  }

  Object.assign(VC.api, {
    BACKEND, fetchAlerts, fetchCameras,
    resolveAlert, dismissAlert, clearAlerts,
    connectWS, onRealtimeAlert, onRealtimeDetections, emitRealtimeAlert, emitRealtimeDetections, streamUrl, url,
  });
})(window.VC);
