"""
Main FastAPI application
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta

from database import engine, get_db, Base
from models import WorkOrder, SMTLine, CompletedWorkOrder, WorkOrderStatus, Priority, User, UserRole, CapacityOverride, Shift, ShiftBreak, LineConfiguration
import schemas
import scheduler as sched
import time_scheduler as time_sched
import auth

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SMT Production Scheduler API",
    description="API for managing SMT production scheduling",
    version="1.0.0"
)

# CORS middleware - Allow frontend to make authenticated requests
from config import settings as config_settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        config_settings.FRONTEND_URL,
        "http://localhost:5173",
        "https://smtspreadsheetprogram01-production-frontend.up.railway.app"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    expose_headers=["Content-Type"],
)


# Health check
@app.get("/")
def read_root():
    return {"status": "ok", "message": "SMT Production Scheduler API"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# ========== Authentication ==========

@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login endpoint - returns JWT token"""
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def get_current_user_info(current_user: User = Depends(auth.get_current_active_user)):
    """Get current logged-in user info"""
    return current_user


@app.post("/api/auth/change-password")
def change_password(
    old_password: str,
    new_password: str,
    current_user: User = Depends(auth.get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change current user's password"""
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    
    current_user.hashed_password = auth.get_password_hash(new_password)
    db.commit()
    return {"status": "success", "message": "Password changed"}


# ========== User Management (Admin Only) ==========

@app.get("/api/users", response_model=List[schemas.UserResponse])
def get_users(
    current_user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    return db.query(User).all()


@app.post("/api/users", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate,
    current_user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)"""
    # Check if username exists
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if email exists
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=auth.get_password_hash(user.password),
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.put("/api/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    current_user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Update a user (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    for key, value in user_update.model_dump(exclude_unset=True).items():
        if key == "password":
            user.hashed_password = auth.get_password_hash(value)
        else:
            setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()
    return {"status": "success"}


@app.get("/api/recalculate-all")
def recalculate_all_work_orders(db: Session = Depends(get_db)):
    """Recalculate all work order dates (use after schedule logic changes)"""
    work_orders = db.query(WorkOrder).filter(WorkOrder.is_complete == False).all()
    
    updated_count = 0
    for wo in work_orders:
        line = db.query(SMTLine).filter(SMTLine.id == wo.line_id).first() if wo.line_id else None
        sched.update_work_order_calculations(wo, line)
        updated_count += 1
    
    db.commit()
    
    return {"status": "success", "updated": updated_count, "message": f"Recalculated {updated_count} work orders"}


# ========== SMT Lines ==========

@app.get("/api/lines", response_model=List[schemas.SMTLineResponse])
def get_lines(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all SMT lines"""
    query = db.query(SMTLine)
    if not include_inactive:
        query = query.filter(SMTLine.is_active == True)
    return query.order_by(SMTLine.order_position).all()


@app.get("/api/lines/{line_id}", response_model=schemas.SMTLineResponse)
def get_line(line_id: int, db: Session = Depends(get_db)):
    """Get a specific SMT line"""
    line = db.query(SMTLine).filter(SMTLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    return line


@app.post("/api/lines", response_model=schemas.SMTLineResponse, status_code=status.HTTP_201_CREATED)
def create_line(line: schemas.SMTLineCreate, db: Session = Depends(get_db)):
    """Create a new SMT line"""
    db_line = SMTLine(**line.model_dump())
    db.add(db_line)
    db.commit()
    db.refresh(db_line)
    return db_line


@app.put("/api/lines/{line_id}", response_model=schemas.SMTLineResponse)
def update_line(
    line_id: int,
    line_update: schemas.SMTLineUpdate,
    db: Session = Depends(get_db)
):
    """Update an SMT line"""
    db_line = db.query(SMTLine).filter(SMTLine.id == line_id).first()
    if not db_line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    for key, value in line_update.model_dump(exclude_unset=True).items():
        setattr(db_line, key, value)
    
    db.commit()
    db.refresh(db_line)
    return db_line


# ========== Work Orders ==========

@app.get("/api/work-orders", response_model=List[schemas.WorkOrderResponse])
def get_work_orders(
    line_id: Optional[int] = None,
    status: Optional[WorkOrderStatus] = None,
    priority: Optional[Priority] = None,
    include_complete: bool = False,
    db: Session = Depends(get_db)
):
    """Get all work orders with optional filters"""
    query = db.query(WorkOrder)
    
    if not include_complete:
        query = query.filter(WorkOrder.is_complete == False)
    
    if line_id:
        query = query.filter(WorkOrder.line_id == line_id)
    
    if status:
        query = query.filter(WorkOrder.status == status)
    
    if priority:
        query = query.filter(WorkOrder.priority == priority)
    
    work_orders = query.order_by(WorkOrder.line_position).all()
    
    # Calculate dates AND times for each line
    line_dates = {}
    line_datetimes = {}
    for wo in work_orders:
        if wo.line_id and wo.line_id not in line_dates:
            line = db.query(SMTLine).filter(SMTLine.id == wo.line_id).first()
            if line:
                line_dates[wo.line_id] = sched.calculate_job_dates(db, wo.line_id, line.hours_per_day)
                line_datetimes[wo.line_id] = time_sched.calculate_job_datetimes(db, wo.line_id)
    
    # Add calculated dates and times to work orders
    result = []
    for wo in work_orders:
        wo_dict = schemas.WorkOrderResponse.model_validate(wo).model_dump()
        if wo.line_id and wo.id in line_dates.get(wo.line_id, {}):
            dates = line_dates[wo.line_id][wo.id]
            wo_dict['calculated_start_date'] = dates['start_date']
            wo_dict['calculated_end_date'] = dates['end_date']
        if wo.line_id and wo.id in line_datetimes.get(wo.line_id, {}):
            datetimes = line_datetimes[wo.line_id][wo.id]
            wo_dict['calculated_start_datetime'] = datetimes['start_datetime']
            wo_dict['calculated_end_datetime'] = datetimes['end_datetime']
        result.append(schemas.WorkOrderResponse(**wo_dict))
    
    return result


@app.get("/api/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse)
def get_work_order(wo_id: int, db: Session = Depends(get_db)):
    """Get a specific work order"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@app.post("/api/work-orders", response_model=schemas.WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def create_work_order(wo: schemas.WorkOrderCreate, db: Session = Depends(get_db)):
    """Create a new work order"""
    # Create work order
    db_wo = WorkOrder(**wo.model_dump())
    
    # Get line if assigned
    line = None
    if db_wo.line_id:
        line = db.query(SMTLine).filter(SMTLine.id == db_wo.line_id).first()
        if not line:
            raise HTTPException(status_code=404, detail="Line not found")
        
        # Auto-assign position if not provided
        if not db_wo.line_position:
            # Get the highest position on this line
            max_position_query = db.query(WorkOrder).filter(
                WorkOrder.line_id == db_wo.line_id,
                WorkOrder.is_complete == False,
                WorkOrder.line_position.isnot(None)
            ).order_by(WorkOrder.line_position.desc()).first()
            
            db_wo.line_position = (max_position_query.line_position + 1) if max_position_query else 1
        elif not sched.validate_line_position(db, db_wo.line_id, db_wo.line_position):
            # Position is taken, auto-renumber
            sched.reorder_line_positions(db, db_wo.line_id, db_wo.line_position)
    
    # Calculate dates
    db_wo = sched.update_work_order_calculations(db_wo, line)
    
    # Check trolley limits
    trolley_check = sched.check_trolley_limit(db, db_wo.trolley_count)
    
    db.add(db_wo)
    db.commit()
    db.refresh(db_wo)
    
    # Return with trolley warning if needed
    response = schemas.WorkOrderResponse.model_validate(db_wo)
    if trolley_check["warning"] or trolley_check["exceeds"]:
        # Note: In a real app, you might want to return this as a separate warning field
        pass
    
    return response


@app.put("/api/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse)
def update_work_order(
    wo_id: int,
    wo_update: schemas.WorkOrderUpdate,
    db: Session = Depends(get_db)
):
    """Update a work order"""
    db_wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not db_wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Check if locked
    if db_wo.is_locked and not wo_update.is_locked:
        # Allow unlocking, but warn about other changes
        pass
    
    # Update fields
    update_data = wo_update.model_dump(exclude_unset=True)
    
    # If unscheduling (setting line_id to None), clear line_position
    if "line_id" in update_data and update_data["line_id"] is None:
        update_data["line_position"] = None
    
    # Handle line position changes
    if "line_position" in update_data and "line_id" in update_data and update_data["line_id"]:
        new_line_id = update_data["line_id"]
        new_position = update_data["line_position"]
        
        if new_position and not sched.validate_line_position(db, new_line_id, new_position, wo_id):
            sched.reorder_line_positions(db, new_line_id, new_position, wo_id)
    
    for key, value in update_data.items():
        setattr(db_wo, key, value)
    
    # Recalculate dates if relevant fields changed
    if any(k in update_data for k in ["cetec_ship_date", "time_minutes", "trolley_count", "th_kit_status"]):
        line = db.query(SMTLine).filter(SMTLine.id == db_wo.line_id).first() if db_wo.line_id else None
        db_wo = sched.update_work_order_calculations(db_wo, line)
    
    db.commit()
    db.refresh(db_wo)
    return db_wo


@app.delete("/api/work-orders/{wo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(wo_id: int, db: Session = Depends(get_db)):
    """Delete a work order"""
    db_wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not db_wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    db.delete(db_wo)
    db.commit()
    return None


@app.post("/api/work-orders/{wo_id}/complete", response_model=schemas.CompletedWorkOrderResponse)
def complete_work_order(
    wo_id: int,
    completion_data: schemas.CompletedWorkOrderCreate,
    db: Session = Depends(get_db)
):
    """Mark a work order as complete"""
    db_wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not db_wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    if db_wo.is_complete:
        raise HTTPException(status_code=400, detail="Work order already complete")
    
    # Create completion record
    completed = CompletedWorkOrder(
        work_order_id=wo_id,
        actual_start_date=completion_data.actual_start_date,
        actual_finish_date=completion_data.actual_finish_date,
        actual_time_clocked_minutes=completion_data.actual_time_clocked_minutes,
        quantity_completed=completion_data.quantity_completed,
        estimated_time_minutes=db_wo.time_minutes,
        time_variance_minutes=completion_data.actual_time_clocked_minutes - db_wo.time_minutes,
        estimated_quantity=db_wo.quantity,
        quantity_variance=completion_data.quantity_completed - db_wo.quantity
    )
    
    db_wo.is_complete = True
    
    db.add(completed)
    db.commit()
    db.refresh(completed)
    
    return completed


# ========== Dashboard & Analytics ==========

@app.get("/api/dashboard", response_model=schemas.DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    """Get dashboard overview"""
    # Get trolley status
    trolleys_in_use = sched.get_trolley_count_in_use(db)
    trolley_status = schemas.TrolleyStatus(
        current_in_use=trolleys_in_use,
        limit=24,
        available=24 - trolleys_in_use,
        warning=trolleys_in_use >= 22
    )
    
    # Get all active lines with their work orders
    lines = db.query(SMTLine).filter(SMTLine.is_active == True).order_by(SMTLine.order_position).all()
    line_summaries = []
    
    for line in lines:
        work_orders = db.query(WorkOrder).filter(
            WorkOrder.line_id == line.id,
            WorkOrder.is_complete == False
        ).order_by(WorkOrder.line_position).all()
        
        line_trolleys = sum(wo.trolley_count for wo in work_orders if wo.status in [
            WorkOrderStatus.RUNNING,
            WorkOrderStatus.SECOND_SIDE_RUNNING,
            WorkOrderStatus.CLEAR_TO_BUILD,
            WorkOrderStatus.CLEAR_TO_BUILD_NEW
        ])
        
        # Calculate job dates AND times for this line
        job_dates = sched.calculate_job_dates(db, line.id, line.hours_per_day)
        job_datetimes = time_sched.calculate_job_datetimes(db, line.id)
        completion_date = sched.get_line_completion_date(db, line.id, line.hours_per_day)
        
        # Add calculated dates to work orders
        wo_responses = []
        for wo in work_orders:
            wo_dict = schemas.WorkOrderResponse.model_validate(wo).model_dump()
            if wo.id in job_dates:
                wo_dict['calculated_start_date'] = job_dates[wo.id]['start_date']
                wo_dict['calculated_end_date'] = job_dates[wo.id]['end_date']
            if wo.id in job_datetimes:
                wo_dict['calculated_start_datetime'] = job_datetimes[wo.id]['start_datetime']
                wo_dict['calculated_end_datetime'] = job_datetimes[wo.id]['end_datetime']
            wo_responses.append(schemas.WorkOrderResponse(**wo_dict))
        
        line_summaries.append(schemas.LineScheduleSummary(
            line=schemas.SMTLineResponse.model_validate(line),
            work_orders=wo_responses,
            total_jobs=len(work_orders),
            trolleys_in_use=line_trolleys,
            completion_date=completion_date
        ))
    
    # Get upcoming deadlines (next 7 days)
    from datetime import timedelta
    today = date.today()
    week_from_now = today + timedelta(days=7)
    
    upcoming = db.query(WorkOrder).filter(
        WorkOrder.is_complete == False,
        WorkOrder.actual_ship_date >= today,
        WorkOrder.actual_ship_date <= week_from_now
    ).order_by(WorkOrder.actual_ship_date).limit(10).all()
    
    # Get high priority jobs
    high_priority = db.query(WorkOrder).filter(
        WorkOrder.is_complete == False,
        WorkOrder.priority.in_([Priority.CRITICAL_MASS, Priority.OVERCLOCKED])
    ).order_by(WorkOrder.priority).limit(10).all()
    
    return schemas.DashboardResponse(
        trolley_status=trolley_status,
        lines=line_summaries,
        upcoming_deadlines=[schemas.WorkOrderResponse.model_validate(wo) for wo in upcoming],
        high_priority_jobs=[schemas.WorkOrderResponse.model_validate(wo) for wo in high_priority]
    )


@app.get("/api/trolley-status", response_model=schemas.TrolleyStatus)
def get_trolley_status(db: Session = Depends(get_db)):
    """Get current trolley usage"""
    trolleys_in_use = sched.get_trolley_count_in_use(db)
    return schemas.TrolleyStatus(
        current_in_use=trolleys_in_use,
        limit=24,
        available=24 - trolleys_in_use,
        warning=trolleys_in_use >= 22
    )


# ========== Completed Work Orders ==========

@app.get("/api/completed", response_model=List[schemas.CompletedWorkOrderResponse])
def get_completed_work_orders(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get completed work orders"""
    completed = db.query(CompletedWorkOrder).order_by(
        CompletedWorkOrder.completed_at.desc()
    ).limit(limit).all()
    
    return completed


@app.put("/api/completed/{completed_id}", response_model=schemas.CompletedWorkOrderResponse)
def update_completed_work_order(
    completed_id: int,
    update_data: schemas.CompletedWorkOrderUpdate,
    db: Session = Depends(get_db)
):
    """Update a completed work order record"""
    completed = db.query(CompletedWorkOrder).filter(CompletedWorkOrder.id == completed_id).first()
    if not completed:
        raise HTTPException(status_code=404, detail="Completed work order not found")
    
    # Update fields
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(completed, key, value)
    
    # Recalculate variances
    if completed.actual_time_clocked_minutes and completed.estimated_time_minutes:
        completed.time_variance_minutes = completed.actual_time_clocked_minutes - completed.estimated_time_minutes
    
    if completed.quantity_completed and completed.estimated_quantity:
        completed.quantity_variance = completed.quantity_completed - completed.estimated_quantity
    
    db.commit()
    db.refresh(completed)
    return completed


@app.post("/api/completed/{completed_id}/uncomplete", response_model=schemas.WorkOrderResponse)
def uncomplete_work_order(
    completed_id: int,
    db: Session = Depends(get_db)
):
    """Move a completed work order back to active status"""
    completed = db.query(CompletedWorkOrder).filter(CompletedWorkOrder.id == completed_id).first()
    if not completed:
        raise HTTPException(status_code=404, detail="Completed work order not found")
    
    # Get the work order
    work_order = db.query(WorkOrder).filter(WorkOrder.id == completed.work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Mark as incomplete
    work_order.is_complete = False
    
    # Delete the completion record
    db.delete(completed)
    db.commit()
    db.refresh(work_order)
    
    return work_order


# ============================================================================
# CAPACITY CALENDAR ENDPOINTS
# ============================================================================

@app.get("/api/capacity/calendar/{line_id}")
def get_capacity_calendar(
    line_id: int,
    start_date: Optional[date] = None,
    weeks: int = 8,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get capacity calendar for a line showing default shifts and overrides.
    Returns 8 weeks by default.
    """
    # Verify line exists
    line = db.query(SMTLine).filter(SMTLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    # Default to current week's Monday
    if not start_date:
        today = date.today()
        start_date = today - timedelta(days=today.weekday())
    
    end_date = start_date + timedelta(weeks=weeks)
    
    # Get default shifts for this line
    shifts = db.query(Shift).filter(
        Shift.line_id == line_id
    ).all()
    
    # Get line configuration
    config = db.query(LineConfiguration).filter(
        LineConfiguration.line_id == line_id
    ).first()
    
    # Get all overrides in the date range
    overrides = db.query(CapacityOverride).filter(
        CapacityOverride.line_id == line_id,
        CapacityOverride.start_date <= end_date,
        CapacityOverride.end_date >= start_date
    ).all()
    
    return {
        "line": {
            "id": line.id,
            "name": line.name,
            "hours_per_day": line.hours_per_day,
            "hours_per_week": line.hours_per_week
        },
        "start_date": start_date,
        "end_date": end_date,
        "default_shifts": [
            {
                "id": s.id,
                "name": s.name,
                "shift_number": s.shift_number,
                "active_days": s.active_days,
                "start_time": s.start_time.isoformat() if s.start_time else None,
                "end_time": s.end_time.isoformat() if s.end_time else None,
                "is_active": s.is_active,
                "breaks": [
                    {
                        "id": b.id,
                        "name": b.name,
                        "start_time": b.start_time.isoformat() if b.start_time else None,
                        "end_time": b.end_time.isoformat() if b.end_time else None,
                        "is_paid": b.is_paid
                    }
                    for b in s.breaks
                ]
            }
            for s in shifts
        ],
        "configuration": {
            "buffer_time_minutes": config.buffer_time_minutes if config else 15,
            "time_rounding_minutes": config.time_rounding_minutes if config else 15,
            "timezone": config.timezone if config else "America/Chicago"
        },
        "overrides": [
            {
                "id": o.id,
                "start_date": o.start_date,
                "end_date": o.end_date,
                "total_hours": o.total_hours,
                "shift_config": o.shift_config,
                "reason": o.reason,
                "created_at": o.created_at
            }
            for o in overrides
        ]
    }


@app.post("/api/capacity/overrides", dependencies=[Depends(auth.require_scheduler_or_admin)])
def create_capacity_override(
    override: schemas.CapacityOverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Create a capacity override for specific date(s).
    Requires scheduler or admin role.
    """
    # Verify line exists
    line = db.query(SMTLine).filter(SMTLine.id == override.line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    # Create override
    db_override = CapacityOverride(
        line_id=override.line_id,
        start_date=override.start_date,
        end_date=override.end_date,
        total_hours=override.total_hours,
        shift_config=override.shift_config,
        reason=override.reason,
        created_by_user_id=current_user.id
    )
    
    db.add(db_override)
    db.commit()
    db.refresh(db_override)
    
    return db_override


@app.put("/api/capacity/overrides/{override_id}", dependencies=[Depends(auth.require_scheduler_or_admin)])
def update_capacity_override(
    override_id: int,
    override: schemas.CapacityOverrideUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Update a capacity override.
    Requires scheduler or admin role.
    """
    db_override = db.query(CapacityOverride).filter(CapacityOverride.id == override_id).first()
    if not db_override:
        raise HTTPException(status_code=404, detail="Override not found")
    
    # Update fields
    if override.start_date is not None:
        db_override.start_date = override.start_date
    if override.end_date is not None:
        db_override.end_date = override.end_date
    if override.total_hours is not None:
        db_override.total_hours = override.total_hours
    if override.shift_config is not None:
        db_override.shift_config = override.shift_config
    if override.reason is not None:
        db_override.reason = override.reason
    
    db.commit()
    db.refresh(db_override)
    
    return db_override


@app.delete("/api/capacity/overrides/{override_id}", dependencies=[Depends(auth.require_scheduler_or_admin)])
def delete_capacity_override(
    override_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Delete a capacity override.
    Requires scheduler or admin role.
    """
    db_override = db.query(CapacityOverride).filter(CapacityOverride.id == override_id).first()
    if not db_override:
        raise HTTPException(status_code=404, detail="Override not found")
    
    db.delete(db_override)
    db.commit()
    
    return {"message": "Override deleted successfully"}


@app.post("/api/capacity/shifts", dependencies=[Depends(auth.require_scheduler_or_admin)])
def create_shift(
    shift_data: schemas.ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Create a new shift template.
    Requires scheduler or admin role.
    """
    # Verify line exists
    line = db.query(SMTLine).filter(SMTLine.id == shift_data.line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    # Create shift
    shift = Shift(
        line_id=shift_data.line_id,
        name=shift_data.name,
        shift_number=shift_data.shift_number,
        start_time=shift_data.start_time,
        end_time=shift_data.end_time,
        active_days=shift_data.active_days,
        is_active=shift_data.is_active
    )
    
    db.add(shift)
    db.commit()
    db.refresh(shift)
    
    return shift


@app.put("/api/capacity/shifts/{shift_id}", dependencies=[Depends(auth.require_scheduler_or_admin)])
def update_shift(
    shift_id: int,
    shift_update: schemas.ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Update a default shift template.
    Requires scheduler or admin role.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Update fields
    if shift_update.start_time is not None:
        shift.start_time = shift_update.start_time
    if shift_update.end_time is not None:
        shift.end_time = shift_update.end_time
    if shift_update.is_active is not None:
        shift.is_active = shift_update.is_active
    
    db.commit()
    db.refresh(shift)
    
    return shift


@app.post("/api/capacity/shifts/breaks", dependencies=[Depends(auth.require_scheduler_or_admin)])
def create_shift_break(
    break_data: schemas.ShiftBreakCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Add a break to a shift.
    Requires scheduler or admin role.
    """
    # Verify shift exists
    shift = db.query(Shift).filter(Shift.id == break_data.shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Create break
    shift_break = ShiftBreak(
        shift_id=break_data.shift_id,
        name=break_data.name,
        start_time=break_data.start_time,
        end_time=break_data.end_time,
        is_paid=break_data.is_paid
    )
    
    db.add(shift_break)
    db.commit()
    db.refresh(shift_break)
    
    return shift_break


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

