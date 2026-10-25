from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from core.storage import storage
from core.logger import log


router = APIRouter(prefix="/api/health-check", tags=["health-check"])


# ============================================================
# Schemas
# ============================================================

class HealthCheckBody(BaseModel):
    # Thông tin cơ bản
    age: Optional[int] = Field(None, ge=0, le=120)
    gender: Optional[str] = None            # "male" / "female" / "other"
    weight_kg: Optional[float] = Field(None, ge=0, le=300)
    height_cm: Optional[float] = Field(None, ge=50, le=250)

    # Chỉ số y tế
    bp_systolic: Optional[int] = Field(None, ge=50, le=300)
    bp_diastolic: Optional[int] = Field(None, ge=30, le=200)
    heart_rate: Optional[int] = Field(None, ge=20, le=250)
    blood_sugar: Optional[float] = Field(None, ge=0, le=50)  # mmol/L

    smoker: bool = False
    family_history: bool = False

    # Test FAST
    fast_face: bool = False         # Mặt méo / xệ
    fast_arm: bool = False          # Không giơ được 2 tay
    fast_speech: bool = False       # Nói ngọng / líu lưỡi

    # Triệu chứng (list string)
    symptoms: list[str] = []

    # Ghi chú
    notes: str = ""


# ============================================================
# Logic đánh giá nguy cơ
# ============================================================

def compute_bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    if not weight_kg or not height_cm:
        return None
    h = height_cm / 100.0
    if h <= 0:
        return None
    return round(weight_kg / (h * h), 1)


def compute_risk_score(data: dict) -> tuple[float, str]:
    """
    Tính điểm nguy cơ đột quỵ (thang 0-100).
    Công thức tham khảo Framingham Stroke Risk + yếu tố lâm sàng.

    Trả về (score, level).
    """
    score = 0.0

    # ---------- Yếu tố không thể thay đổi ----------
    age = data.get("age") or 0
    if age >= 75:
        score += 20
    elif age >= 65:
        score += 15
    elif age >= 55:
        score += 10
    elif age >= 45:
        score += 5

    if data.get("gender") == "male":
        score += 5

    if data.get("family_history"):
        score += 8

    # ---------- Chỉ số y tế ----------
    bmi = data.get("bmi")
    if bmi:
        if bmi >= 30:
            score += 10
        elif bmi >= 25:
            score += 5

    sys_bp = data.get("bp_systolic") or 0
    dia_bp = data.get("bp_diastolic") or 0
    if sys_bp >= 180 or dia_bp >= 110:
        score += 20   # Tăng huyết áp độ 3
    elif sys_bp >= 160 or dia_bp >= 100:
        score += 15
    elif sys_bp >= 140 or dia_bp >= 90:
        score += 10
    elif sys_bp >= 130 or dia_bp >= 85:
        score += 5

    hr = data.get("heart_rate") or 0
    if hr >= 100:
        score += 5   # Nhịp nhanh
    elif hr and hr <= 50:
        score += 3   # Nhịp chậm

    sugar = data.get("blood_sugar") or 0
    if sugar >= 11.1:
        score += 10  # Tiểu đường
    elif sugar >= 7.0:
        score += 7
    elif sugar >= 5.6:
        score += 3   # Tiền tiểu đường

    if data.get("smoker"):
        score += 10

    # ---------- Test FAST (ưu tiên cao — dấu hiệu cấp tính) ----------
    fast_hits = sum([
        1 if data.get("fast_face") else 0,
        1 if data.get("fast_arm") else 0,
        1 if data.get("fast_speech") else 0,
    ])

    # FAST là dấu hiệu cấp cứu — cộng rất mạnh
    if fast_hits >= 1:
        score += 30 + (fast_hits - 1) * 10

    # ---------- Triệu chứng ----------
    n_symptoms = len(data.get("symptoms") or [])
    if n_symptoms >= 3:
        score += 15
    elif n_symptoms == 2:
        score += 10
    elif n_symptoms == 1:
        score += 5

    # ---------- Clamp ----------
    score = max(0.0, min(100.0, score))

    # ---------- Phân loại ----------
    if fast_hits >= 1:
        # Có dấu hiệu FAST → luôn là critical
        level = "critical"
    elif score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"

    return round(score, 1), level


# ============================================================
# Routes
# ============================================================

@router.post("")
async def create_check(body: HealthCheckBody):
    data = body.model_dump()

    # Tính BMI
    data["bmi"] = compute_bmi(data.get("weight_kg"), data.get("height_cm"))

    # Tính risk
    score, level = compute_risk_score(data)
    data["risk_score"] = score
    data["risk_level"] = level

    record = storage.create_health_check(data)
    log.info(
        f"[health-check] {record['id']} · "
        f"risk={level} ({score}) · FAST={sum([record['fast_face'], record['fast_arm'], record['fast_speech']])}"
    )
    return record


@router.get("")
async def list_checks(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    items = storage.list_health_checks(limit=limit, offset=offset)
    return {"items": items, "total": len(items)}


@router.get("/{check_id}")
async def get_check(check_id: str):
    rec = storage.get_health_check(check_id)
    if not rec:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    return rec


@router.delete("/{check_id}")
async def delete_check(check_id: str):
    ok = storage.delete_health_check(check_id)
    if not ok:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    return {"deleted": True}