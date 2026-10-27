(function (VC) {
  'use strict';

  const STORAGE_KEY = 'vigicare.camera.device';
  const CLIENT_ID_KEY = 'vigicare.private.client_id';
  let stream = null;
  let devices = [];
  let uploadTimer = null;
  let offscreenCanvas = null;
  let isUploading = false;

  function getPrivateClientId() {
    try {
      let cid = sessionStorage.getItem(CLIENT_ID_KEY);
      if (!cid) {
        cid = 'vc-priv-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
        sessionStorage.setItem(CLIENT_ID_KEY, cid);
      }
      return cid;
    } catch (e) {
      return 'vc-priv-' + Math.random().toString(36).slice(2, 10);
    }
  }

  const privateClientId = getPrivateClientId();

  function sanitizeDeviceId(id) {
    if (!id || typeof id !== 'string') return '';
    if (id === 'default' || id.includes(' ') || id.length < 4) return '';
    return id;
  }

  function readSelectedDevice() {
    try {
      return sanitizeDeviceId(localStorage.getItem(STORAGE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function saveSelectedDevice(deviceId) {
    try {
      const clean = sanitizeDeviceId(deviceId);
      if (clean) localStorage.setItem(STORAGE_KEY, clean);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  let selectedDeviceId = readSelectedDevice();

  function isSupported() {
    return Boolean(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  async function refreshDevices() {
    if (!isSupported() || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter(device => device.kind === 'videoinput');
      if (selectedDeviceId && !devices.some(device => device.deviceId === selectedDeviceId)) {
        selectedDeviceId = sanitizeDeviceId(devices[0]?.deviceId || '');
      }
      return devices;
    } catch (e) {
      return [];
    }
  }

  async function requestBrowserStream(cleanId) {
    const videoConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
    if (cleanId) {
      videoConstraints.deviceId = { ideal: cleanId };
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
    } catch (e) {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }
  }

  async function enable(requestedDeviceId = selectedDeviceId) {
    if (!isSupported()) {
      throw new Error('Trình duyệt không hỗ trợ WebRTC Camera (hãy mở bằng HTTPS hoặc localhost / 127.0.0.1).');
    }

    const cleanId = sanitizeDeviceId(requestedDeviceId);
    stop();

    // Giải phóng cv2.VideoCapture(0) trên backend (nếu server chạy cùng máy Windows đang giữ độc quyền webcam)
    try {
      if (VC.api && VC.api.url) {
        await fetch(VC.api.url('/api/cameras/control/off'), { method: 'POST' });
      }
    } catch (e) {
      /* ignore */
    }

    try {
      stream = await requestBrowserStream(cleanId);
    } catch (err1) {
      // Nếu Windows vừa nhả driver webcam từ tiến trình Python, đợi 650ms rồi mở lại
      await new Promise(r => setTimeout(r, 650));
      stream = await requestBrowserStream('');
    }

    const track = stream.getVideoTracks()[0];
    const settings = (track && track.getSettings) ? track.getSettings() : {};
    selectedDeviceId = sanitizeDeviceId(settings.deviceId || cleanId || '');
    saveSelectedDevice(selectedDeviceId);
    await refreshDevices();

    if (VC.store && VC.store.state) {
      VC.store.state.cameraOn = true;
    }
    return stream;
  }

  function startFrameUploader(video) {
    stopFrameUploader();
    if (!video) return;

    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
    }

    // Gửi frame định kỳ ở chế độ PRIVATE (kèm X-Client-Id riêng của trình duyệt này)
    uploadTimer = setInterval(() => {
      if (isUploading || !isActive() || !video.videoWidth || !video.videoHeight) return;

      const maxDim = 800;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      offscreenCanvas.width = w;
      offscreenCanvas.height = h;
      const ctx = offscreenCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      isUploading = true;
      offscreenCanvas.toBlob((blob) => {
        if (!blob || !isActive()) {
          isUploading = false;
          return;
        }
        fetch(VC.api.url('/api/stream/upload_frame'), {
          method: 'POST',
          headers: {
            'Content-Type': 'image/jpeg',
            'X-Client-Id': privateClientId
          },
          body: blob
        })
          .then(r => (r.ok ? r.json() : null))
          .then(res => {
            if (!res || !res.ok || !isActive()) return;
            if (Array.isArray(res.detections) && VC.api.emitRealtimeDetections) {
              VC.api.emitRealtimeDetections(res);
            }
            if (Array.isArray(res.alerts) && res.alerts.length && VC.api.emitRealtimeAlert) {
              res.alerts.forEach(a => VC.api.emitRealtimeAlert(a));
            }
          })
          .catch(() => {})
          .finally(() => {
            isUploading = false;
          });
      }, 'image/jpeg', 0.78);
    }, 110);
  }

  function stopFrameUploader() {
    if (uploadTimer) {
      clearInterval(uploadTimer);
      uploadTimer = null;
    }
    isUploading = false;
  }

  function attach(video, withAi = true) {
    if (!video || !stream) return false;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});
    if (withAi) startFrameUploader(video);
    return true;
  }

  function stop() {
    stopFrameUploader();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    stream = null;
    if (VC.store && VC.store.state) {
      VC.store.state.cameraOn = false;
    }
  }

  function isActive() {
    return Boolean(stream && stream.getVideoTracks().some(track => track.readyState === 'live'));
  }

  function currentDeviceId() {
    return selectedDeviceId;
  }

  function getDevices() {
    return devices.slice();
  }

  if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener?.('devicechange', async () => {
      await refreshDevices();
      window.dispatchEvent(new CustomEvent('vigicare:cameras-changed'));
    });
  }

  VC.camera = {
    isSupported,
    refreshDevices,
    enable,
    attach,
    stop,
    isActive,
    currentDeviceId,
    getDevices,
    clientId: privateClientId
  };
})(window.VC);
