import sqlite3
import json
import time
import uuid
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    type_label TEXT NOT NULL,
    severity TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    zone TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT DEFAULT '',
    ts INTEGER NOT NULL,
    resolved_at INTEGER,
    snapshot_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

CREATE TABLE IF NOT EXISTS health_checks (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    age INTEGER,
    gender TEXT,
    weight_kg REAL,
    height_cm REAL,
    bmi REAL,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    heart_rate INTEGER,
    blood_sugar REAL,
    smoker INTEGER DEFAULT 0,
    family_history INTEGER DEFAULT 0,
    fast_face INTEGER DEFAULT 0,
    fast_arm INTEGER DEFAULT 0,
    fast_speech INTEGER DEFAULT 0,
    symptoms TEXT DEFAULT '[]',
    risk_score REAL,
    risk_level TEXT,
    notes TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_health_ts ON health_checks(ts DESC);

CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    camera_id TEXT NOT NULL,
    polygon TEXT NOT NULL,
    severity TEXT DEFAULT 'high',
    max_dwell_seconds INTEGER DEFAULT 30,
    enabled INTEGER DEFAULT 1,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zones_enabled ON zones(enabled);

CREATE TABLE IF NOT EXISTS zone_events (
    id TEXT PRIMARY KEY,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    track_id INTEGER,
    enter_ts INTEGER NOT NULL,
    exit_ts INTEGER,
    max_dwell_seconds REAL DEFAULT 0,
    peak_status TEXT DEFAULT 'warning',
    snapshot_path TEXT,
    resolved INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_zone_events_ts ON zone_events(enter_ts DESC);
CREATE INDEX IF NOT EXISTS idx_zone_events_zone ON zone_events(zone_id);

CREATE TABLE IF NOT EXISTS wifi_devices (
    mac_address TEXT PRIMARY KEY,
    ssid TEXT DEFAULT '',
    vendor TEXT DEFAULT '',
    rssi INTEGER,
    frequency INTEGER,
    last_seen_ts INTEGER NOT NULL,
    estimated_x REAL,
    estimated_y REAL,
    in_danger_zone INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wifi_last_seen ON wifi_devices(last_seen_ts DESC);
"""


ALERT_LABELS = {
    "fall":          {"label": "Té ngã",                "severity": "danger"},
    "stroke":        {"label": "Nghi đột quỵ",           "severity": "danger"},
    "abnormal":      {"label": "Bất thường",             "severity": "warn"},
    "inactive":      {"label": "Không hoạt động",        "severity": "warn"},
    "zone_enter":    {"label": "Xâm nhập vùng cấm",      "severity": "warn"},
    "zone_dwell":    {"label": "Đứng lâu trong vùng cấm", "severity": "danger"},
    "zone_critical": {"label": "KHẨN CẤP — Vùng cấm",    "severity": "danger"},
    "zone_exit":     {"label": "Đã rời vùng cấm",        "severity": "ok"},
}


class Storage:
    def __init__(self, path: Path):
        self.path = path
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ============================================================
    # ALERTS
    # ============================================================

    def create_alert(
        self,
        alert_type: str,
        camera_id: str,
        camera_name: str,
        zone: str,
        confidence: float,
        note: str = "",
        snapshot_path: Optional[str] = None,
        ts: Optional[int] = None,
    ) -> dict:
        meta = ALERT_LABELS.get(alert_type, ALERT_LABELS["abnormal"])
        alert = {
            "id": "AL-" + uuid.uuid4().hex[:8].upper(),
            "type": alert_type,
            "typeLabel": meta["label"],
            "severity": meta["severity"],
            "cameraId": camera_id,
            "cameraName": camera_name,
            "zone": zone,
            "confidence": round(float(confidence), 3),
            "status": "pending",
            "note": note,
            "ts": ts or int(time.time() * 1000),
            "resolvedAt": None,
            "snapshotPath": snapshot_path,
        }
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO alerts
                   (id, type, type_label, severity, camera_id, camera_name, zone,
                    confidence, status, note, ts, resolved_at, snapshot_path)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    alert["id"], alert["type"], alert["typeLabel"], alert["severity"],
                    alert["cameraId"], alert["cameraName"], alert["zone"],
                    alert["confidence"], alert["status"], alert["note"],
                    alert["ts"], None, snapshot_path,
                ),
            )
        return alert

    def list_alerts(
        self,
        limit: int = 200,
        offset: int = 0,
        alert_type: Optional[str] = None,
        camera_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        q = "SELECT * FROM alerts WHERE 1=1"
        params: list = []
        if alert_type and alert_type != "all":
            q += " AND type = ?"
            params.append(alert_type)
        if camera_id and camera_id != "all":
            q += " AND camera_id = ?"
            params.append(camera_id)
        if status and status != "all":
            q += " AND status = ?"
            params.append(status)
        q += " ORDER BY ts DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_alert(self, alert_id: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        return self._row_to_dict(row) if row else None

    def update_status(self, alert_id: str, status: str) -> Optional[dict]:
        resolved_at = int(time.time() * 1000) if status in ("resolved", "dismissed") else None
        with self._conn() as conn:
            cur = conn.execute(
                "UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?",
                (status, resolved_at, alert_id),
            )
            if cur.rowcount == 0:
                return None
        return self.get_alert(alert_id)

    def stats(self) -> dict:
        day_start = int((time.time() // 86400) * 86400 * 1000)
        with self._conn() as conn:
            total_today = conn.execute(
                "SELECT COUNT(*) FROM alerts WHERE ts >= ?", (day_start,)
            ).fetchone()[0]
            total_all = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
            resolved = conn.execute(
                "SELECT COUNT(*) FROM alerts WHERE status = 'resolved'"
            ).fetchone()[0]
            pending = conn.execute(
                "SELECT COUNT(*) FROM alerts WHERE status IN ('pending','processing')"
            ).fetchone()[0]
        return {
            "totalToday": total_today,
            "totalAll": total_all,
            "resolved": resolved,
            "pending": pending,
            "dayStart": day_start,
        }

    def delete_all(self) -> int:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM alerts")
        return cur.rowcount

    # ============================================================
    # HEALTH CHECKS
    # ============================================================

    def create_health_check(self, data: dict) -> dict:
        record = {
            "id": "HC-" + uuid.uuid4().hex[:8].upper(),
            "ts": data.get("ts") or int(time.time() * 1000),
            "age": data.get("age"),
            "gender": data.get("gender"),
            "weight_kg": data.get("weight_kg"),
            "height_cm": data.get("height_cm"),
            "bmi": data.get("bmi"),
            "bp_systolic": data.get("bp_systolic"),
            "bp_diastolic": data.get("bp_diastolic"),
            "heart_rate": data.get("heart_rate"),
            "blood_sugar": data.get("blood_sugar"),
            "smoker": 1 if data.get("smoker") else 0,
            "family_history": 1 if data.get("family_history") else 0,
            "fast_face": 1 if data.get("fast_face") else 0,
            "fast_arm": 1 if data.get("fast_arm") else 0,
            "fast_speech": 1 if data.get("fast_speech") else 0,
            "symptoms": json.dumps(data.get("symptoms", []), ensure_ascii=False),
            "risk_score": data.get("risk_score"),
            "risk_level": data.get("risk_level"),
            "notes": data.get("notes", ""),
        }
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO health_checks
                   (id, ts, age, gender, weight_kg, height_cm, bmi,
                    bp_systolic, bp_diastolic, heart_rate, blood_sugar,
                    smoker, family_history,
                    fast_face, fast_arm, fast_speech,
                    symptoms, risk_score, risk_level, notes)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    record["id"], record["ts"], record["age"], record["gender"],
                    record["weight_kg"], record["height_cm"], record["bmi"],
                    record["bp_systolic"], record["bp_diastolic"],
                    record["heart_rate"], record["blood_sugar"],
                    record["smoker"], record["family_history"],
                    record["fast_face"], record["fast_arm"], record["fast_speech"],
                    record["symptoms"], record["risk_score"], record["risk_level"],
                    record["notes"],
                ),
            )
        return self.get_health_check(record["id"])

    def list_health_checks(self, limit: int = 50, offset: int = 0) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM health_checks ORDER BY ts DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [self._health_row_to_dict(r) for r in rows]

    def get_health_check(self, check_id: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM health_checks WHERE id = ?", (check_id,)
            ).fetchone()
        return self._health_row_to_dict(row) if row else None

    def delete_health_check(self, check_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM health_checks WHERE id = ?", (check_id,))
        return cur.rowcount > 0

    @staticmethod
    def _health_row_to_dict(row) -> dict:
        symptoms = []
        try:
            symptoms = json.loads(row["symptoms"] or "[]")
        except Exception:
            pass
        return {
            "id": row["id"],
            "ts": row["ts"],
            "age": row["age"],
            "gender": row["gender"],
            "weight_kg": row["weight_kg"],
            "height_cm": row["height_cm"],
            "bmi": row["bmi"],
            "bp_systolic": row["bp_systolic"],
            "bp_diastolic": row["bp_diastolic"],
            "heart_rate": row["heart_rate"],
            "blood_sugar": row["blood_sugar"],
            "smoker": bool(row["smoker"]),
            "family_history": bool(row["family_history"]),
            "fast_face": bool(row["fast_face"]),
            "fast_arm": bool(row["fast_arm"]),
            "fast_speech": bool(row["fast_speech"]),
            "symptoms": symptoms,
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "notes": row["notes"] or "",
        }

    # ============================================================
    # ZONES (vùng cấm)
    # ============================================================

    def create_zone(self, data: dict) -> dict:
        zone = {
            "id": "ZN-" + uuid.uuid4().hex[:6].upper(),
            "name": data.get("name", "Vùng cấm"),
            "description": data.get("description", ""),
            "camera_id": data.get("camera_id", "cam-01"),
            "polygon": json.dumps(data.get("polygon", []), ensure_ascii=False),
            "severity": data.get("severity", "high"),
            "max_dwell_seconds": int(data.get("max_dwell_seconds", 30)),
            "enabled": 1 if data.get("enabled", True) else 0,
            "ts": int(time.time() * 1000),
        }
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO zones
                   (id, name, description, camera_id, polygon,
                    severity, max_dwell_seconds, enabled, ts)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (zone["id"], zone["name"], zone["description"], zone["camera_id"],
                 zone["polygon"], zone["severity"], zone["max_dwell_seconds"],
                 zone["enabled"], zone["ts"]),
            )
        return self.get_zone(zone["id"])

    def list_zones(self, enabled_only: bool = False) -> list[dict]:
        q = "SELECT * FROM zones"
        if enabled_only:
            q += " WHERE enabled = 1"
        q += " ORDER BY ts DESC"
        with self._conn() as conn:
            rows = conn.execute(q).fetchall()
        return [self._zone_row_to_dict(r) for r in rows]

    def get_zone(self, zone_id: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM zones WHERE id = ?", (zone_id,)).fetchone()
        return self._zone_row_to_dict(row) if row else None

    def update_zone(self, zone_id: str, data: dict) -> Optional[dict]:
        fields = []
        params = []
        for key in ("name", "description", "severity", "max_dwell_seconds", "enabled"):
            if key in data:
                if key == "enabled":
                    fields.append("enabled = ?")
                    params.append(1 if data[key] else 0)
                else:
                    fields.append(f"{key} = ?")
                    params.append(data[key])
        if "polygon" in data:
            fields.append("polygon = ?")
            params.append(json.dumps(data["polygon"], ensure_ascii=False))
        if not fields:
            return self.get_zone(zone_id)
        params.append(zone_id)
        with self._conn() as conn:
            cur = conn.execute(
                f"UPDATE zones SET {', '.join(fields)} WHERE id = ?", params
            )
            if cur.rowcount == 0:
                return None
        return self.get_zone(zone_id)

    def delete_zone(self, zone_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM zones WHERE id = ?", (zone_id,))
        return cur.rowcount > 0

    @staticmethod
    def _zone_row_to_dict(row) -> dict:
        try:
            polygon = json.loads(row["polygon"] or "[]")
        except Exception:
            polygon = []
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"] or "",
            "cameraId": row["camera_id"],
            "polygon": polygon,
            "severity": row["severity"],
            "maxDwellSeconds": row["max_dwell_seconds"],
            "enabled": bool(row["enabled"]),
            "ts": row["ts"],
        }

    # ============================================================
    # ZONE EVENTS (lịch sử xâm nhập)
    # ============================================================

    def create_zone_event(self, data: dict) -> dict:
        event = {
            "id": "ZE-" + uuid.uuid4().hex[:8].upper(),
            "zone_id": data["zone_id"],
            "zone_name": data.get("zone_name", ""),
            "camera_id": data.get("camera_id", "cam-01"),
            "track_id": data.get("track_id"),
            "enter_ts": data.get("enter_ts") or int(time.time() * 1000),
            "snapshot_path": data.get("snapshot_path"),
        }
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO zone_events
                   (id, zone_id, zone_name, camera_id, track_id,
                    enter_ts, exit_ts, max_dwell_seconds, peak_status,
                    snapshot_path, resolved)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (event["id"], event["zone_id"], event["zone_name"],
                 event["camera_id"], event["track_id"], event["enter_ts"],
                 None, 0.0, "warning", event["snapshot_path"], 0),
            )
        return self.get_zone_event(event["id"])

    def update_zone_event(self, event_id: str, data: dict) -> Optional[dict]:
        fields = []
        params = []
        for k in ("exit_ts", "max_dwell_seconds", "peak_status", "snapshot_path", "resolved"):
            if k in data:
                fields.append(f"{k} = ?")
                params.append(data[k])
        if not fields:
            return self.get_zone_event(event_id)
        params.append(event_id)
        with self._conn() as conn:
            conn.execute(f"UPDATE zone_events SET {', '.join(fields)} WHERE id = ?", params)
        return self.get_zone_event(event_id)

    def get_zone_event(self, event_id: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM zone_events WHERE id = ?", (event_id,)).fetchone()
        return self._zone_event_row_to_dict(row) if row else None

    def list_zone_events(
        self,
        limit: int = 100,
        offset: int = 0,
        zone_id: Optional[str] = None,
    ) -> list[dict]:
        q = "SELECT * FROM zone_events WHERE 1=1"
        params: list = []
        if zone_id:
            q += " AND zone_id = ?"
            params.append(zone_id)
        q += " ORDER BY enter_ts DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._zone_event_row_to_dict(r) for r in rows]

    def zone_stats(self) -> dict:
        day_start = int((time.time() // 86400) * 86400 * 1000)
        with self._conn() as conn:
            total_today = conn.execute(
                "SELECT COUNT(*) FROM zone_events WHERE enter_ts >= ?", (day_start,)
            ).fetchone()[0]
            total_all = conn.execute("SELECT COUNT(*) FROM zone_events").fetchone()[0]
            critical = conn.execute(
                "SELECT COUNT(*) FROM zone_events WHERE peak_status = 'critical'"
            ).fetchone()[0]
            max_dwell = conn.execute(
                "SELECT MAX(max_dwell_seconds) FROM zone_events"
            ).fetchone()[0] or 0
        return {
            "totalToday": total_today,
            "totalAll": total_all,
            "critical": critical,
            "maxDwell": round(max_dwell, 1),
        }

    @staticmethod
    def _zone_event_row_to_dict(row) -> dict:
        return {
            "id": row["id"],
            "zoneId": row["zone_id"],
            "zoneName": row["zone_name"],
            "cameraId": row["camera_id"],
            "trackId": row["track_id"],
            "enterTs": row["enter_ts"],
            "exitTs": row["exit_ts"],
            "maxDwellSeconds": row["max_dwell_seconds"],
            "peakStatus": row["peak_status"],
            "snapshotPath": row["snapshot_path"],
            "resolved": bool(row["resolved"]),
        }

    # ============================================================
    # WIFI DEVICES (radar)
    # ============================================================

    def upsert_wifi_device(self, data: dict):
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO wifi_devices
                   (mac_address, ssid, vendor, rssi, frequency,
                    last_seen_ts, estimated_x, estimated_y, in_danger_zone)
                   VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(mac_address) DO UPDATE SET
                     ssid = excluded.ssid,
                     vendor = excluded.vendor,
                     rssi = excluded.rssi,
                     frequency = excluded.frequency,
                     last_seen_ts = excluded.last_seen_ts,
                     estimated_x = excluded.estimated_x,
                     estimated_y = excluded.estimated_y,
                     in_danger_zone = excluded.in_danger_zone""",
                (data["mac_address"], data.get("ssid", ""), data.get("vendor", ""),
                 data.get("rssi"), data.get("frequency"),
                 int(time.time() * 1000),
                 data.get("estimated_x"), data.get("estimated_y"),
                 1 if data.get("in_danger_zone") else 0),
            )

    def list_wifi_devices(self, active_seconds: int = 60) -> list[dict]:
        cutoff = int(time.time() * 1000) - active_seconds * 1000
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM wifi_devices WHERE last_seen_ts >= ? ORDER BY rssi DESC",
                (cutoff,),
            ).fetchall()
        return [dict(r) for r in rows]

    def clear_stale_wifi(self, seconds: int = 300):
        cutoff = int(time.time() * 1000) - seconds * 1000
        with self._conn() as conn:
            conn.execute("DELETE FROM wifi_devices WHERE last_seen_ts < ?", (cutoff,))

    # ============================================================
    # HELPERS
    # ============================================================

    @staticmethod
    def _row_to_dict(row) -> dict:
        return {
            "id": row["id"],
            "type": row["type"],
            "typeLabel": row["type_label"],
            "severity": row["severity"],
            "cameraId": row["camera_id"],
            "cameraName": row["camera_name"],
            "zone": row["zone"],
            "confidence": row["confidence"],
            "status": row["status"],
            "note": row["note"] or "",
            "ts": row["ts"],
            "resolvedAt": row["resolved_at"],
            "snapshotPath": row["snapshot_path"],
        }


storage = Storage(settings.db_path)