"""
Schemas for capacity override management
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class CapacityOverrideBase(BaseModel):
    line_id: int
    start_date: date
    end_date: date
    total_hours: float
    shift_config: Optional[str] = None  # JSON string
    reason: Optional[str] = None


class CapacityOverrideCreate(CapacityOverrideBase):
    pass


class CapacityOverrideUpdate(BaseModel):
    total_hours: Optional[float] = None
    shift_config: Optional[str] = None
    reason: Optional[str] = None


class CapacityOverrideResponse(CapacityOverrideBase):
    id: int
    created_at: datetime
    created_by_user_id: Optional[int] = None

    class Config:
        from_attributes = True


class QuickOvertimeRequest(BaseModel):
    """Quick action to add overtime hours to a date"""
    line_id: int
    date: date
    extra_hours: float  # Hours to add (e.g., 2.0 for 2 hrs overtime)
    reason: Optional[str] = "Overtime"


class DayCapacityResponse(BaseModel):
    """Capacity info for a single day"""
    date: date
    line_id: int
    total_hours: float
    is_override: bool
    is_default: bool
    shifts_count: int
    reason: Optional[str] = None


