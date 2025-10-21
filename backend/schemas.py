"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field
from datetime import date, datetime, time
from typing import Optional
from models import UserRole, WorkOrderStatus, Priority, SideType, THKitStatus, IssueSeverity, IssueStatus


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


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class AdminPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=6)


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
    status_id: Optional[int] = None  # New: FK to Status table
    status: Optional[WorkOrderStatus] = None  # Legacy: for backward compatibility
    priority: Priority = Priority.FACTORY_DEFAULT
    is_locked: bool = False
    is_manual_schedule: bool = False
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
    status_id: Optional[int] = None  # New: FK to Status table
    status: Optional[WorkOrderStatus] = None  # Legacy: for backward compatibility
    priority: Optional[Priority] = None
    is_locked: Optional[bool] = None
    is_manual_schedule: Optional[bool] = None
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
    is_deleted: bool = False
    is_canceled: bool = False
    created_at: datetime
    updated_at: datetime
    
    # Status details
    status_name: Optional[str] = None  # Computed: name from status_obj or legacy status
    status_color: Optional[str] = None  # Color from status_obj
    
    # Calculated dates based on line queue position (date only)
    calculated_start_date: Optional[date] = None
    calculated_end_date: Optional[date] = None
    
    # Calculated datetimes based on line queue position (includes time-of-day)
    calculated_start_datetime: Optional[datetime] = None
    calculated_end_datetime: Optional[datetime] = None
    wo_start_datetime: Optional[datetime] = None
    
    # Optimizer date fields (promise date tracking)
    earliest_completion_date: Optional[date] = None
    scheduled_start_date: Optional[date] = None
    scheduled_end_date: Optional[date] = None
    promise_date_variance_days: Optional[int] = None
    
    # Cetec Integration
    cetec_ordline_id: Optional[int] = None
    current_location: Optional[str] = None
    material_status: Optional[str] = None
    last_cetec_sync: Optional[datetime] = None
    
    # Cetec Progress Tracking
    cetec_original_qty: Optional[int] = None
    cetec_balance_due: Optional[int] = None
    cetec_shipped_qty: Optional[int] = None
    cetec_invoiced_qty: Optional[int] = None
    cetec_completed_qty: Optional[int] = None
    cetec_remaining_qty: Optional[int] = None
    
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


# Capacity Management Schemas
class CapacityOverrideCreate(BaseModel):
    line_id: int
    start_date: date
    end_date: date
    total_hours: float
    shift_config: Optional[str] = None  # JSON string with shift details
    reason: Optional[str] = None


class CapacityOverrideUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_hours: Optional[float] = None
    shift_config: Optional[str] = None
    reason: Optional[str] = None


class CapacityOverrideResponse(BaseModel):
    id: int
    line_id: int
    start_date: date
    end_date: date
    total_hours: float
    shift_config: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime
    created_by_user_id: Optional[int] = None

    class Config:
        from_attributes = True


class ShiftCreate(BaseModel):
    line_id: int
    name: str
    shift_number: int = 1
    start_time: time
    end_time: time
    active_days: str = "1,2,3,4,5"  # Mon-Fri by default
    is_active: bool = True


class ShiftUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_active: Optional[bool] = None


class ShiftBreakCreate(BaseModel):
    shift_id: int
    name: str
    start_time: time
    end_time: time
    is_paid: bool = False


# Status Management Schemas
class StatusCreate(BaseModel):
    name: str
    color: str = "#6c757d"
    is_active: bool = True
    display_order: int = 0


class StatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class StatusResponse(BaseModel):
    id: int
    name: str
    color: str
    is_active: bool
    display_order: int
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Issue Type Schemas
class IssueTypeCreate(BaseModel):
    name: str
    color: str = "#dc3545"
    category: Optional[str] = None
    is_active: bool = True
    display_order: int = 0


class IssueTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class IssueTypeResponse(BaseModel):
    id: int
    name: str
    color: str
    category: Optional[str]
    is_active: bool
    display_order: int
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Issue Schemas
class IssueCreate(BaseModel):
    work_order_id: int
    issue_type_id: int
    severity: IssueSeverity = IssueSeverity.MINOR
    description: str


class IssueUpdate(BaseModel):
    issue_type_id: Optional[int] = None
    severity: Optional[IssueSeverity] = None
    status: Optional[IssueStatus] = None
    description: Optional[str] = None
    resolution_type_id: Optional[int] = None
    resolution_notes: Optional[str] = None


class IssueResponse(BaseModel):
    id: int
    work_order_id: int
    issue_type_id: int
    severity: IssueSeverity
    status: IssueStatus
    description: str
    reported_by_id: int
    reported_at: datetime
    resolved_by_id: Optional[int]
    resolved_at: Optional[datetime]
    resolution_type_id: Optional[int]
    resolution_notes: Optional[str]
    
    # Computed fields for display
    issue_type_name: Optional[str] = None
    issue_type_color: Optional[str] = None
    resolution_type_name: Optional[str] = None
    resolution_type_color: Optional[str] = None
    reported_by_username: Optional[str] = None
    resolved_by_username: Optional[str] = None
    
    # Work order details
    wo_number: Optional[str] = None
    assembly: Optional[str] = None
    revision: Optional[str] = None
    customer: Optional[str] = None

    class Config:
        from_attributes = True


# Resolution Type Schemas
class ResolutionTypeCreate(BaseModel):
    name: str
    color: str = "#28a745"
    category: Optional[str] = None
    is_active: bool = True
    display_order: int = 0


class ResolutionTypeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class ResolutionTypeResponse(BaseModel):
    id: int
    name: str
    color: str
    category: Optional[str]
    is_active: bool
    display_order: int
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Cetec Sync Schemas
class CetecSyncLogResponse(BaseModel):
    id: int
    sync_date: datetime
    wo_number: str
    change_type: str  # "created", "date_changed", "qty_changed", "location_changed", "material_changed"
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    cetec_ordline_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class CetecImportRequest(BaseModel):
    from_date: Optional[str] = None  # YYYY-MM-DD format
    to_date: Optional[str] = None
    prodline: Optional[str] = "200"
    transcode: Optional[str] = "SA,SN"
    intercompany: bool = False


class CetecImportResponse(BaseModel):
    success: bool
    message: str
    total_fetched: int
    created_count: int
    updated_count: int
    error_count: int
    changes: list[CetecSyncLogResponse]

