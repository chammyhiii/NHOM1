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

  function readSelectedDevice() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (error) {
      console.warn('[VC] Không thể đọc camera đã lưu', error);
      return '';
    }
  }

  function saveSelectedDevice(deviceId) {
    try {
      if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
    } catch (error) {
      console.warn('[VC] Không thể lưu camera đã chọn', error);
    }
  }

  let selectedDeviceId = readSelectedDevice();

  function isSupported() {
    return Boolean(
      window.isSecureContext &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
    );
  }

  async function refreshDevices() {
    if (!isSupported()) return [];
    devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(device => device.kind === 'videoinput');
    if (selectedDeviceId && !devices.some(device => device.deviceId === selectedDeviceId)) {
      selectedDeviceId = devices[0]?.deviceId || '';
    }
    return devices;
  }

  async function enable(deviceId = selectedDeviceId) {
    if (!isSupported()) {
      throw new Error('Trình duyệt này không hỗ trợ truy cập camera.');
    }

    stop();
    const videoConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    }
    const constraints = {
      video: videoConstraints,
      audio: false
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false
      });
    }
    const track = stream.getVideoTracks()[0];
    selectedDeviceId = track.getSettings().deviceId || deviceId || '';
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
