(function (VC) {
  'use strict';

  const { STORAGE } = VC;
  const storage = VC.utils.storage;
  const listeners = new Set();

  const initial = {
    view: 'overview',
    theme: storage.get(STORAGE.theme, 'dark'),
    sound: storage.get(STORAGE.sound, true),
    livePaused: false,
    activeCamera: 'cam-01',
    alerts: [],
    cameras: VC.CAMERAS.map(c => ({ ...c })),
    thresholds: { ...VC.THRESHOLDS },
    filters: {
      search: '', type: 'all', camera: 'all', status: 'all',
      from: '', to: '', page: 1, pageSize: 8
    },
    metrics: {
      totalAlerts: 0, resolvedToday: 0, activeCameras: 0,
      uptimeStart: Date.now(), riskLevel: 'low'
    }
  };

  const state = { ...initial };

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notify(reason = 'update') {
    listeners.forEach(fn => {
      try { fn(state, reason); } catch (e) { console.error(e); }
    });
  }

  function set(patch, reason = 'update') {
    Object.assign(state, patch);
    notify(reason);
  }

  function setNested(path, value, reason = 'update') {
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    notify(reason);
  }

  function pushAlert(alert) {
    state.alerts.unshift(alert);
    if (state.alerts.length > 500) state.alerts.length = 500;
    notify('alert:new');
  }

  function updateAlert(id, patch) {
    const a = state.alerts.find(x => x.id === id);
    if (!a) return;
    Object.assign(a, patch);
    notify('alert:update');
  }

  function activeCameras() {
    return state.cameras.filter(c => c.online && !c.locked).length;
  }

  function filteredAlerts() {
    const f = state.filters;
    const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : 0;
    const toTs   = f.to   ? new Date(f.to   + 'T23:59:59').getTime() : Infinity;
    const q = f.search.trim().toLowerCase();
    return state.alerts.filter(a => {
      if (f.type !== 'all' && a.type !== f.type) return false;
      if (f.camera !== 'all' && a.cameraId !== f.camera) return false;
      if (f.status !== 'all' && a.status !== f.status) return false;
      if (a.ts < fromTs || a.ts > toTs) return false;
      if (q) {
        const hay = `${a.id} ${a.cameraName} ${a.typeLabel} ${a.note || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function paginatedAlerts() {
    const list = filteredAlerts();
    const { page, pageSize } = state.filters;
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return {
      items: list.slice(start, start + pageSize),
      total: list.length,
      page: p,
      totalPages
    };
  }

  VC.store = {
    state, subscribe, set, setNested, pushAlert, updateAlert,
    activeCameras, filteredAlerts, paginatedAlerts,
    reset: () => { Object.assign(state, initial); notify('reset'); }
  };
})(window.VC);