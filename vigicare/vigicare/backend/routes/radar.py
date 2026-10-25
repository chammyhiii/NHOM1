"""
SafeZone-HD — routes/radar.py
Scan WiFi quanh máy + ước lượng vị trí thiết bị
"""
import subprocess
import re
import math
import time
import asyncio
from typing import Optional

from fastapi import APIRouter, Query

from core.storage import storage
from core.logger import log


router = APIRouter(prefix="/api/radar", tags=["radar"])

_last_scan_ts = 0
_last_scan_count = 0


# ============================================================
# SCAN WIFI
# ============================================================

def _scan_wifi_windows() -> list[dict]:
    """Scan WiFi trên Windows dùng netsh."""
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "networks", "mode=bssid"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        if result.returncode != 0:
            log.warning(f"[radar] netsh failed: {result.stderr[:200]}")
            return []
        return _parse_netsh_output(result.stdout)
    except Exception as e:
        log.error(f"[radar] Scan error: {e}")
        return []


def _parse_netsh_output(output: str) -> list[dict]:
    """Parse output của netsh wlan show networks mode=bssid."""
    networks = []
    current_ssid = None
    current_bssid = None
    current_signal = None
    current_channel = None

    for line in output.splitlines():
        line = line.strip()

        m = re.match(r"^SSID\s+\d+\s*:\s*(.+)$", line)
        if m:
            if current_ssid and current_bssid:
                networks.append(_build_network(
                    current_ssid, current_bssid, current_signal, current_channel
                ))
            current_ssid = m.group(1).strip()
            current_bssid = None
            current_signal = None
            current_channel = None
            continue

        m = re.match(r"^BSSID\s+\d+\s*:\s*(.+)$", line)
        if m:
            if current_ssid and current_bssid:
                networks.append(_build_network(
                    current_ssid, current_bssid, current_signal, current_channel
                ))
            current_bssid = m.group(1).strip()
            current_signal = None
            current_channel = None
            continue

        m = re.match(r"^Signal\s*:\s*(\d+)%", line)
        if m:
            current_signal = int(m.group(1))
            continue

        m = re.match(r"^Channel\s*:\s*(\d+)", line)
        if m:
            current_channel = int(m.group(1))
            continue

    if current_ssid and current_bssid:
        networks.append(_build_network(
            current_ssid, current_bssid, current_signal, current_channel
        ))

    return networks


def _build_network(ssid: str, bssid: str, signal: Optional[int], channel: Optional[int]) -> dict:
    # Signal % → dBm
    rssi = (signal / 2 - 100) if signal is not None else -100

    # Channel → frequency
    freq = 2412
    if channel:
        if channel <= 14:
            freq = 2407 + channel * 5
        else:
            freq = 5000 + channel * 5

    return {
        "ssid": ssid or "<hidden>",
        "bssid": bssid.lower(),
        "signal_percent": signal or 0,
        "rssi": int(rssi),
        "channel": channel,
        "frequency": freq,
    }


def _estimate_distance(rssi: int) -> float:
    """Path Loss Model: d = 10^((tx_power - rssi) / (10 * n))"""
    if rssi >= -45:
        return 1.0
    d = math.pow(10, (-45 - rssi) / 25)
    return min(d, 50.0)


def _estimate_position(rssi: int, idx: int) -> tuple[float, float]:
    """Vị trí ước lượng trên vòng tròn bán kính = distance, góc theo idx."""
    dist = _estimate_distance(rssi)
    angle = (idx * 137.5) * math.pi / 180
    x = dist * math.cos(angle)
    y = dist * math.sin(angle)
    return round(x, 2), round(y, 2)


def _point_in_polygon(px: float, py: float, polygon: list) -> bool:
    """Ray casting."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]
        if ((yi > py) != (yj > py)) and \
           (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def _is_in_danger_zone(x: float, y: float, zones: list[dict]) -> bool:
    for z in zones:
        polygon = z.get("polygon", [])
        if len(polygon) < 3:
            continue
        # Scale zone polygon từ pixel 1280x720 → mét (giả định 50m)
        scaled = [(p[0] / 1280 * 100 - 50, p[1] / 720 * 100 - 50) for p in polygon]
        if _point_in_polygon(x, y, scaled):
            return True
    return False


async def _do_scan() -> int:
    global _last_scan_ts, _last_scan_count

    loop = asyncio.get_event_loop()
    networks = await loop.run_in_executor(None, _scan_wifi_windows)

    zones = storage.list_zones(enabled_only=True)

    for idx, net in enumerate(networks):
        x, y = _estimate_position(net["rssi"], idx)
        in_danger = _is_in_danger_zone(x, y, zones)

        storage.upsert_wifi_device({
            "mac_address": net["bssid"],
            "ssid": net["ssid"],
            "vendor": "",
            "rssi": net["rssi"],
            "frequency": net["frequency"],
            "estimated_x": x,
            "estimated_y": y,
            "in_danger_zone": in_danger,
        })

    _last_scan_ts = int(time.time() * 1000)
    _last_scan_count = len(networks)

    log.info(f"[radar] Scanned {len(networks)} devices")
    return len(networks)


# ============================================================
# ROUTES
# ============================================================

@router.get("/devices")
async def list_devices(active_seconds: int = Query(60, ge=10, le=600)):
    items = storage.list_wifi_devices(active_seconds=active_seconds)
    return {"items": items, "total": len(items)}


@router.post("/scan")
async def scan_now():
    start = time.time()
    count = await _do_scan()
    duration_ms = int((time.time() - start) * 1000)
    return {"scanned": count, "duration_ms": duration_ms}


@router.get("/status")
async def radar_status():
    devices = storage.list_wifi_devices(active_seconds=60)
    return {
        "running": True,
        "last_scan_ts": _last_scan_ts,
        "total_devices": len(devices),
        "in_danger": len([d for d in devices if d.get("in_danger_zone")]),
    }