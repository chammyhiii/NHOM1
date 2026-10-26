"""
VigiCare — core/accounts.py
Lưu trữ tài khoản, phiên đăng nhập, đơn hàng, license key, danh bạ khẩn cấp
(dùng chung file SQLite với phần cảnh báo).
"""
import hashlib
import hmac
import secrets
import sqlite3
import string
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from .config import settings
from .plans import get_plan, plan_rank


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    license_key TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    from_plan TEXT NOT NULL DEFAULT 'free',
    license_amount INTEGER NOT NULL,
    install INTEGER NOT NULL DEFAULT 0,
    install_amount INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL,
    contact_phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    license_key TEXT,
    created_at INTEGER NOT NULL,
    claimed_at INTEGER,
    paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS licenses (
    key TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    user_id INTEGER,
    order_code TEXT,
    note TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    activated_at INTEGER
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON emergency_contacts(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

SESSION_DAYS = 30
_KEY_ALPHABET = "".join(c for c in string.ascii_uppercase + string.digits if c not in "O0I1")


def _now() -> int:
    return int(time.time() * 1000)


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()


class AccountStore:
    def __init__(self, path: Path):
        self.path = path
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
    # USERS
    # ============================================================

    @staticmethod
    def public_user(row) -> Optional[dict]:
        if not row:
            return None
        d = dict(row)
        plan = get_plan(d["plan"])
        return {
            "id": d["id"],
            "email": d["email"],
            "name": d["name"],
            "phone": d.get("phone") or "",
            "plan": plan["id"],
            "planName": plan["name"],
            "licenseKey": d.get("license_key"),
            "isAdmin": bool(d["is_admin"]),
            "createdAt": d["created_at"],
            "limits": {
                "maxCameras": plan["max_cameras"],
                "historyDays": plan["history_days"],
                "exportCsv": plan["export_csv"],
                "emergencyCall": plan["emergency_call"],
                "maxContacts": plan["max_contacts"],
            },
        }

    def create_user(self, email: str, password: str, name: str = "", phone: str = "") -> dict:
        email = email.strip().lower()
        salt = secrets.token_hex(16)
        with self._conn() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                raise ValueError("Email này đã được đăng ký")
            user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            admin_email = settings.admin_email.strip().lower()
            is_admin = (email == admin_email) if admin_email else (user_count == 0)
            cur = conn.execute(
                "INSERT INTO users (email, name, phone, password_hash, salt, plan, is_admin, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'free', ?, ?)",
                (email, name.strip(), phone.strip(), _hash_password(password, salt), salt,
                 1 if is_admin else 0, _now()),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def verify_user(self, email: str, password: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
            ).fetchone()
        if not row:
            return None
        if not hmac.compare_digest(row["password_hash"], _hash_password(password, row["salt"])):
            return None
        return dict(row)

    def get_user(self, user_id: int) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def list_users(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        return [self.public_user(r) for r in rows]

    def set_user_plan(self, user_id: int, plan: str, license_key: Optional[str] = None):
        with self._conn() as conn:
            conn.execute(
                "UPDATE users SET plan = ?, license_key = COALESCE(?, license_key) WHERE id = ?",
                (plan, license_key, user_id),
            )
            # Hủy các đơn đang chờ cho gói thấp hơn / bằng gói vừa nhận (không còn cần thiết)
            rows = conn.execute(
                "SELECT code, plan FROM orders WHERE user_id = ? AND status = 'pending'",
                (user_id,),
            ).fetchall()
            for r in rows:
                if plan_rank(r["plan"]) <= plan_rank(plan):
                    conn.execute("UPDATE orders SET status = 'cancelled' WHERE code = ?", (r["code"],))

    def users_with_feature(self, feature: str) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM users").fetchall()
        return [dict(r) for r in rows if get_plan(r["plan"]).get(feature)]

    # ============================================================
    # SESSIONS
    # ============================================================

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        now = _now()
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, user_id, now, now + SESSION_DAYS * 86400 * 1000),
            )
        return token

    def user_by_token(self, token: str) -> Optional[dict]:
        if not token:
            return None
        with self._conn() as conn:
            row = conn.execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id"
                " WHERE s.token = ? AND s.expires_at > ?",
                (token, _now()),
            ).fetchone()
        return dict(row) if row else None

    def delete_session(self, token: str):
        with self._conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

    # ============================================================
    # APP SETTINGS (tài khoản ngân hàng…)
    # ============================================================

    def get_setting(self, key: str, default: str = "") -> str:
        with self._conn() as conn:
            row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def bank_info(self) -> dict:
        return {
            "bankId": self.get_setting("bank_id", settings.bank_id or "970422"),
            "accountNo": self.get_setting("bank_account", settings.bank_account or "687269944224"),
            "accountName": self.get_setting("bank_account_name", settings.bank_account_name or "VO THI NGOC TRAM"),
        }

    # ============================================================
    # LICENSES
    # ============================================================

    @staticmethod
    def _new_key(plan: str) -> str:
        groups = ["".join(secrets.choice(_KEY_ALPHABET) for _ in range(4)) for _ in range(3)]
        return f"VGC-{plan.upper()[:3]}-" + "-".join(groups)

    def create_license(self, plan: str, note: str = "", order_code: Optional[str] = None) -> dict:
        key = self._new_key(plan)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO licenses (key, plan, status, order_code, note, created_at)"
                " VALUES (?, ?, 'unused', ?, ?, ?)",
                (key, plan, order_code, note, _now()),
            )
        return self.get_license(key)

    def get_license(self, key: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT l.*, u.email AS user_email FROM licenses l"
                " LEFT JOIN users u ON u.id = l.user_id WHERE l.key = ?",
                (key.strip().upper(),),
            ).fetchone()
        return dict(row) if row else None

    def list_licenses(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT l.*, u.email AS user_email FROM licenses l"
                " LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def activate_license(self, user_id: int, key: str) -> dict:
        lic = self.get_license(key)
        if not lic:
            raise ValueError("License key không tồn tại")
        if lic["status"] != "unused":
            raise ValueError("License key này đã được sử dụng")
        user = self.get_user(user_id)
        if plan_rank(lic["plan"]) <= plan_rank(user["plan"]):
            raise ValueError(f"Tài khoản đã ở gói {get_plan(user['plan'])['name']} — không cần kích hoạt key này")
        with self._conn() as conn:
            conn.execute(
                "UPDATE licenses SET status = 'active', user_id = ?, activated_at = ? WHERE key = ?",
                (user_id, _now(), lic["key"]),
            )
        self.set_user_plan(user_id, lic["plan"], lic["key"])
        return self.get_license(lic["key"])

    # ============================================================
    # ORDERS
    # ============================================================

    def create_order(self, user_id: int, plan: str, from_plan: str, license_amount: int,
                     install: bool, install_amount: int, contact_phone: str = "",
                     address: str = "", note: str = "") -> dict:
        with self._conn() as conn:
            # Hủy các đơn cũ đang chờ của user (tránh chuyển nhầm)
            conn.execute(
                "UPDATE orders SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'",
                (user_id,),
            )
            while True:
                code = "VGC" + "".join(secrets.choice(string.digits) for _ in range(6))
                if not conn.execute("SELECT 1 FROM orders WHERE code = ?", (code,)).fetchone():
                    break
            conn.execute(
                "INSERT INTO orders (code, user_id, plan, from_plan, license_amount, install,"
                " install_amount, amount, contact_phone, address, note, status, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                (code, user_id, plan, from_plan, license_amount, 1 if install else 0,
                 install_amount, license_amount + install_amount, contact_phone.strip(),
                 address.strip(), note.strip(), _now()),
            )
        return self.get_order(code)

    def get_order(self, code: str) -> Optional[dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT o.*, u.email AS user_email, u.name AS user_name FROM orders o"
                " JOIN users u ON u.id = o.user_id WHERE o.code = ?",
                (code.strip().upper(),),
            ).fetchone()
        return self._order_dict(row) if row else None

    def list_orders(self, user_id: Optional[int] = None, status: Optional[str] = None) -> list[dict]:
        q = ("SELECT o.*, u.email AS user_email, u.name AS user_name FROM orders o"
             " JOIN users u ON u.id = o.user_id WHERE 1=1")
        params: list = []
        if user_id is not None:
            q += " AND o.user_id = ?"
            params.append(user_id)
        if status and status != "all":
            q += " AND o.status = ?"
            params.append(status)
        q += " ORDER BY o.created_at DESC LIMIT 500"
        with self._conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._order_dict(r) for r in rows]

    def update_order(self, code: str, **fields) -> Optional[dict]:
        if not fields:
            return self.get_order(code)
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self._conn() as conn:
            conn.execute(f"UPDATE orders SET {cols} WHERE code = ?", (*fields.values(), code))
        return self.get_order(code)

    def confirm_order(self, code: str) -> dict:
        order = self.get_order(code)
        if not order:
            raise ValueError("Không tìm thấy đơn hàng")
        if order["status"] == "paid":
            raise ValueError("Đơn này đã được xác nhận trước đó")
        if order["status"] in ("rejected", "cancelled"):
            raise ValueError("Đơn đã bị hủy / từ chối")
        lic = self.create_license(order["plan"], note=f"Đơn {order['code']}", order_code=order["code"])
        with self._conn() as conn:
            conn.execute(
                "UPDATE licenses SET status = 'active', user_id = ?, activated_at = ? WHERE key = ?",
                (order["userId"], _now(), lic["key"]),
            )
        user = self.get_user(order["userId"])
        if plan_rank(order["plan"]) > plan_rank(user["plan"]):
            self.set_user_plan(order["userId"], order["plan"], lic["key"])
        return self.update_order(order["code"], status="paid", paid_at=_now(), license_key=lic["key"])

    @staticmethod
    def _order_dict(row) -> dict:
        d = dict(row)
        return {
            "code": d["code"],
            "userId": d["user_id"],
            "userEmail": d.get("user_email"),
            "userName": d.get("user_name"),
            "plan": d["plan"],
            "planName": get_plan(d["plan"])["name"],
            "fromPlan": d["from_plan"],
            "licenseAmount": d["license_amount"],
            "install": bool(d["install"]),
            "installAmount": d["install_amount"],
            "amount": d["amount"],
            "contactPhone": d["contact_phone"],
            "address": d["address"],
            "note": d["note"],
            "status": d["status"],
            "licenseKey": d["license_key"],
            "createdAt": d["created_at"],
            "claimedAt": d["claimed_at"],
            "paidAt": d["paid_at"],
        }

    def revenue_stats(self) -> dict:
        with self._conn() as conn:
            paid = conn.execute(
                "SELECT COALESCE(SUM(amount),0), COALESCE(SUM(license_amount),0),"
                " COALESCE(SUM(install_amount),0), COUNT(*) FROM orders WHERE status = 'paid'"
            ).fetchone()
            by_plan = conn.execute(
                "SELECT plan, COUNT(*) AS n, SUM(amount) AS total FROM orders"
                " WHERE status = 'paid' GROUP BY plan"
            ).fetchall()
            waiting = conn.execute(
                "SELECT COUNT(*) FROM orders WHERE status IN ('pending','claimed')"
            ).fetchone()[0]
            claimed = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'claimed'").fetchone()[0]
            users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            paying = conn.execute("SELECT COUNT(*) FROM users WHERE plan != 'free'").fetchone()[0]
            month_start = int(time.mktime(time.localtime()[:2] + (1, 0, 0, 0, 0, 0, -1)) * 1000)
            month = conn.execute(
                "SELECT COALESCE(SUM(amount),0) FROM orders WHERE status = 'paid' AND paid_at >= ?",
                (month_start,),
            ).fetchone()[0]
        return {
            "revenue": paid[0],
            "licenseRevenue": paid[1],
            "installRevenue": paid[2],
            "paidOrders": paid[3],
            "revenueThisMonth": month,
            "byPlan": {r["plan"]: {"count": r["n"], "total": r["total"]} for r in by_plan},
            "waitingOrders": waiting,
            "claimedOrders": claimed,
            "users": users,
            "payingUsers": paying,
            "conversionRate": round(paying / users, 4) if users else 0,
        }

    # ============================================================
    # EMERGENCY CONTACTS
    # ============================================================

    def list_contacts(self, user_id: int) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY id", (user_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def add_contact(self, user_id: int, name: str, phone: str, relation: str = "") -> dict:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO emergency_contacts (user_id, name, phone, relation, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (user_id, name.strip(), phone.strip(), relation.strip(), _now()),
            )
            row = conn.execute("SELECT * FROM emergency_contacts WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def delete_contact(self, user_id: int, contact_id: int) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?", (contact_id, user_id)
            )
        return cur.rowcount > 0


accounts = AccountStore(settings.db_path)
