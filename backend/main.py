"""
Main FastAPI application
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta, datetime
import requests

from database import engine, get_db, Base
from models import WorkOrder, SMTLine, CompletedWorkOrder, WorkOrderStatus, Priority, User, UserRole, CapacityOverride, Shift, ShiftBreak, LineConfiguration, Status, IssueType, Issue, IssueSeverity, IssueStatus, ResolutionType, CetecSyncLog
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

# Run database migrations and seed data on startup
@app.on_event("startup")
def startup_event():
    """Run database migrations and seed initial data"""
    print("🚀 Running database migrations and seed...")
    try:
        from seed_data import main as seed_main
        seed_main()
    except Exception as e:
        print(f"❌ Error during startup migration: {e}")
        print("⚠️  Application will continue, but database may be incomplete.")

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


@app.post("/api/users/change-password")
def change_own_password(
    password_data: schemas.PasswordChange,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Change current user's password"""
    # Verify current password
    if not auth.verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update to new password
    current_user.hashed_password = auth.get_password_hash(password_data.new_password)
    db.commit()
    
    return {"status": "success", "message": "Password changed successfully"}


@app.post("/api/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    password_data: schemas.AdminPasswordReset,
    current_user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    """Admin: Reset a user's password"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.hashed_password = auth.get_password_hash(password_data.new_password)
    db.commit()
    
    return {"status": "success", "message": f"Password reset for user {user.username}"}


@app.get("/api/recalculate-all", dependencies=[Depends(auth.require_scheduler_or_admin)])
def recalculate_all_work_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Recalculate all work order dates (Scheduler/Admin only)"""
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


@app.post("/api/lines", response_model=schemas.SMTLineResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(auth.require_admin)])
def create_line(
    line: schemas.SMTLineCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new SMT line (Admin only)"""
    db_line = SMTLine(**line.model_dump())
    db.add(db_line)
    db.commit()
    db.refresh(db_line)
    return db_line


@app.put("/api/lines/{line_id}", response_model=schemas.SMTLineResponse, dependencies=[Depends(auth.require_admin)])
def update_line(
    line_id: int,
    line_update: schemas.SMTLineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update an SMT line (Admin only)"""
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
    status: Optional[str] = None,  # Changed from enum to string (status name)
    priority: Optional[Priority] = None,
    include_complete: bool = False,
    db: Session = Depends(get_db)
):
    """Get all work orders with optional filters"""
    from sqlalchemy.orm import joinedload
    query = db.query(WorkOrder).options(
        joinedload(WorkOrder.status_obj),
        joinedload(WorkOrder.line)
    )
    
    if not include_complete:
        query = query.filter(WorkOrder.is_complete == False)
    
    if line_id:
        query = query.filter(WorkOrder.line_id == line_id)
    
    if status:
        # Filter by status name (using new Status table)
        status_obj = db.query(Status).filter(Status.name == status).first()
        if status_obj:
            query = query.filter(WorkOrder.status_id == status_obj.id)
    
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
        
        # Add status name and color
        if wo.status_obj:
            wo_dict['status_name'] = wo.status_obj.name
            wo_dict['status_color'] = wo.status_obj.color
        elif wo.status:
            wo_dict['status_name'] = wo.status.value
            wo_dict['status_color'] = None
        
        result.append(schemas.WorkOrderResponse(**wo_dict))
    
    return result


@app.get("/api/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse)
def get_work_order(wo_id: int, db: Session = Depends(get_db)):
    """Get a specific work order"""
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Add status details
    wo_dict = schemas.WorkOrderResponse.model_validate(wo).model_dump()
    if wo.status_obj:
        wo_dict['status_name'] = wo.status_obj.name
        wo_dict['status_color'] = wo.status_obj.color
    elif wo.status:
        wo_dict['status_name'] = wo.status.value
        wo_dict['status_color'] = None
    
    return schemas.WorkOrderResponse(**wo_dict)


@app.post("/api/work-orders", response_model=schemas.WorkOrderResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(auth.require_scheduler_or_admin)])
def create_work_order(
    wo: schemas.WorkOrderCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new work order (Scheduler/Admin only)"""
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
    
    # Add status details
    wo_dict = schemas.WorkOrderResponse.model_validate(db_wo).model_dump()
    if db_wo.status_obj:
        wo_dict['status_name'] = db_wo.status_obj.name
        wo_dict['status_color'] = db_wo.status_obj.color
    elif db_wo.status:
        wo_dict['status_name'] = db_wo.status.value
        wo_dict['status_color'] = None
    
    # Return with trolley warning if needed
    if trolley_check["warning"] or trolley_check["exceeds"]:
        # Note: In a real app, you might want to return this as a separate warning field
        pass
    
    return schemas.WorkOrderResponse(**wo_dict)


@app.put("/api/work-orders/{wo_id}", response_model=schemas.WorkOrderResponse, dependencies=[Depends(auth.require_scheduler_or_admin)])
def update_work_order(
    wo_id: int,
    wo_update: schemas.WorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update a work order (Scheduler/Admin only)"""
    db_wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not db_wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Update fields
    update_data = wo_update.model_dump(exclude_unset=True)
    
    # Check if locked and trying to change line or position
    if db_wo.is_locked:
        # Prevent changing line_id or line_position if locked (unless unlocking)
        if "line_id" in update_data and update_data["line_id"] != db_wo.line_id:
            if not ("is_locked" in update_data and update_data["is_locked"] == False):
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot move a locked work order to a different line. Unlock it first."
                )
        
        if "line_position" in update_data and update_data["line_position"] != db_wo.line_position:
            if not ("is_locked" in update_data and update_data["is_locked"] == False):
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot change position of a locked work order. Unlock it first."
                )
    
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
    
    # Add status details
    wo_dict = schemas.WorkOrderResponse.model_validate(db_wo).model_dump()
    if db_wo.status_obj:
        wo_dict['status_name'] = db_wo.status_obj.name
        wo_dict['status_color'] = db_wo.status_obj.color
    elif db_wo.status:
        wo_dict['status_name'] = db_wo.status.value
        wo_dict['status_color'] = None
    
    return schemas.WorkOrderResponse(**wo_dict)


@app.delete("/api/work-orders/{wo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(auth.require_scheduler_or_admin)])
def delete_work_order(
    wo_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Delete a work order (Scheduler/Admin only)"""
    db_wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not db_wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    db.delete(db_wo)
    db.commit()
    return None


@app.post("/api/work-orders/{wo_id}/complete", response_model=schemas.CompletedWorkOrderResponse, dependencies=[Depends(auth.require_operator_or_above)])
def complete_work_order(
    wo_id: int,
    completion_data: schemas.CompletedWorkOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Mark a work order as complete (Operator/Scheduler/Admin)"""
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
        from sqlalchemy.orm import joinedload
        work_orders = db.query(WorkOrder).options(
            joinedload(WorkOrder.status_obj)
        ).filter(
            WorkOrder.line_id == line.id,
            WorkOrder.is_complete == False
        ).order_by(WorkOrder.line_position).all()
        
        # Count trolleys for active statuses (using status_obj relationship)
        line_trolleys = sum(
            wo.trolley_count for wo in work_orders 
            if wo.status_obj and wo.status_obj.name in [
                'Running', '2nd Side Running', 'Clear to Build', 'Clear to Build *'
            ]
        )
        
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


@app.put("/api/completed/{completed_id}", response_model=schemas.CompletedWorkOrderResponse, dependencies=[Depends(auth.require_scheduler_or_admin)])
def update_completed_work_order(
    completed_id: int,
    update_data: schemas.CompletedWorkOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update a completed work order record (Scheduler/Admin only)"""
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


@app.post("/api/completed/{completed_id}/uncomplete", response_model=schemas.WorkOrderResponse, dependencies=[Depends(auth.require_scheduler_or_admin)])
def uncomplete_work_order(
    completed_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Move a completed work order back to active status (Scheduler/Admin only)"""
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
    
    # Default to current week's Sunday
    if not start_date:
        today = date.today()
        # weekday() returns 0=Monday, 6=Sunday; we want to go back to Sunday
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
    
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
    
    # Check if a shift with this name already exists on this line
    existing_shift = db.query(Shift).filter(
        Shift.line_id == shift_data.line_id,
        Shift.name == shift_data.name
    ).first()
    
    if existing_shift:
        raise HTTPException(
            status_code=400, 
            detail=f"A shift named '{shift_data.name}' already exists on {line.name}. Please use a different name or delete the existing shift first."
        )
    
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


@app.delete("/api/capacity/shifts/{shift_id}", dependencies=[Depends(auth.require_scheduler_or_admin)])
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Delete a shift template.
    Requires scheduler or admin role.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    db.delete(shift)
    db.commit()
    
    return {"message": "Shift deleted successfully"}


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


# ============================================================================
# STATUS MANAGEMENT ENDPOINTS
# ============================================================================

@app.get("/api/statuses")
def get_statuses(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Get all statuses"""
    query = db.query(Status)
    
    if not include_inactive:
        query = query.filter(Status.is_active == True)
    
    statuses = query.order_by(Status.display_order, Status.name).all()
    return statuses


@app.post("/api/statuses", dependencies=[Depends(auth.require_admin)])
def create_status(
    status_data: schemas.StatusCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new status (Admin only)"""
    # Check if status with this name already exists
    existing = db.query(Status).filter(Status.name == status_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Status '{status_data.name}' already exists")
    
    status = Status(
        name=status_data.name,
        color=status_data.color,
        is_active=status_data.is_active,
        display_order=status_data.display_order,
        is_system=False  # User-created statuses are not system statuses
    )
    
    db.add(status)
    db.commit()
    db.refresh(status)
    
    return status


@app.put("/api/statuses/{status_id}", dependencies=[Depends(auth.require_admin)])
def update_status(
    status_id: int,
    status_update: schemas.StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update a status (Admin only)"""
    status = db.query(Status).filter(Status.id == status_id).first()
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")
    
    # Update fields
    if status_update.name is not None:
        # Check for name collision
        existing = db.query(Status).filter(
            Status.name == status_update.name,
            Status.id != status_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Status '{status_update.name}' already exists")
        status.name = status_update.name
    
    if status_update.color is not None:
        status.color = status_update.color
    if status_update.is_active is not None:
        status.is_active = status_update.is_active
    if status_update.display_order is not None:
        status.display_order = status_update.display_order
    
    db.commit()
    db.refresh(status)
    
    return status


@app.delete("/api/statuses/{status_id}", dependencies=[Depends(auth.require_admin)])
def delete_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Delete a status (Admin only)"""
    status = db.query(Status).filter(Status.id == status_id).first()
    if not status:
        raise HTTPException(status_code=404, detail="Status not found")
    
    # Prevent deleting system statuses
    if status.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system status")
    
    # Check if any work orders are using this status
    wo_count = db.query(WorkOrder).filter(WorkOrder.status_id == status_id).count()
    if wo_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete status '{status.name}' - {wo_count} work order(s) are using it"
        )
    
    db.delete(status)
    db.commit()
    
    return {"message": "Status deleted successfully"}


# ========== Issue Types ==========

@app.get("/api/issue-types")
def get_issue_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all issue types"""
    query = db.query(IssueType)
    if not include_inactive:
        query = query.filter(IssueType.is_active == True)
    
    issue_types = query.order_by(IssueType.display_order, IssueType.name).all()
    return issue_types


@app.post("/api/issue-types", dependencies=[Depends(auth.require_admin)])
def create_issue_type(
    issue_type_data: schemas.IssueTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new issue type (Admin only)"""
    # Check if issue type with this name already exists
    existing = db.query(IssueType).filter(IssueType.name == issue_type_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Issue type '{issue_type_data.name}' already exists")
    
    issue_type = IssueType(
        name=issue_type_data.name,
        color=issue_type_data.color,
        category=issue_type_data.category,
        is_active=issue_type_data.is_active,
        display_order=issue_type_data.display_order,
        is_system=False
    )
    
    db.add(issue_type)
    db.commit()
    db.refresh(issue_type)
    
    return issue_type


@app.put("/api/issue-types/{issue_type_id}", dependencies=[Depends(auth.require_admin)])
def update_issue_type(
    issue_type_id: int,
    issue_type_data: schemas.IssueTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update an issue type (Admin only)"""
    issue_type = db.query(IssueType).filter(IssueType.id == issue_type_id).first()
    if not issue_type:
        raise HTTPException(status_code=404, detail="Issue type not found")
    
    # Check if name is being changed and already exists
    if issue_type_data.name and issue_type_data.name != issue_type.name:
        existing = db.query(IssueType).filter(IssueType.name == issue_type_data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Issue type '{issue_type_data.name}' already exists")
    
    # Update fields
    update_data = issue_type_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(issue_type, key, value)
    
    db.commit()
    db.refresh(issue_type)
    
    return issue_type


@app.delete("/api/issue-types/{issue_type_id}", dependencies=[Depends(auth.require_admin)])
def delete_issue_type(
    issue_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Delete an issue type (Admin only)"""
    issue_type = db.query(IssueType).filter(IssueType.id == issue_type_id).first()
    if not issue_type:
        raise HTTPException(status_code=404, detail="Issue type not found")
    
    # Prevent deleting system issue types
    if issue_type.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system issue type")
    
    # Check if any issues are using this type
    issue_count = db.query(Issue).filter(Issue.issue_type_id == issue_type_id).count()
    if issue_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete issue type '{issue_type.name}' - {issue_count} issue(s) are using it"
        )
    
    db.delete(issue_type)
    db.commit()
    
    return {"message": "Issue type deleted successfully"}


# ========== Issues ==========

@app.get("/api/issues")
def get_issues(
    work_order_id: Optional[int] = None,
    status: Optional[IssueStatus] = None,
    db: Session = Depends(get_db)
):
    """Get issues, optionally filtered by work order or status"""
    query = db.query(Issue)
    
    if work_order_id:
        query = query.filter(Issue.work_order_id == work_order_id)
    if status:
        query = query.filter(Issue.status == status)
    
    issues = query.order_by(Issue.reported_at.desc()).all()
    
    # Add computed fields
    result = []
    for issue in issues:
        issue_dict = schemas.IssueResponse.model_validate(issue).model_dump()
        if issue.issue_type_obj:
            issue_dict['issue_type_name'] = issue.issue_type_obj.name
            issue_dict['issue_type_color'] = issue.issue_type_obj.color
        if issue.resolution_type_obj:
            issue_dict['resolution_type_name'] = issue.resolution_type_obj.name
            issue_dict['resolution_type_color'] = issue.resolution_type_obj.color
        if issue.reported_by:
            issue_dict['reported_by_username'] = issue.reported_by.username
        if issue.resolved_by:
            issue_dict['resolved_by_username'] = issue.resolved_by.username
        if issue.work_order:
            issue_dict['wo_number'] = issue.work_order.wo_number
            issue_dict['assembly'] = issue.work_order.assembly
            issue_dict['revision'] = issue.work_order.revision
            issue_dict['customer'] = issue.work_order.customer
        result.append(schemas.IssueResponse(**issue_dict))
    
    return result


@app.post("/api/issues", status_code=status.HTTP_201_CREATED)
def create_issue(
    issue_data: schemas.IssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new issue (All authenticated users)"""
    # Verify work order exists
    wo = db.query(WorkOrder).filter(WorkOrder.id == issue_data.work_order_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    # Verify issue type exists
    issue_type = db.query(IssueType).filter(IssueType.id == issue_data.issue_type_id).first()
    if not issue_type:
        raise HTTPException(status_code=404, detail="Issue type not found")
    
    issue = Issue(
        work_order_id=issue_data.work_order_id,
        issue_type_id=issue_data.issue_type_id,
        severity=issue_data.severity,
        description=issue_data.description,
        reported_by_id=current_user.id,
        status=IssueStatus.OPEN
    )
    
    db.add(issue)
    db.commit()
    db.refresh(issue)
    
    # Add computed fields
    issue_dict = schemas.IssueResponse.model_validate(issue).model_dump()
    if issue.issue_type_obj:
        issue_dict['issue_type_name'] = issue.issue_type_obj.name
        issue_dict['issue_type_color'] = issue.issue_type_obj.color
    if issue.resolution_type_obj:
        issue_dict['resolution_type_name'] = issue.resolution_type_obj.name
        issue_dict['resolution_type_color'] = issue.resolution_type_obj.color
    if issue.reported_by:
        issue_dict['reported_by_username'] = issue.reported_by.username
    if issue.work_order:
        issue_dict['wo_number'] = issue.work_order.wo_number
        issue_dict['assembly'] = issue.work_order.assembly
        issue_dict['revision'] = issue.work_order.revision
        issue_dict['customer'] = issue.work_order.customer
    
    return schemas.IssueResponse(**issue_dict)


@app.put("/api/issues/{issue_id}")
def update_issue(
    issue_id: int,
    issue_data: schemas.IssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update an issue"""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    # Update fields
    update_data = issue_data.model_dump(exclude_unset=True)
    
    # If marking as resolved, set resolved_by and resolved_at
    if 'status' in update_data and update_data['status'] == IssueStatus.RESOLVED:
        if not issue.resolved_at:  # Only set if not already resolved
            issue.resolved_by_id = current_user.id
            issue.resolved_at = datetime.utcnow()
    elif 'status' in update_data and update_data['status'] != IssueStatus.RESOLVED:
        # If changing from resolved to something else, clear resolution info
        issue.resolved_by_id = None
        issue.resolved_at = None
    
    for key, value in update_data.items():
        setattr(issue, key, value)
    
    db.commit()
    db.refresh(issue)
    
    # Add computed fields
    issue_dict = schemas.IssueResponse.model_validate(issue).model_dump()
    if issue.issue_type_obj:
        issue_dict['issue_type_name'] = issue.issue_type_obj.name
        issue_dict['issue_type_color'] = issue.issue_type_obj.color
    if issue.resolution_type_obj:
        issue_dict['resolution_type_name'] = issue.resolution_type_obj.name
        issue_dict['resolution_type_color'] = issue.resolution_type_obj.color
    if issue.reported_by:
        issue_dict['reported_by_username'] = issue.reported_by.username
    if issue.resolved_by:
        issue_dict['resolved_by_username'] = issue.resolved_by.username
    if issue.work_order:
        issue_dict['wo_number'] = issue.work_order.wo_number
        issue_dict['assembly'] = issue.work_order.assembly
        issue_dict['revision'] = issue.work_order.revision
        issue_dict['customer'] = issue.work_order.customer
    
    return schemas.IssueResponse(**issue_dict)


@app.delete("/api/issues/{issue_id}")
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Delete an issue (Admin or issue reporter)"""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    # Only admin or the person who reported it can delete
    if current_user.role != UserRole.ADMIN and issue.reported_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this issue")
    
    db.delete(issue)
    db.commit()
    
    return {"message": "Issue deleted successfully"}


# ========== Resolution Types ==========

@app.get("/api/resolution-types")
def get_resolution_types(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Get all resolution types"""
    query = db.query(ResolutionType)
    if not include_inactive:
        query = query.filter(ResolutionType.is_active == True)
    
    resolution_types = query.order_by(ResolutionType.display_order, ResolutionType.name).all()
    return resolution_types


@app.post("/api/resolution-types", dependencies=[Depends(auth.require_admin)])
def create_resolution_type(
    resolution_type_data: schemas.ResolutionTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Create a new resolution type (Admin only)"""
    # Check if resolution type with this name already exists
    existing = db.query(ResolutionType).filter(ResolutionType.name == resolution_type_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Resolution type '{resolution_type_data.name}' already exists")
    
    resolution_type = ResolutionType(
        name=resolution_type_data.name,
        color=resolution_type_data.color,
        category=resolution_type_data.category,
        is_active=resolution_type_data.is_active,
        display_order=resolution_type_data.display_order,
        is_system=False
    )
    
    db.add(resolution_type)
    db.commit()
    db.refresh(resolution_type)
    
    return resolution_type


@app.put("/api/resolution-types/{resolution_type_id}", dependencies=[Depends(auth.require_admin)])
def update_resolution_type(
    resolution_type_id: int,
    resolution_type_data: schemas.ResolutionTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Update a resolution type (Admin only)"""
    resolution_type = db.query(ResolutionType).filter(ResolutionType.id == resolution_type_id).first()
    if not resolution_type:
        raise HTTPException(status_code=404, detail="Resolution type not found")
    
    # Check if name is being changed and already exists
    if resolution_type_data.name and resolution_type_data.name != resolution_type.name:
        existing = db.query(ResolutionType).filter(ResolutionType.name == resolution_type_data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Resolution type '{resolution_type_data.name}' already exists")
    
    # Update fields
    update_data = resolution_type_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(resolution_type, key, value)
    
    db.commit()
    db.refresh(resolution_type)
    
    return resolution_type


@app.delete("/api/resolution-types/{resolution_type_id}", dependencies=[Depends(auth.require_admin)])
def delete_resolution_type(
    resolution_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Delete a resolution type (Admin only)"""
    resolution_type = db.query(ResolutionType).filter(ResolutionType.id == resolution_type_id).first()
    if not resolution_type:
        raise HTTPException(status_code=404, detail="Resolution type not found")
    
    # Prevent deleting system resolution types
    if resolution_type.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system resolution type")
    
    # Check if any issues are using this type
    issue_count = db.query(Issue).filter(Issue.resolution_type_id == resolution_type_id).count()
    if issue_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete resolution type '{resolution_type.name}' - {issue_count} issue(s) are using it"
        )
    
    db.delete(resolution_type)
    db.commit()
    
    return {"message": "Resolution type deleted successfully"}


# ============================================================================
# CETEC ERP API PROXY ENDPOINTS
# ============================================================================

CETEC_CONFIG = {
    "domain": "sandy.cetecerp.com",
    "token": "123matthatesbrant123"
}

@app.get("/api/cetec/ordline/{ordline_id}/location_maps")
def get_cetec_location_maps(
    ordline_id: int,
    include_children: bool = False,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch location maps from Cetec API
    Avoids CORS issues by proxying through our backend
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        if include_children:
            params["include_children"] = "true"
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_maps"
        
        print(f"Proxying Cetec request: {url}")
        print(f"Parameters: {params}")
        
        response = requests.get(url, params=params, timeout=30)
        
        print(f"Cetec response status: {response.status_code}")
        print(f"Cetec response length: {len(response.text)} bytes")
        
        response.raise_for_status()
        
        data = response.json()
        print(f"Cetec data type: {type(data)}, length: {len(data) if isinstance(data, list) else 'N/A'}")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/ordline/{ordline_id}/location_map/{ordline_map_id}/operations")
def get_cetec_operations(
    ordline_id: int,
    ordline_map_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch operations from Cetec API
    Avoids CORS issues by proxying through our backend
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_map/{ordline_map_id}/operations"
        
        print(f"Proxying Cetec request: {url}")
        print(f"Parameters: {params}")
        
        response = requests.get(url, params=params, timeout=30)
        
        print(f"Cetec response status: {response.status_code}")
        print(f"Cetec response length: {len(response.text)} bytes")
        
        response.raise_for_status()
        
        data = response.json()
        print(f"Cetec data type: {type(data)}, length: {len(data) if isinstance(data, list) else 'N/A'}")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/ordline/{ordline_id}/location_map/{ordline_map_id}/operation/{op_id}")
def get_cetec_operation_detail(
    ordline_id: int,
    ordline_map_id: int,
    op_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch specific operation details from Cetec API
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_map/{ordline_map_id}/operation/{op_id}"
        
        print(f"Proxying Cetec request: {url}")
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        print(f"Cetec operation detail: {data}")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/ordline/{ordline_id}/combined")
def get_cetec_combined_data(
    ordline_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Fetch and combine order line + location map + operations in one call
    Returns data ready to map to work order
    """
    try:
        # Get location maps with children
        params = {
            "preshared_token": CETEC_CONFIG["token"],
            "include_children": "true"
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_maps"
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        location_maps = response.json()
        
        # Find SMT PRODUCTION location
        smt_location = None
        for loc in location_maps:
            loc_str = str(loc).upper()
            if 'SMT' in loc_str and ('PRODUCTION' in loc_str or 'PROD' in loc_str):
                smt_location = loc
                break
        
        if not smt_location:
            return {
                "has_smt_production": False,
                "location_maps": location_maps,
                "message": "No SMT PRODUCTION location found"
            }
        
        # Extract SMT ASSEMBLY operation from nested operations
        smt_operation = None
        operations = smt_location.get('operations', [])
        
        for op in operations:
            op_str = str(op).upper()
            if 'SMT' in op_str or 'ASSEMBLY' in op_str:
                if op.get('name') == 'SMT ASSEMBLY' or 'ASSEMBLY' in op.get('name', '').upper():
                    smt_operation = op
                    break
        
        return {
            "has_smt_production": True,
            "smt_location": smt_location,
            "smt_operation": smt_operation,
            "all_operations": operations,
            "location_maps": location_maps
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/ordlinestatus/list")
def get_cetec_ordline_statuses(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch ordline statuses (work locations) from Cetec
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"],
            "rows": "1000"  # Get a large number to ensure we get all locations
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlinestatus/list"
        
        print(f"Proxying Cetec ordlinestatus request: {url}")
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Log the structure for debugging
        print(f"Cetec ordlinestatus response type: {type(data)}")
        if isinstance(data, dict):
            print(f"Response keys: {list(data.keys())}")
            # Try to extract the actual data array
            if 'data' in data:
                data = data['data']
            elif 'ordlinestatus' in data:
                data = data['ordlinestatus']
            elif 'rows' in data:
                data = data['rows']
        
        print(f"Cetec ordlinestatus: fetched {len(data) if isinstance(data, list) else 'not an array'} locations")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/part/{prcpart}")
def get_cetec_part(
    prcpart: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch part data from Cetec API
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/part/{prcpart}"
        
        print(f"Proxying Cetec part request: {url}")
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/customer/{custnum}")
def get_cetec_customer(
    custnum: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch customer data from Cetec API
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/customer/{custnum}"
        
        print(f"Proxying Cetec customer request: {url}")
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )


@app.get("/api/cetec/customers/list")
def get_cetec_customers_list(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch list of all customers from Cetec API
    """
    # Try multiple possible endpoints
    endpoints_to_try = [
        "/goapis/api/v1/customer/lite_list",  # Correct endpoint from docs
        "/goapis/api/v1/custvendor/list",
        "/goapis/api/v1/customer/list",
        "/goapis/api/v1/customers/list"
    ]
    
    for endpoint in endpoints_to_try:
        try:
            params = {
                "preshared_token": CETEC_CONFIG["token"],
                "rows": "5000"
            }
            
            url = f"https://{CETEC_CONFIG['domain']}{endpoint}"
            
            print(f"Trying Cetec customers endpoint: {url}")
            
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                print(f"  Response type: {type(data)}")
                if isinstance(data, dict):
                    print(f"  Response keys: {list(data.keys())}")
                
                # Handle potential nested structure
                if isinstance(data, dict):
                    if 'data' in data:
                        data = data['data']
                    elif 'customers' in data:
                        data = data['customers']
                    elif 'custvendor' in data:
                        data = data['custvendor']
                    elif 'rows' in data:
                        data = data['rows']
                
                print(f"✓ Success! Fetched {len(data) if isinstance(data, list) else 'unknown'} customers from {endpoint}")
                
                # Filter to only customers (if custvendor endpoint)
                if isinstance(data, list) and len(data) > 0:
                    if 'is_customer' in data[0]:
                        data = [item for item in data if item.get('is_customer')]
                        print(f"  Filtered to {len(data)} customers (excluded vendors)")
                
                return data
            else:
                print(f"  {endpoint} returned {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"  Error response: {error_data}")
                except:
                    print(f"  Error response: {response.text[:200]}")
                
        except requests.exceptions.RequestException as e:
            print(f"  {endpoint} failed: {str(e)}")
            continue
    
    # If all endpoints failed
    raise HTTPException(
        status_code=500,
        detail="Could not find valid Cetec customers endpoint. Tried: " + ", ".join(endpoints_to_try)
    )


@app.get("/api/cetec/sync-logs", response_model=List[schemas.CetecSyncLogResponse])
def get_cetec_sync_logs(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get Cetec sync logs for the report page.
    Shows changes from Cetec imports.
    """
    if current_user.role == UserRole.OPERATOR:
        raise HTTPException(status_code=403, detail="Operators cannot view sync reports")
    
    # Get logs from the last N days
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(CetecSyncLog).filter(
        CetecSyncLog.sync_date >= cutoff_date
    ).order_by(CetecSyncLog.sync_date.desc()).all()
    
    return logs


@app.post("/api/cetec/import", response_model=schemas.CetecImportResponse)
def import_from_cetec(
    request: schemas.CetecImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Import work orders from Cetec ERP.
    Creates new WOs or updates existing ones based on wo_number.
    Tracks all changes in cetec_sync_logs table.
    Admin only.
    """
    # Check admin permission
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can run Cetec import")
    
    sync_time = datetime.utcnow()
    changes = []
    created_count = 0
    updated_count = 0
    error_count = 0
    
    # Look up "Unassigned" status ONCE at the start
    unassigned_status = db.query(Status).filter(Status.name == "Unassigned").first()
    if not unassigned_status:
        raise HTTPException(status_code=500, detail="'Unassigned' status not found in database. Please check Status Management.")
    
    print(f"✓ Found 'Unassigned' status (id={unassigned_status.id})")
    
    try:
        # Fetch all order lines from Cetec using date range strategy
        all_order_lines = []
        
        if request.from_date and request.to_date:
            # Use date range (similar to frontend logic)
            start_date = datetime.strptime(request.from_date, "%Y-%m-%d")
            end_date = datetime.strptime(request.to_date, "%Y-%m-%d")
            
            # Calculate weeks
            weeks = []
            current_date = start_date
            
            while current_date <= end_date:
                week_end = current_date + timedelta(days=6)
                if week_end > end_date:
                    weeks.append((current_date, end_date))
                    break
                else:
                    weeks.append((current_date, week_end))
                current_date = week_end + timedelta(days=1)
            
            # Fetch each week
            for week_start, week_end in weeks:
                params = {
                    "preshared_token": CETEC_CONFIG["token"],
                    "from_date": week_start.strftime("%Y-%m-%d"),
                    "to_date": week_end.strftime("%Y-%m-%d"),
                    "format": "json"
                }
                
                if request.intercompany:
                    params["intercompany"] = "true"
                if request.transcode:
                    params["transcode"] = request.transcode
                
                url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list"
                response = requests.get(url, params=params, timeout=30)
                response.raise_for_status()
                
                batch_data = response.json() or []
                all_order_lines.extend(batch_data)
        else:
            # No date range - fetch all
            params = {
                "preshared_token": CETEC_CONFIG["token"],
                "format": "json"
            }
            
            if request.intercompany:
                params["intercompany"] = "true"
            if request.transcode:
                params["transcode"] = request.transcode
            
            url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list"
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            all_order_lines = response.json() or []
        
        # Filter by prodline
        if request.prodline:
            all_order_lines = [
                line for line in all_order_lines 
                if line.get("production_line_description") == request.prodline
            ]
        
        print(f"Fetched {len(all_order_lines)} order lines from Cetec")
        
        # Debug: Check what fields are in the first order line
        if len(all_order_lines) > 0:
            sample_fields = list(all_order_lines[0].keys())
            print(f"Sample order line fields: {sample_fields}")
            # Check for location-related fields
            location_fields = [f for f in sample_fields if 'location' in f.lower() or 'work' in f.lower()]
            print(f"Location-related fields: {location_fields}")
            if 'work_location' in all_order_lines[0]:
                print(f"  work_location value: {all_order_lines[0]['work_location']}")
        
        # Fetch ordline statuses (work locations) for mapping
        ordline_status_map = {}
        try:
            status_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlinestatus/list"
            status_response = requests.get(
                status_url,
                params={"preshared_token": CETEC_CONFIG["token"], "rows": "1000"},
                timeout=30
            )
            status_response.raise_for_status()
            statuses_data = status_response.json()
            
            print(f"Ordlinestatus response type: {type(statuses_data)}")
            print(f"Ordlinestatus response (first 500 chars): {str(statuses_data)[:500]}")
            
            # Handle if response is not an array
            if isinstance(statuses_data, dict):
                print(f"Ordlinestatus keys: {list(statuses_data.keys())}")
                if 'data' in statuses_data:
                    statuses_data = statuses_data['data']
                elif 'ordlinestatus' in statuses_data:
                    statuses_data = statuses_data['ordlinestatus']
                elif 'rows' in statuses_data:
                    statuses_data = statuses_data['rows']
            
            if isinstance(statuses_data, list):
                for status in statuses_data:
                    ordline_status_map[status.get('id')] = status.get('description', 'Unknown')
                print(f"✓ Fetched {len(ordline_status_map)} work locations")
                if len(ordline_status_map) > 0:
                    # Show sample mapping
                    sample = list(ordline_status_map.items())[:3]
                    print(f"  Sample locations: {sample}")
            else:
                print(f"ERROR: statuses_data is not a list after extraction: {type(statuses_data)}")
        except Exception as e:
            print(f"WARNING: Could not fetch work locations: {e}")
        
        # Process each order line
        for order_line in all_order_lines:
            try:
                ordline_id = order_line.get("ordline_id")
                ordernum = order_line.get("ordernum")
                lineitem = order_line.get("lineitem")
                
                if not all([ordline_id, ordernum, lineitem]):
                    error_count += 1
                    continue
                
                wo_number = f"{ordernum}-{lineitem}"
                
                # Fetch combined data (location maps + operations)
                combined_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_maps"
                combined_response = requests.get(
                    combined_url,
                    params={"preshared_token": CETEC_CONFIG["token"], "include_children": "true"},
                    timeout=30
                )
                combined_response.raise_for_status()
                location_maps = combined_response.json()
                
                # Find SMT location and operation
                smt_location = None
                smt_operation = None
                
                for loc in location_maps:
                    loc_str = str(loc).upper()
                    if 'SMT' in loc_str and ('PRODUCTION' in loc_str or 'PROD' in loc_str):
                        smt_location = loc
                        operations = loc.get('operations', [])
                        for op in operations:
                            if op.get('name') == 'SMT ASSEMBLY' or 'ASSEMBLY' in op.get('name', '').upper():
                                smt_operation = op
                                break
                        break
                
                # Calculate time (rounded to nearest minute) - Fixed None handling
                time_minutes = 0
                if smt_location and smt_operation:
                    # Safely convert None values to numbers
                    avg_secs = int(smt_operation.get('avg_secs') or 0)
                    repetitions = int(smt_operation.get('repetitions') or 1)
                    balance_due = int(order_line.get('balancedue') or order_line.get('release_qty') or order_line.get('orig_order_qty') or 0)
                    
                    # Only calculate if all values are positive
                    if avg_secs > 0 and repetitions > 0 and balance_due > 0:
                        time_minutes = round((avg_secs * repetitions * balance_due) / 60)
                
                # Skip if no time calculated
                if time_minutes == 0:
                    continue
                
                # Determine material status
                short_allocation = order_line.get('short_per_allocation', False)
                short_shelf = order_line.get('short_per_shelf', False)
                material_status = "Ready"
                if short_allocation and short_shelf:
                    material_status = "Shortage"
                elif short_allocation or short_shelf:
                    material_status = "Partial"
                
                # Get current location (work_location field contains the status ID)
                work_location_id = order_line.get('work_location')
                current_location = ordline_status_map.get(work_location_id, 'Unknown') if work_location_id else 'Unknown'
                
                # Debug logging for first few records
                if created_count + updated_count < 3:
                    print(f"  WO {wo_number}: work_location_id={work_location_id}, mapped to '{current_location}'")
                
                # Prepare WO data
                prcpart = order_line.get('prcpart', '')
                revision = order_line.get('revision', '')
                customer = order_line.get('customer', '')
                quantity = order_line.get('balancedue') or order_line.get('release_qty') or order_line.get('orig_order_qty') or 0
                promisedate_str = order_line.get('promisedate') or order_line.get('target_ship_date')
                cetec_ship_date = datetime.strptime(promisedate_str, "%Y-%m-%d").date() if promisedate_str else date.today()
                
                # Check if WO exists
                existing_wo = db.query(WorkOrder).filter(WorkOrder.wo_number == wo_number).first()
                
                if existing_wo:
                    # UPDATE existing WO
                    has_changes = False
                    
                    # If existing WO has no status_id, set it to Unassigned
                    if existing_wo.status_id is None:
                        existing_wo.status_id = unassigned_status.id
                        has_changes = True
                        print(f"  WO {wo_number}: Setting null status_id to Unassigned (id={unassigned_status.id})")
                    
                    # Track changes
                    if existing_wo.quantity != quantity:
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="qty_changed",
                            field_name="quantity",
                            old_value=str(existing_wo.quantity),
                            new_value=str(quantity),
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.quantity = quantity
                        has_changes = True
                    
                    if existing_wo.cetec_ship_date != cetec_ship_date:
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="date_changed",
                            field_name="cetec_ship_date",
                            old_value=str(existing_wo.cetec_ship_date),
                            new_value=str(cetec_ship_date),
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.cetec_ship_date = cetec_ship_date
                        has_changes = True
                    
                    if existing_wo.time_minutes != time_minutes:
                        existing_wo.time_minutes = time_minutes
                        has_changes = True
                    
                    if existing_wo.current_location != current_location:
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="location_changed",
                            field_name="current_location",
                            old_value=existing_wo.current_location,
                            new_value=current_location,
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.current_location = current_location
                        has_changes = True
                    
                    if existing_wo.material_status != material_status:
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="material_changed",
                            field_name="material_status",
                            old_value=existing_wo.material_status,
                            new_value=material_status,
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.material_status = material_status
                        has_changes = True
                    
                    if has_changes:
                        existing_wo.last_cetec_sync = sync_time
                        
                        # Recalculate min_start_date if ship date or time changed
                        if existing_wo.line_id:
                            line = db.query(SMTLine).filter(SMTLine.id == existing_wo.line_id).first()
                            existing_wo = sched.update_work_order_calculations(existing_wo, line)
                        else:
                            existing_wo = sched.update_work_order_calculations(existing_wo, None)
                        
                        updated_count += 1
                
                else:
                    # CREATE new WO with Unassigned status
                    new_wo = WorkOrder(
                        wo_number=wo_number,
                        assembly=prcpart,
                        revision=revision,
                        customer=customer,
                        quantity=quantity,
                        time_minutes=time_minutes,
                        cetec_ship_date=cetec_ship_date,
                        cetec_ordline_id=ordline_id,
                        current_location=current_location,
                        material_status=material_status,
                        last_cetec_sync=sync_time,
                        priority=Priority.FACTORY_DEFAULT,
                        status_id=unassigned_status.id,  # Use Status table (looked up at start)
                        status=None,  # Leave legacy enum as None
                        is_complete=False
                    )
                    
                    # Calculate min_start_date, actual_ship_date, setup_time
                    # Note: Calculations work for ANY status - status doesn't affect the calculation
                    new_wo = sched.update_work_order_calculations(new_wo, None)
                    
                    db.add(new_wo)
                    
                    # Log creation
                    changes.append(CetecSyncLog(
                        sync_date=sync_time,
                        wo_number=wo_number,
                        change_type="created",
                        field_name=None,
                        old_value=None,
                        new_value=f"New WO: {prcpart}",
                        cetec_ordline_id=ordline_id
                    ))
                    created_count += 1
                
            except Exception as e:
                print(f"Error processing ordline {ordline_id}: {str(e)}")
                error_count += 1
                continue
        
        # Save changes
        for change in changes:
            db.add(change)
        
        db.commit()
        
        # Fetch the saved changes with IDs
        change_responses = [
            schemas.CetecSyncLogResponse.from_orm(change)
            for change in changes
        ]
        
        return schemas.CetecImportResponse(
            success=True,
            message=f"Import complete: {created_count} created, {updated_count} updated, {error_count} errors",
            total_fetched=len(all_order_lines),
            created_count=created_count,
            updated_count=updated_count,
            error_count=error_count,
            changes=change_responses
        )
        
    except Exception as e:
        db.rollback()
        print(f"Import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

