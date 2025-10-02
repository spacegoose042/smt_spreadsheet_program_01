"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field
from datetime import date, datetime
from typing import Optional
from models import UserRole, WorkOrderStatus, Priority, SideType, THKitStatus


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole


class UserCreate(UserBase):
    password: str
    assigned_line_id: Optional[int] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    assigned_line_id: Optional[int] = None
    password: Optional[str] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    assigned_line_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# SMT Line Schemas
class SMTLineBase(BaseModel):
    name: str
    description: Optional[str] = None
    hours_per_day: float = 8.0
    hours_per_week: float = 40.0
    is_active: bool = True
    is_special_customer: bool = False
    special_customer_name: Optional[str] = None
    order_position: Optional[int] = None


class SMTLineCreate(SMTLineBase):
    pass


class SMTLineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    hours_per_day: Optional[float] = None
    hours_per_week: Optional[float] = None
    is_active: Optional[bool] = None
    is_special_customer: Optional[bool] = None
    special_customer_name: Optional[str] = None
    order_position: Optional[int] = None


class SMTLineResponse(SMTLineBase):
    id: int

    class Config:
        from_attributes = True


# Work Order Schemas
class WorkOrderBase(BaseModel):
    customer: str
    assembly: str
    revision: str
    wo_number: str
    quantity: int
    status: WorkOrderStatus
    priority: Priority = Priority.FACTORY_DEFAULT
    is_locked: bool = False
    is_new_rev_assembly: bool = False
    cetec_ship_date: date
    time_minutes: float
    trolley_count: int = 1
    sides: SideType = SideType.SINGLE
    th_wo_number: Optional[str] = None
    th_kit_status: THKitStatus = THKitStatus.NA
    run_together_group: Optional[str] = None
    notes: Optional[str] = None


class WorkOrderCreate(WorkOrderBase):
    line_id: Optional[int] = None
    line_position: Optional[int] = None
    wo_start_datetime: Optional[datetime] = None


class WorkOrderUpdate(BaseModel):
    customer: Optional[str] = None
    assembly: Optional[str] = None
    revision: Optional[str] = None
    quantity: Optional[int] = None
    status: Optional[WorkOrderStatus] = None
    priority: Optional[Priority] = None
    is_locked: Optional[bool] = None
    is_new_rev_assembly: Optional[bool] = None
    cetec_ship_date: Optional[date] = None
    time_minutes: Optional[float] = None
    trolley_count: Optional[int] = None
    sides: Optional[SideType] = None
    line_id: Optional[int] = None
    line_position: Optional[int] = None
    th_wo_number: Optional[str] = None
    th_kit_status: Optional[THKitStatus] = None
    run_together_group: Optional[str] = None
    notes: Optional[str] = None
    wo_start_datetime: Optional[datetime] = None


class WorkOrderResponse(WorkOrderBase):
    id: int
    actual_ship_date: Optional[date] = None
    min_start_date: Optional[date] = None
    setup_time_hours: float
    line_id: Optional[int] = None
    line_position: Optional[int] = None
    is_complete: bool
    created_at: datetime
    updated_at: datetime
    
    # Calculated dates based on line queue position (date only)
    calculated_start_date: Optional[date] = None
    calculated_end_date: Optional[date] = None
    
    # Calculated datetimes based on line queue position (includes time-of-day)
    calculated_start_datetime: Optional[datetime] = None
    calculated_end_datetime: Optional[datetime] = None
    wo_start_datetime: Optional[datetime] = None
    
    # Include line info if available
    line: Optional[SMTLineResponse] = None

    class Config:
        from_attributes = True


# Completed Work Order Schemas
class CompletedWorkOrderCreate(BaseModel):
    work_order_id: int
    actual_start_date: date
    actual_finish_date: date
    actual_time_clocked_minutes: float
    quantity_completed: int


class CompletedWorkOrderUpdate(BaseModel):
    actual_start_date: Optional[date] = None
    actual_finish_date: Optional[date] = None
    actual_time_clocked_minutes: Optional[float] = None
    quantity_completed: Optional[int] = None


class CompletedWorkOrderResponse(BaseModel):
    id: int
    work_order_id: int
    actual_start_date: date
    actual_finish_date: date
    actual_time_clocked_minutes: float
    quantity_completed: int
    estimated_time_minutes: Optional[float]
    time_variance_minutes: Optional[float]
    estimated_quantity: Optional[int]
    quantity_variance: Optional[int]
    completed_at: datetime
    work_order: Optional[WorkOrderResponse] = None

    class Config:
        from_attributes = True


# Dashboard/Analytics Schemas
class TrolleyStatus(BaseModel):
    current_in_use: int
    limit: int
    available: int
    warning: bool


class LineScheduleSummary(BaseModel):
    line: SMTLineResponse
    work_orders: list[WorkOrderResponse]
    total_jobs: int
    trolleys_in_use: int
    completion_date: Optional[date] = None  # When will all jobs on this line finish


class DashboardResponse(BaseModel):
    trolley_status: TrolleyStatus
    lines: list[LineScheduleSummary]
    upcoming_deadlines: list[WorkOrderResponse]
    high_priority_jobs: list[WorkOrderResponse]


# Settings Schemas
class SettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class SettingCreate(SettingBase):
    pass


class SettingResponse(SettingBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None

