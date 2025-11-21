"""
Main FastAPI application - CRITICAL FIX FOR PRODUCTION
- Fixed None value handling in time calculations
- Import ALL work orders regardless of location
- Railway deployment issue - forcing new deployment
"""
from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta, datetime
import requests
import base64
from cryptography.fernet import Fernet

from database import engine, get_db, Base, SessionLocal
from models import WorkOrder, SMTLine, CompletedWorkOrder, WorkOrderStatus, Priority, User, UserRole, CapacityOverride, Shift, ShiftBreak, LineConfiguration, Status, IssueType, Issue, IssueSeverity, IssueStatus, ResolutionType, CetecSyncLog, Settings
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
    print("🚀 CRITICAL FIX DEPLOYED - None value handling fixed!")
    print("🚀 Running database migrations and seed...")
    try:
        from seed_data import main as seed_main
        seed_main()
        
        # Load Metabase credentials after database is ready
        print("🔑 Loading Metabase credentials...")
        try:
            db = next(get_db())
            load_metabase_credentials(db)
        except Exception as e:
            print(f"⚠️  Could not load Metabase credentials: {e}")
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
    include_completed_work: bool = False,
    include_doc_control: bool = False,
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
    
    # Cetec progress filtering for Progress Dashboard
    if include_completed_work:
        # Temporarily show all work orders for testing
        # Will add proper filtering once Cetec data is imported
        pass
    
    if line_id:
        query = query.filter(WorkOrder.line_id == line_id)
        # Debug: Log how many jobs are found for this line
        count = query.count()
        print(f"🔍 API: Found {count} jobs for line_id={line_id}")
    
    if status:
        # Filter by status name (using new Status table)
        status_obj = db.query(Status).filter(Status.name == status).first()
        if status_obj:
            query = query.filter(WorkOrder.status_id == status_obj.id)
    
    if priority:
        query = query.filter(WorkOrder.priority == priority)
    
    work_orders = query.order_by(WorkOrder.line_position).all()

    if include_completed_work and not include_doc_control:
        original_count = len(work_orders)

        def is_doc_control(location: Optional[str]) -> bool:
            if not location:
                return False
            normalized = location.upper()
            return "DOC CONTROL" in normalized or "UNRELEASED" in normalized

        work_orders = [wo for wo in work_orders if not is_doc_control(wo.current_location)]

        filtered_count = len(work_orders)
        if original_count != filtered_count:
            print(
                f"📦 Progress API: filtered out {original_count - filtered_count} DOC CONTROL work orders"
            )
    
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


@app.get("/api/capacity/current")
def get_current_capacity(
    db: Session = Depends(get_db)
):
    """
    Get current capacity for all lines (today's effective hours).
    Takes into account capacity overrides and shows actual vs default hours.
    """
    from scheduler import get_capacity_for_date
    from datetime import date
    
    today = date.today()
    
    # Get all active lines
    lines = db.query(SMTLine).filter(SMTLine.is_active == True).all()
    
    result = {}
    for line in lines:
        # Get actual capacity for today
        actual_capacity = get_capacity_for_date(db, line.id, today, line.hours_per_day)
        
        # Debug logging
        print(f"🔍 Line {line.id} ({line.name}): default={line.hours_per_day}h, actual={actual_capacity}h, override={actual_capacity != line.hours_per_day}")
        
        result[line.id] = {
            "line_id": line.id,
            "line_name": line.name,
            "default_hours_per_day": line.hours_per_day,
            "actual_hours_today": actual_capacity,
            "is_override": actual_capacity != line.hours_per_day,
            "is_down": actual_capacity == 0
        }
    
    return result


@app.get("/api/capacity/overrides")
def get_capacity_overrides(
    start_date: Optional[date] = None,
    weeks: int = 8,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get capacity overrides for all lines in a date range.
    Used by visual scheduler to show maintenance/downtime.
    """
    # Default to current week's Sunday
    if not start_date:
        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        start_date = today - timedelta(days=days_since_sunday)
    
    end_date = start_date + timedelta(weeks=weeks)
    
    # Get all overrides in the date range
    overrides = db.query(CapacityOverride).filter(
        CapacityOverride.start_date <= end_date,
        CapacityOverride.end_date >= start_date
    ).all()
    
    # Group by line_id for easier frontend consumption
    overrides_by_line = {}
    for override in overrides:
        if override.line_id not in overrides_by_line:
            overrides_by_line[override.line_id] = []
        overrides_by_line[override.line_id].append({
            "id": override.id,
            "start_date": override.start_date,
            "end_date": override.end_date,
            "total_hours": override.total_hours,
            "reason": override.reason,
            "shift_config": override.shift_config,
            "is_down": override.total_hours == 0  # Line is down if 0 hours
        })
    
    result = {
        "start_date": start_date,
        "end_date": end_date,
        "overrides_by_line": overrides_by_line
    }
    
    # Debug logging
    print(f"🔍 Capacity Overrides API Response: {len(overrides)} overrides found for date range {start_date} to {end_date}")
    if len(overrides) == 0:
        print("   No capacity overrides found in this date range")
    else:
        for line_id, line_overrides in overrides_by_line.items():
            for override in line_overrides:
                print(f"   Line {line_id}: {override['start_date']} to {override['end_date']}, {override['total_hours']}h, down={override['is_down']}")
    
    return result


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

METABASE_CONFIG = {
    "base_url": "https://sandy-metabase.cetecerp.com",
    "api_key": "mb_UfMbPhr9R640GAR5wLpUPMcSSxb98weRladg5TUvWLs=",
    # Session-based auth (alternative to API key)
    "use_session_auth": False,  # Set to True to use session auth instead
    "session_token": None  # Will be set after login
}

# ============================================================================
# METABASE API INTEGRATION
# ============================================================================

def get_encryption_key():
    """Generate a Fernet key from SECRET_KEY"""
    secret_key = config_settings.SECRET_KEY.encode()
    # Fernet requires 32-byte key, so we'll hash the SECRET_KEY
    from hashlib import sha256
    key = sha256(secret_key).digest()
    return base64.urlsafe_b64encode(key)

def encrypt_password(password: str) -> str:
    """Encrypt a password using Fernet"""
    key = get_encryption_key()
    f = Fernet(key)
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a password using Fernet"""
    try:
        key = get_encryption_key()
        f = Fernet(key)
        return f.decrypt(encrypted_password.encode()).decode()
    except Exception as e:
        print(f"❌ Error decrypting password: {e}")
        return ""

def get_metabase_setting(db: Session, key: str) -> Optional[str]:
    """Get a Metabase setting from the database"""
    setting = db.query(Settings).filter(Settings.key == key).first()
    return setting.value if setting else None

def set_metabase_setting(db: Session, key: str, value: str, description: str = None):
    """Set a Metabase setting in the database"""
    setting = db.query(Settings).filter(Settings.key == key).first()
    if setting:
        setting.value = value
        if description:
            setting.description = description
        setting.updated_at = datetime.utcnow()
    else:
        setting = Settings(
            key=key,
            value=value,
            description=description
        )
        db.add(setting)
    db.commit()
    return setting

def load_metabase_credentials(db: Session):
    """Load Metabase credentials from database and attempt auto-login"""
    try:
        session_token = get_metabase_setting(db, "metabase_session_token")
        username = get_metabase_setting(db, "metabase_username")
        encrypted_password = get_metabase_setting(db, "metabase_password")
        
        # If we have a session token, try to use it
        if session_token:
            print(f"🔑 Loading stored Metabase session token...")
            METABASE_CONFIG["session_token"] = session_token
            METABASE_CONFIG["use_session_auth"] = True
            
            # Validate the token by making a test request
            try:
                headers = {
                    "X-Metabase-Session": session_token,
                    "Content-Type": "application/json"
                }
                test_url = f"{METABASE_CONFIG['base_url']}/api/session/properties"
                response = requests.get(test_url, headers=headers, timeout=10)
                if response.status_code == 200:
                    print(f"   ✅ Stored session token is valid")
                    return True
                else:
                    print(f"   ⚠️  Stored session token is invalid (status {response.status_code}), attempting auto-login...")
            except Exception as e:
                print(f"   ⚠️  Error validating session token: {e}, attempting auto-login...")
        
        # If no valid session token, try auto-login with stored credentials
        if username and encrypted_password:
            password = decrypt_password(encrypted_password)
            if password:
                print(f"🔑 Attempting auto-login with stored credentials...")
                try:
                    url = f"{METABASE_CONFIG['base_url']}/api/session"
                    headers = {"Content-Type": "application/json"}
                    response = requests.post(
                        url,
                        headers=headers,
                        json={"username": username, "password": password},
                        timeout=30
                    )
                    if response.status_code == 200:
                        data = response.json()
                        session_token = data.get('id')
                        if session_token:
                            METABASE_CONFIG["session_token"] = session_token
                            METABASE_CONFIG["use_session_auth"] = True
                            # Save the new session token
                            set_metabase_setting(db, "metabase_session_token", session_token, "Metabase session token")
                            print(f"   ✅ Auto-login successful! Session token saved.")
                            return True
                except Exception as e:
                    print(f"   ❌ Auto-login failed: {e}")
        
        print(f"   ℹ️  No stored credentials found or auto-login failed. Manual login required.")
        return False
        
    except Exception as e:
        print(f"❌ Error loading Metabase credentials: {e}")
        return False

def get_metabase_headers():
    """Get headers for Metabase API requests"""
    # Use session token if available, otherwise use API key
    use_session = METABASE_CONFIG.get("use_session_auth", False)
    session_token = METABASE_CONFIG.get("session_token")
    
    print(f"🔑 Auth check: use_session={use_session}, has_token={bool(session_token)}")
    
    if use_session and session_token:
        print(f"   ✅ Using session token: {session_token[:20]}...")
        return {
            "X-Metabase-Session": session_token,
            "Content-Type": "application/json"
        }

    # Attempt to load or refresh session automatically using stored credentials
    if ensure_metabase_session():
        session_token = METABASE_CONFIG.get("session_token")
        if session_token:
            print(f"   ✅ Session token refreshed: {session_token[:20]}...")
            return {
                "X-Metabase-Session": session_token,
                "Content-Type": "application/json"
            }

    print(f"   ⚠️  Using API key (session not available)")
    return {
        "X-Metabase-Api-Key": METABASE_CONFIG["api_key"],
        "Content-Type": "application/json"
    }

@app.post("/api/metabase/login")
def metabase_login(
    credentials: dict,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Login to Metabase and get a session token
    This allows access to endpoints that the API key cannot access
    Credentials are saved to the database for automatic login on next startup
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/session"
        headers = {"Content-Type": "application/json"}
        
        print(f"🔍 Logging into Metabase: {url}")
        
        username = credentials.get('username')
        password = credentials.get('password')
        save_credentials = credentials.get('save_credentials', True)  # Default to saving
        
        if not username or not password:
            raise HTTPException(
                status_code=400,
                detail="Username and password are required"
            )
        
        response = requests.post(
            url, 
            headers=headers, 
            json={"username": username, "password": password},
            timeout=30
        )
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            session_token = data.get('id')
            
            if session_token:
                METABASE_CONFIG["session_token"] = session_token
                METABASE_CONFIG["use_session_auth"] = True
                print(f"   ✅ Session token obtained: {session_token[:20]}...")
                print(f"   ✅ Session auth enabled: {METABASE_CONFIG['use_session_auth']}")
                
                # Save credentials to database for future auto-login
                if save_credentials:
                    try:
                        set_metabase_setting(db, "metabase_session_token", session_token, "Metabase session token")
                        set_metabase_setting(db, "metabase_username", username, "Metabase username for auto-login")
                        encrypted_password = encrypt_password(password)
                        set_metabase_setting(db, "metabase_password", encrypted_password, "Metabase password (encrypted) for auto-login")
                        print(f"   ✅ Credentials saved to database for auto-login")
                    except Exception as e:
                        print(f"   ⚠️  Could not save credentials: {e}")
                
                return {
                    "success": True,
                    "message": "Successfully logged into Metabase. Session token is now active for all API calls." + 
                               (" Credentials saved for automatic login." if save_credentials else ""),
                    "session_token_preview": session_token[:20] + "...",
                    "credentials_saved": save_credentials
                }
            else:
                return {
                    "success": False,
                    "message": "Login successful but no session token in response",
                    "response": data
                }
        else:
            error_text = response.text[:500] if response.text else "No error message"
            print(f"   ❌ Login failed: {error_text}")
            return {
                "success": False,
                "status_code": response.status_code,
                "message": f"Login failed: {error_text}"
            }
            
    except requests.exceptions.RequestException as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Metabase login error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to login to Metabase: {str(e)}"
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Unexpected error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

@app.get("/api/metabase/test")
def test_metabase_connection(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Test connection to Metabase API - tries multiple authentication formats and endpoints
    """
    base_url = METABASE_CONFIG['base_url']
    api_key = METABASE_CONFIG['api_key']
    
    # Try different authentication formats
    auth_formats = [
        {
            "name": "X-Metabase-Api-Key",
            "headers": {
                "X-Metabase-Api-Key": api_key,
                "Content-Type": "application/json"
            }
        },
        {
            "name": "Authorization Bearer",
            "headers": {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        }
    ]
    
    # Test different endpoints to see what the API key can access
    test_endpoints = [
        {"name": "Session Properties", "url": f"{base_url}/api/session/properties", "method": "GET"},
        {"name": "Databases", "url": f"{base_url}/api/database", "method": "GET"},
        {"name": "Cards", "url": f"{base_url}/api/card", "method": "GET"},
        {"name": "Dashboards", "url": f"{base_url}/api/dashboard", "method": "GET"},
        {"name": "Dashboard 64", "url": f"{base_url}/api/dashboard/64", "method": "GET"},
    ]
    
    results = []
    working_format = None
    
    # First, find which auth format works
    for auth_format in auth_formats:
        try:
            url = f"{base_url}/api/session/properties"
            print(f"🔍 Testing auth format {auth_format['name']}: {url}")
            
            response = requests.get(url, headers=auth_format['headers'], timeout=30)
            
            if response.status_code == 200:
                working_format = auth_format['name']
                print(f"   ✅ {auth_format['name']} works!")
                break
        except:
            continue
    
    if not working_format:
        return {
            "success": False,
            "message": "None of the authentication formats worked",
            "api_key_preview": api_key[:10] + "...",
        }
    
    # Use the working format to test endpoints
    headers = auth_formats[0]['headers'] if working_format == "X-Metabase-Api-Key" else auth_formats[1]['headers']
    
    endpoint_results = []
    for endpoint in test_endpoints:
        try:
            print(f"🔍 Testing endpoint: {endpoint['name']}")
            if endpoint['method'] == 'GET':
                response = requests.get(endpoint['url'], headers=headers, timeout=30)
            else:
                response = requests.post(endpoint['url'], headers=headers, timeout=30)
            
            result = {
                "endpoint": endpoint['name'],
                "url": endpoint['url'],
                "status_code": response.status_code,
                "success": response.status_code == 200
            }
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    result["message"] = "Success"
                    if isinstance(data, list):
                        result["count"] = len(data)
                    elif isinstance(data, dict) and 'data' in data:
                        result["count"] = len(data.get('data', []))
                except:
                    result["message"] = "Success (non-JSON response)"
            else:
                error_text = response.text[:200] if response.text else "No error message"
                result["message"] = f"Status {response.status_code}: {error_text}"
                result["error"] = error_text
            
            endpoint_results.append(result)
            print(f"   {'✅' if result['success'] else '❌'} {endpoint['name']}: {response.status_code}")
            
        except Exception as e:
            endpoint_results.append({
                "endpoint": endpoint['name'],
                "url": endpoint['url'],
                "success": False,
                "error": str(e)
            })
            print(f"   ❌ {endpoint['name']}: {str(e)}")
    
    return {
        "success": True,
        "working_format": working_format,
        "message": f"Connection successful using {working_format}",
        "endpoint_tests": endpoint_results
    }

@app.get("/api/metabase/databases")
def get_metabase_databases(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get list of databases available in Metabase
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/database"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching Metabase databases: {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        databases = response.json()
        
        print(f"   ✅ Found {len(databases.get('data', []))} databases")
        
        return {
            "success": True,
            "count": len(databases.get('data', [])),
            "databases": databases.get('data', [])
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch databases from Metabase: {str(e)}"
        )

@app.get("/api/metabase/database/{database_id}/tables")
def get_metabase_tables(
    database_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get list of tables in a specific database
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/database/{database_id}/metadata"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching tables for database {database_id}: {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        metadata = response.json()
        tables = metadata.get('tables', [])
        
        print(f"   ✅ Found {len(tables)} tables")
        
        return {
            "success": True,
            "database_id": database_id,
            "count": len(tables),
            "tables": tables
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch tables from Metabase: {str(e)}"
        )

@app.get("/api/metabase/database/{database_id}/table/{table_id}/fields")
def get_metabase_table_fields(
    database_id: int,
    table_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get fields/columns for a specific table
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/table/{table_id}/query_metadata"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching fields for table {table_id}: {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        metadata = response.json()
        fields = metadata.get('fields', [])
        
        print(f"   ✅ Found {len(fields)} fields")
        
        return {
            "success": True,
            "database_id": database_id,
            "table_id": table_id,
            "count": len(fields),
            "fields": fields
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch fields from Metabase: {str(e)}"
        )

@app.post("/api/metabase/database/{database_id}/query")
def execute_metabase_query(
    database_id: int,
    query: dict,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Execute a native SQL query or query builder query against a Metabase database
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/database/{database_id}/query"
        headers = get_metabase_headers()
        
        print(f"🔍 Executing query on database {database_id}: {url}")
        print(f"   Query: {query}")
        
        response = requests.post(url, headers=headers, json=query, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        
        print(f"   ✅ Query executed successfully")
        
        return {
            "success": True,
            "database_id": database_id,
            "result": result
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute query: {str(e)}"
        )

@app.get("/api/metabase/test-card-984")
def test_metabase_card_984(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Test Metabase Card 984 directly to debug Work Order Move page issue
    """
    try:
        print("🧪 Testing Metabase Card 984 for debugging...")
        
        card_id = 984
        url = f"{METABASE_CONFIG['base_url']}/api/card/{card_id}/query"
        headers = get_metabase_headers()
        
        # Execute the card with prodline 300 filter
        request_body = {"prodline": "300"}
        
        print(f"   URL: {url}")
        print(f"   Headers: {headers}")
        print(f"   Body: {request_body}")
        
        response = requests.post(url, headers=headers, json=request_body, timeout=30)
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code not in [200, 202]:
            error_text = response.text[:1000]
            print(f"   Error: {error_text}")
            return {
                "success": False,
                "error": f"Status {response.status_code}: {error_text}",
                "card_id": card_id
            }
        
        try:
            result = response.json()
        except ValueError as e:
            print(f"   JSON parse error: {str(e)}")
            return {
                "success": False,
                "error": f"Invalid JSON: {str(e)}",
                "card_id": card_id
            }
        
        # Extract data
        data_rows = []
        columns = []
        
        if 'data' in result:
            data_rows = result['data'].get('rows', [])
            columns = result['data'].get('cols', [])
        
        print(f"   Rows: {len(data_rows)}")
        print(f"   Columns: {len(columns)}")
        
        # Show column names
        column_names = [col.get('name', 'unknown') for col in columns]
        print(f"   Column names: {column_names}")
        
        # Show first few rows
        sample_rows = data_rows[:3] if data_rows else []
        print(f"   Sample rows: {sample_rows}")
        
        return {
            "success": True,
            "card_id": card_id,
            "row_count": len(data_rows),
            "column_count": len(columns),
            "column_names": column_names,
            "sample_rows": sample_rows,
            "full_result_keys": list(result.keys()) if isinstance(result, dict) else "not_dict"
        }
        
    except Exception as e:
        print(f"   Exception: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "card_id": 984
        }

@app.post("/api/metabase/query/native")
def execute_native_sql_query(
    query_request: dict,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Execute a native SQL query through Metabase
    Test if we can run custom SQL queries for more flexible data access
    
    Expected format:
    {
        "database_id": 1,
        "sql": "SELECT * FROM ordlines WHERE prodline = '300' LIMIT 10",
        "parameters": {}
    }
    """
    try:
        database_id = query_request.get("database_id")
        sql = query_request.get("sql")
        parameters = query_request.get("parameters", {})
        
        if not database_id or not sql:
            raise HTTPException(status_code=400, detail="database_id and sql are required")
        
        # Construct Metabase native query
        metabase_query = {
            "type": "native",
            "native": {
                "query": sql,
                "template-tags": parameters
            },
            "database": database_id
        }
        
        url = f"{METABASE_CONFIG['base_url']}/api/dataset"
        headers = get_metabase_headers()
        
        print(f"🔍 Executing native SQL query on database {database_id}")
        print(f"   SQL: {sql[:100]}...")
        
        response = requests.post(url, headers=headers, json=metabase_query, timeout=60)
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code not in [200, 202]:
            error_text = response.text[:1000]
            print(f"   ❌ Error: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Metabase query failed: {error_text}"
            )
        
        result = response.json()
        
        # Extract data
        data_rows = []
        columns = []
        
        if 'data' in result:
            data_rows = result['data'].get('rows', [])
            columns = result['data'].get('cols', [])
        
        print(f"   ✅ Query successful: {len(data_rows)} rows returned")
        
        return {
            "success": True,
            "database_id": database_id,
            "sql": sql,
            "row_count": len(data_rows),
            "columns": [{"name": col.get("name"), "type": col.get("base_type")} for col in columns],
            "data": data_rows[:100],  # Limit to first 100 rows for response size
            "truncated": len(data_rows) > 100
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error executing native query: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute query: {str(e)}"
        )

@app.get("/api/metabase/cards")
def get_metabase_cards(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get list of saved questions/cards in Metabase
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/card"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching Metabase cards: {url}")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        cards = response.json()
        
        print(f"   ✅ Found {len(cards)} cards")
        
        return {
            "success": True,
            "count": len(cards),
            "cards": cards
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch cards from Metabase: {str(e)}"
        )

@app.post("/api/metabase/card/{card_id}/query")
def execute_metabase_card(
    card_id: int,
    parameters: Optional[dict] = Body(None),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Execute a saved Metabase card/question
    Can pass parameters to filter the query (e.g., {"prodline": "300"})
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/card/{card_id}/query"
        headers = get_metabase_headers()
        
        # Build parameters for the query
        query_params = parameters if parameters else {}
        
        print(f"🔍 Executing card {card_id}: {url}")
        print(f"   Parameters: {query_params}")
        
        response = requests.post(url, headers=headers, json=query_params, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        
        print(f"   ✅ Card executed successfully")
        
        return {
            "success": True,
            "card_id": card_id,
            "parameters": query_params,
            "result": result
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute card: {str(e)}"
        )

@app.get("/api/metabase/dashboard/{dashboard_id}")
def get_metabase_dashboard(
    dashboard_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get dashboard details including all cards/questions on it
    If direct dashboard access fails, try alternative approaches
    """
    try:
        url = f"{METABASE_CONFIG['base_url']}/api/dashboard/{dashboard_id}"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching dashboard {dashboard_id}: {url}")
        print(f"   Using auth: {'Session' if 'X-Metabase-Session' in headers else 'API Key'}")
        # Don't print full headers with tokens for security
        header_keys = list(headers.keys())
        print(f"   Header keys: {header_keys}")
        
        response = requests.get(url, headers=headers, timeout=30)
        
        print(f"   Response status: {response.status_code}")
        print(f"   Response headers: {dict(response.headers)}")
        
        if response.status_code == 401:
            # API key doesn't have dashboard permissions - try alternative approach
            print(f"   ⚠️  Dashboard endpoint returned 401 - API key may lack permissions")
            print(f"   🔄 Trying alternative: List all dashboards to find {dashboard_id}")
            
            # Try listing all dashboards first
            list_url = f"{METABASE_CONFIG['base_url']}/api/dashboard"
            list_response = requests.get(list_url, headers=headers, timeout=30)
            
            if list_response.status_code == 200:
                try:
                    dashboards = list_response.json()
                    # Find the specific dashboard in the list
                    dashboard = None
                    if isinstance(dashboards, list):
                        dashboard = next((d for d in dashboards if d.get('id') == dashboard_id), None)
                    elif isinstance(dashboards, dict) and 'data' in dashboards:
                        dashboard = next((d for d in dashboards['data'] if d.get('id') == dashboard_id), None)
                    
                    if dashboard:
                        print(f"   ✅ Found dashboard {dashboard_id} in list")
                        # Try to get cards from the dashboard object or fetch them separately
                        card_ids = []
                        dashcards_info = []
                        
                        if 'dashcards' in dashboard:
                            for dashcard in dashboard['dashcards']:
                                if 'card' in dashcard and 'id' in dashcard['card']:
                                    card_id = dashcard['card']['id']
                                    card_ids.append(card_id)
                                    dashcards_info.append({
                                        "dashcard_id": dashcard.get('id'),
                                        "card_id": card_id,
                                        "card_name": dashcard['card'].get('name', 'Unknown')
                                    })
                        elif 'ordered_cards' in dashboard:
                            for card in dashboard['ordered_cards']:
                                if 'card' in card and 'id' in card['card']:
                                    card_id = card['card']['id']
                                    card_ids.append(card_id)
                                    dashcards_info.append({
                                        "card_id": card_id,
                                        "card_name": card['card'].get('name', 'Unknown')
                                    })
                        
                        return {
                            "success": True,
                            "dashboard_id": dashboard_id,
                            "dashboard": dashboard,
                            "card_ids": card_ids,
                            "dashcards": dashcards_info,
                            "note": "Retrieved via dashboard list (direct access not permitted)"
                        }
                except Exception as e:
                    print(f"   ⚠️  Could not parse dashboard list: {str(e)}")
            
            # If listing also fails, return helpful error
            error_text = response.text[:500] if response.text else "No error message"
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Metabase API returned {response.status_code}: {error_text}. The API key may not have permissions to access dashboards. Please check the API key's group permissions in Metabase."
            )
        
        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error message"
            print(f"   ❌ Error response: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Metabase API returned {response.status_code}: {error_text}"
            )
        
        try:
            dashboard = response.json()
        except ValueError as e:
            print(f"   ❌ JSON parse error: {str(e)}")
            print(f"   Response text: {response.text[:500]}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse Metabase response as JSON: {str(e)}"
            )
        
        # Extract card IDs from dashboard
        # Metabase uses 'dashcards' (not 'ordered_cards') for the cards on a dashboard
        card_ids = []
        dashcards_info = []
        
        if 'dashcards' in dashboard:
            for dashcard in dashboard['dashcards']:
                if 'card' in dashcard and 'id' in dashcard['card']:
                    card_id = dashcard['card']['id']
                    card_ids.append(card_id)
                    dashcards_info.append({
                        "dashcard_id": dashcard.get('id'),
                        "card_id": card_id,
                        "card_name": dashcard['card'].get('name', 'Unknown'),
                        "row": dashcard.get('row'),
                        "col": dashcard.get('col'),
                        "size_x": dashcard.get('size_x'),
                        "size_y": dashcard.get('size_y')
                    })
        elif 'ordered_cards' in dashboard:
            # Fallback for older Metabase versions
            for card in dashboard['ordered_cards']:
                if 'card' in card and 'id' in card['card']:
                    card_id = card['card']['id']
                    card_ids.append(card_id)
                    dashcards_info.append({
                        "card_id": card_id,
                        "card_name": card['card'].get('name', 'Unknown')
                    })
        
        print(f"   ✅ Found dashboard with {len(card_ids)} cards")
        if card_ids:
            print(f"   📊 Card IDs: {card_ids}")
        
        return {
            "success": True,
            "dashboard_id": dashboard_id,
            "dashboard": dashboard,
            "card_ids": card_ids,
            "dashcards": dashcards_info
        }
        
    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Metabase API request error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch dashboard: {str(e)}"
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Unexpected error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

@app.get("/api/metabase/dashboard/{dashboard_id}/query")
def execute_dashboard_with_params(
    dashboard_id: int,
    prodline: Optional[str] = None,
    build_operation: Optional[str] = None,
    order_number: Optional[str] = None,
    ordline_status: Optional[str] = None,
    prc_part_partial: Optional[str] = None,
    prod_status: Optional[str] = None,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Execute all cards on a dashboard with filter parameters
    This mimics what happens when you view a dashboard with URL parameters
    """
    try:
        # First get the dashboard to find its cards
        dashboard_url = f"{METABASE_CONFIG['base_url']}/api/dashboard/{dashboard_id}"
        headers = get_metabase_headers()
        
        print(f"🔍 Fetching dashboard {dashboard_id} for execution")
        print(f"   URL: {dashboard_url}")
        print(f"   Headers: {headers}")
        
        dashboard_response = requests.get(dashboard_url, headers=headers, timeout=30)
        
        print(f"   Dashboard response status: {dashboard_response.status_code}")
        
        if dashboard_response.status_code != 200:
            error_text = dashboard_response.text[:500] if dashboard_response.text else "No error message"
            print(f"   ❌ Error response: {error_text}")
            raise HTTPException(
                status_code=dashboard_response.status_code,
                detail=f"Metabase API returned {dashboard_response.status_code}: {error_text}"
            )
        
        try:
            dashboard = dashboard_response.json()
        except ValueError as e:
            print(f"   ❌ JSON parse error: {str(e)}")
            print(f"   Response text: {dashboard_response.text[:500]}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse Metabase response as JSON: {str(e)}"
            )
        
        # Build parameters dict from query params
        parameters = {}
        if prodline:
            parameters['prodline'] = prodline
        if build_operation:
            parameters['build_operation'] = build_operation
        if order_number:
            parameters['order_number'] = order_number
        if ordline_status:
            parameters['ordline_status'] = ordline_status
        if prc_part_partial:
            parameters['prc_part_partial'] = prc_part_partial
        if prod_status:
            parameters['prod_status'] = prod_status
        
        # Extract and execute each card
        # Metabase uses 'dashcards' (not 'ordered_cards')
        results = []
        cards_to_execute = []
        
        if 'dashcards' in dashboard:
            cards_to_execute = dashboard['dashcards']
        elif 'ordered_cards' in dashboard:
            cards_to_execute = dashboard['ordered_cards']
        
        # Build parameter mappings from dashboard parameters
        # Metabase expects parameters in format: {"parameter_id": "value"}
        # Dashboard parameters have slugs (like "prodline") and IDs (like "cf976df3")
        dashboard_params = dashboard.get('parameters', [])
        param_slug_to_id = {}
        param_id_to_type = {}
        for param in dashboard_params:
            slug = param.get('slug')
            param_id = param.get('id')
            param_type = param.get('type')
            if slug and param_id:
                param_slug_to_id[slug] = param_id
            if param_id:
                param_id_to_type[param_id] = param_type
        
        print(f"   🔍 Dashboard parameters found: {len(dashboard_params)}")
        for param in dashboard_params:
            print(f"      - {param.get('slug')} (ID: {param.get('id')}, Type: {param.get('type')})")
        
        # Convert our query params to Metabase parameter format
        # Metabase expects: {"parameter_id": "value"} or {"parameter_id": ["value"]} for multi-select
        metabase_params = {}
        if prodline and 'prodline' in param_slug_to_id:
            param_id = param_slug_to_id['prodline']
            metabase_params[param_id] = prodline
        if build_operation and 'build_operation' in param_slug_to_id:
            param_id = param_slug_to_id['build_operation']
            metabase_params[param_id] = build_operation
        if order_number and 'order_number' in param_slug_to_id:
            param_id = param_slug_to_id['order_number']
            metabase_params[param_id] = order_number
        if ordline_status and 'ordline_status' in param_slug_to_id:
            param_id = param_slug_to_id['ordline_status']
            metabase_params[param_id] = ordline_status
        if prc_part_partial and 'prc_part_partial' in param_slug_to_id:
            param_id = param_slug_to_id['prc_part_partial']
            metabase_params[param_id] = prc_part_partial
        if prod_status and 'prod_status' in param_slug_to_id:
            param_id = param_slug_to_id['prod_status']
            metabase_params[param_id] = prod_status
        
        print(f"   📊 Found {len(cards_to_execute)} cards to execute")
        print(f"   🔧 Parameter mapping: {metabase_params}")
        
        for card_item in cards_to_execute:
            # Handle both dashcards and ordered_cards formats
            card_obj = card_item.get('card') if 'card' in card_item else card_item
            if not card_obj:
                continue
                
            card_id = card_obj.get('id')
            if not card_id:
                continue
                
            card_name = card_obj.get('name', f'Card {card_id}')
            
            print(f"   📊 Executing card {card_id}: {card_name}")
            
            try:
                # Execute the card with parameters
                # Metabase expects parameters in the request body
                card_query_url = f"{METABASE_CONFIG['base_url']}/api/card/{card_id}/query"
                request_body = metabase_params if metabase_params else {}
                
                print(f"      Request body: {request_body}")
                
                card_response = requests.post(
                    card_query_url, 
                    headers=headers, 
                    json=request_body,
                    timeout=60
                )
                
                print(f"      Response status: {card_response.status_code}")
                
                # Metabase can return 200 (OK) or 202 (Accepted) with valid data
                # 202 means the request was accepted and is being processed, but may return data immediately
                if card_response.status_code not in [200, 202]:
                    error_text = card_response.text[:1000] if card_response.text else "No error message"
                    print(f"      ❌ Error (status {card_response.status_code}): {error_text}")
                    try:
                        error_json = card_response.json()
                        error_message = error_json.get('message', error_json.get('error', str(error_json)))
                        print(f"      Parsed error: {error_message}")
                    except:
                        error_message = error_text
                    
                    results.append({
                        "card_id": card_id,
                        "card_name": card_name,
                        "success": False,
                        "error": f"Status {card_response.status_code}: {error_message}",
                        "error_details": error_text[:500] if len(error_text) > 500 else error_text
                    })
                    continue
                
                # For 202, check if response contains data (some Metabase queries return 202 with data)
                try:
                    card_result = card_response.json()
                    # If status is 202, check if we have actual data or just an acceptance message
                    if card_response.status_code == 202:
                        # Check if this looks like a valid query result (has 'data' key with 'rows')
                        if 'data' in card_result and 'rows' in card_result.get('data', {}):
                            print(f"      ⚠️  Status 202 but contains data - treating as success")
                        else:
                            # 202 without data might mean async processing - but we'll still try to parse it
                            print(f"      ⚠️  Status 202 - response: {str(card_result)[:200]}")
                except ValueError as e:
                    # If we can't parse JSON, it's definitely an error
                    error_text = card_response.text[:1000] if card_response.text else "No error message"
                    print(f"      ❌ JSON parse error: {str(e)}")
                    results.append({
                        "card_id": card_id,
                        "card_name": card_name,
                        "success": False,
                        "error": f"Failed to parse response as JSON: {str(e)}",
                        "error_details": error_text[:500] if len(error_text) > 500 else error_text
                    })
                    continue
                
                # Extract data rows if available
                data_rows = []
                if 'data' in card_result and 'rows' in card_result['data']:
                    data_rows = card_result['data']['rows']
                
                results.append({
                    "card_id": card_id,
                    "card_name": card_name,
                    "success": True,
                    "row_count": len(data_rows),
                    "data": card_result
                })
                
                print(f"      ✅ Card {card_id} returned {len(data_rows)} rows")
                
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"      ❌ Error executing card {card_id}: {str(e)}")
                print(f"      Traceback: {error_trace}")
                results.append({
                    "card_id": card_id,
                    "card_name": card_name,
                    "success": False,
                    "error": str(e)
                })
        
        # Check if any card succeeded
        successful_cards = [r for r in results if r.get('success', False)]
        all_failed = len(results) > 0 and len(successful_cards) == 0
        
        return {
            "success": not all_failed,  # False if all cards failed
            "dashboard_id": dashboard_id,
            "dashboard_name": dashboard.get('name', 'Unknown'),
            "parameters": parameters,
            "metabase_parameters": metabase_params,  # Include the mapped parameters for debugging
            "cards_executed": len(results),
            "cards_succeeded": len(successful_cards),
            "cards_failed": len(results) - len(successful_cards),
            "results": results
        }
        
    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Metabase API request error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute dashboard: {str(e)}"
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Unexpected error: {str(e)}")
        print(f"   Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

@app.get("/api/metabase/explore/structure")
def explore_metabase_structure(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Comprehensive exploration of Metabase structure - databases, tables, fields
    This will help us understand what data is available for native integration
    """
    try:
        results = {
            "databases": [],
            "summary": {
                "total_databases": 0,
                "total_tables": 0,
                "ordlines_tables": [],
                "wire_harness_tables": []
            }
        }
        
        # Get all databases
        url = f"{METABASE_CONFIG['base_url']}/api/database"
        headers = get_metabase_headers()
        
        print(f"🔍 Exploring complete Metabase structure")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        databases_response = response.json()
        databases = databases_response.get('data', [])
        
        print(f"   Found {len(databases)} databases")
        results["summary"]["total_databases"] = len(databases)
        
        for db in databases:
            db_id = db.get('id')
            db_name = db.get('name', 'Unknown')
            db_engine = db.get('engine', 'Unknown')
            
            print(f"   📊 Exploring database: {db_name} (ID: {db_id}, Engine: {db_engine})")
            
            db_info = {
                "id": db_id,
                "name": db_name,
                "engine": db_engine,
                "tables": [],
                "table_count": 0
            }
            
            # Get tables for this database
            try:
                meta_url = f"{METABASE_CONFIG['base_url']}/api/database/{db_id}/metadata"
                meta_response = requests.get(meta_url, headers=headers, timeout=30)
                meta_response.raise_for_status()
                metadata = meta_response.json()
                tables = metadata.get('tables', [])
                
                print(f"      Found {len(tables)} tables")
                db_info["table_count"] = len(tables)
                results["summary"]["total_tables"] += len(tables)
                
                for table in tables:
                    table_id = table.get('id')
                    table_name = table.get('name', 'Unknown')
                    table_display_name = table.get('display_name', table_name)
                    
                    table_info = {
                        "id": table_id,
                        "name": table_name,
                        "display_name": table_display_name,
                        "schema": table.get('schema'),
                        "fields": [],
                        "field_count": 0,
                        "has_ordline_fields": False,
                        "has_wire_harness_fields": False
                    }
                    
                    # Check if this looks like an ordlines table
                    table_lower = table_name.lower()
                    if 'ordline' in table_lower or 'order' in table_lower:
                        results["summary"]["ordlines_tables"].append({
                            "database": db_name,
                            "table": table_name,
                            "id": table_id
                        })
                    
                    if 'wire' in table_lower or 'harness' in table_lower or 'wh' in table_lower:
                        results["summary"]["wire_harness_tables"].append({
                            "database": db_name,
                            "table": table_name,
                            "id": table_id
                        })
                    
                    # Get fields for this table (sample first few tables)
                    if len(db_info["tables"]) < 5:  # Limit to avoid timeout
                        try:
                            fields_url = f"{METABASE_CONFIG['base_url']}/api/table/{table_id}/query_metadata"
                            fields_response = requests.get(fields_url, headers=headers, timeout=15)
                            if fields_response.status_code == 200:
                                fields_metadata = fields_response.json()
                                fields = fields_metadata.get('fields', [])
                                
                                table_info["field_count"] = len(fields)
                                
                                for field in fields[:20]:  # Limit fields to avoid huge response
                                    field_name = field.get('name', 'Unknown')
                                    field_type = field.get('base_type', 'Unknown')
                                    field_display_name = field.get('display_name', field_name)
                                    
                                    table_info["fields"].append({
                                        "name": field_name,
                                        "display_name": field_display_name,
                                        "type": field_type
                                    })
                                    
                                    # Check for ordline/wire harness related fields
                                    field_lower = field_name.lower()
                                    if 'ordline' in field_lower or 'order' in field_lower:
                                        table_info["has_ordline_fields"] = True
                                    if 'wire' in field_lower or 'harness' in field_lower or 'prodline' in field_lower:
                                        table_info["has_wire_harness_fields"] = True
                                        
                        except Exception as e:
                            print(f"         ⚠️  Could not fetch fields for table {table_name}: {str(e)}")
                    
                    db_info["tables"].append(table_info)
                    
            except Exception as e:
                print(f"      ❌ Could not fetch tables for database {db_name}: {str(e)}")
                db_info["error"] = str(e)
            
            results["databases"].append(db_info)
        
        print(f"✅ Exploration complete!")
        print(f"   📊 {results['summary']['total_databases']} databases")
        print(f"   📋 {results['summary']['total_tables']} total tables")
        print(f"   🔍 {len(results['summary']['ordlines_tables'])} ordlines-related tables")
        print(f"   🔌 {len(results['summary']['wire_harness_tables'])} wire harness-related tables")
        
        return results
        
    except Exception as e:
        print(f"❌ Error exploring Metabase structure: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Failed to explore Metabase structure: {str(e)}"
        )

@app.get("/api/metabase/explore/prodline/{prodline}")
def explore_prodline_in_metabase(
    prodline: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Explore Metabase to find data related to a production line
    This will search through databases, tables, and fields to find prodline-related data
    """
    try:
        results = {
            "prodline": prodline,
            "databases": [],
            "tables_with_prodline": [],
            "sample_queries": []
        }
        
        # Get all databases
        url = f"{METABASE_CONFIG['base_url']}/api/database"
        headers = get_metabase_headers()
        
        print(f"🔍 Exploring Metabase for prodline {prodline}")
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        databases = response.json().get('data', [])
        
        print(f"   Found {len(databases)} databases")
        
        for db in databases:
            db_id = db.get('id')
            db_name = db.get('name', 'Unknown')
            
            results["databases"].append({
                "id": db_id,
                "name": db_name,
                "engine": db.get('engine', 'Unknown')
            })
            
            # Get tables for this database
            try:
                meta_url = f"{METABASE_CONFIG['base_url']}/api/database/{db_id}/metadata"
                meta_response = requests.get(meta_url, headers=headers, timeout=30)
                meta_response.raise_for_status()
                metadata = meta_response.json()
                tables = metadata.get('tables', [])
                
                print(f"   Database {db_name}: {len(tables)} tables")
                
                for table in tables:
                    table_id = table.get('id')
                    table_name = table.get('name', 'Unknown')
                    
                    # Get fields for this table
                    try:
                        fields_url = f"{METABASE_CONFIG['base_url']}/api/table/{table_id}/query_metadata"
                        fields_response = requests.get(fields_url, headers=headers, timeout=30)
                        fields_response.raise_for_status()
                        fields_meta = fields_response.json()
                        fields = fields_meta.get('fields', [])
                        
                        # Check if any field name contains "prodline", "prod_line", "production_line", etc.
                        prodline_fields = []
                        for field in fields:
                            field_name = field.get('name', '').lower()
                            if 'prodline' in field_name or 'prod_line' in field_name or 'production_line' in field_name or 'line' in field_name:
                                prodline_fields.append(field)
                        
                        if prodline_fields:
                            results["tables_with_prodline"].append({
                                "database_id": db_id,
                                "database_name": db_name,
                                "table_id": table_id,
                                "table_name": table_name,
                                "fields": prodline_fields
                            })
                            
                            # Try a sample query
                            try:
                                query = {
                                    "type": "native",
                                    "native": {
                                        "query": f"SELECT * FROM {table_name} WHERE prodline = '{prodline}' OR prod_line = '{prodline}' LIMIT 10"
                                    }
                                }
                                
                                query_url = f"{METABASE_CONFIG['base_url']}/api/database/{db_id}/query"
                                query_response = requests.post(query_url, headers=headers, json=query, timeout=60)
                                
                                if query_response.status_code == 200:
                                    results["sample_queries"].append({
                                        "database_id": db_id,
                                        "table_name": table_name,
                                        "query": query["native"]["query"],
                                        "result_count": len(query_response.json().get('data', {}).get('rows', []))
                                    })
                            except Exception as e:
                                print(f"   ⚠️  Could not execute sample query for {table_name}: {str(e)}")
                                
                    except Exception as e:
                        print(f"   ⚠️  Could not fetch fields for table {table_name}: {str(e)}")
                        continue
                        
            except Exception as e:
                print(f"   ⚠️  Could not fetch metadata for database {db_name}: {str(e)}")
                continue
        
        return {
            "success": True,
            "results": results
        }
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Metabase API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to explore Metabase: {str(e)}"
        )

# ============================================================================
# PROD LINE 300 (WIRE HARNESS) SCHEDULE EXPLORATION
# ============================================================================

@app.get("/api/cetec/prodline/{prodline}/diagnose")
def diagnose_prodline_data(
    prodline: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Diagnostic endpoint to see what production line data actually exists in Cetec.
    Returns sample order lines and their production line field values.
    """
    diagnostics = {
        "api_calls": [],
        "raw_responses": {},
        "response_analysis": {}
    }
    
    try:
        # Try multiple API endpoint variations
        endpoint_variations = [
            {
                "name": "Standard /ordlines/list",
                "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list",
                "params": {
                    "preshared_token": CETEC_CONFIG["token"],
                    "format": "json"
                }
            },
            {
                "name": "With rows parameter",
                "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list",
                "params": {
                    "preshared_token": CETEC_CONFIG["token"],
                    "format": "json",
                    "rows": "1000"
                }
            },
            {
                "name": "Without format",
                "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list",
                "params": {
                    "preshared_token": CETEC_CONFIG["token"]
                }
            },
            {
                "name": "Alternative endpoint",
                "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines",
                "params": {
                    "preshared_token": CETEC_CONFIG["token"],
                    "format": "json"
                }
            }
        ]
        
        all_ordlines = []
        successful_endpoint = None
        
        for endpoint in endpoint_variations:
            try:
                print(f"🔍 Testing endpoint: {endpoint['name']}")
                print(f"   URL: {endpoint['url']}")
                print(f"   Params: {endpoint['params']}")
                
                response = requests.get(endpoint['url'], params=endpoint['params'], timeout=30)
                
                print(f"   ✅ Response received: Status {response.status_code}, Size: {len(response.text)} bytes")
                
                api_call_info = {
                    "endpoint_name": endpoint['name'],
                    "url": endpoint['url'],
                    "params": endpoint['params'],
                    "status_code": response.status_code,
                    "response_size": len(response.text),
                    "content_type": response.headers.get('content-type', 'unknown'),
                    "success": response.status_code == 200
                }
                
                diagnostics["api_calls"].append(api_call_info)
                
                if response.status_code == 200:
                    print(f"   📦 Parsing JSON response...")
                    try:
                        data = response.json()
                        print(f"   ✅ JSON parsed successfully: Type={type(data).__name__}, Length={len(data) if isinstance(data, list) else 'N/A'}")
                        
                        diagnostics["raw_responses"][endpoint['name']] = {
                            "type": type(data).__name__,
                            "sample": str(data)[:500] if isinstance(data, (dict, list)) else str(data),
                            "keys": list(data.keys())[:20] if isinstance(data, dict) else None,
                            "length": len(data) if isinstance(data, list) else "N/A"
                        }
                        
                        # Try to extract order lines from various response shapes
                        if isinstance(data, list):
                            print(f"   ✅ Found list with {len(data)} items")
                            if len(data) > 0:
                                print(f"   📋 First item keys: {list(data[0].keys())[:10] if isinstance(data[0], dict) else 'Not a dict'}")
                            all_ordlines = data
                            successful_endpoint = endpoint['name']
                            if len(all_ordlines) > 0:
                                print(f"   ✅ Using this endpoint - found {len(all_ordlines)} order lines")
                                break
                            else:
                                print(f"   ⚠️  List is empty, continuing to next endpoint...")
                        elif isinstance(data, dict):
                            print(f"   📦 Found dict with keys: {list(data.keys())[:10]}")
                            # Try common keys
                            for key in ['data', 'ordlines', 'rows', 'results', 'items']:
                                if key in data and isinstance(data[key], list):
                                    print(f"   ✅ Found list in key '{key}' with {len(data[key])} items")
                                    all_ordlines = data[key]
                                    successful_endpoint = endpoint['name']
                                    if len(all_ordlines) > 0:
                                        print(f"   ✅ Using this endpoint - found {len(all_ordlines)} order lines")
                                        break
                            if all_ordlines and len(all_ordlines) > 0:
                                break
                            
                            # If no nested list, store the whole dict for inspection
                            print(f"   ⚠️  No list found in dict, storing structure for inspection")
                            diagnostics["raw_responses"][endpoint['name']]["full_structure"] = str(data)[:1000]
                            diagnostics["raw_responses"][endpoint['name']]["all_keys"] = list(data.keys())
                    except Exception as e:
                        print(f"   ❌ JSON parse error: {str(e)}")
                        print(f"   📄 Response preview: {response.text[:200]}")
                        api_call_info["json_error"] = str(e)
                        api_call_info["response_preview"] = response.text[:500]
                        diagnostics["raw_responses"][endpoint['name']] = {
                            "error": "Failed to parse JSON",
                            "error_message": str(e),
                            "response_preview": response.text[:500]
                        }
                else:
                    print(f"   ❌ HTTP {response.status_code}: {response.text[:200] if response.text else 'No error message'}")
                    api_call_info["error"] = response.text[:200] if response.text else "No error message"
                    diagnostics["raw_responses"][endpoint['name']] = {
                        "error": f"HTTP {response.status_code}",
                        "error_message": response.text[:500] if response.text else "No response body"
                    }
                    
            except Exception as e:
                print(f"   ❌ Exception: {str(e)}")
                import traceback
                print(f"   📋 Traceback: {traceback.format_exc()}")
                api_call_info = {
                    "endpoint_name": endpoint['name'],
                    "url": endpoint['url'],
                    "error": str(e),
                    "success": False,
                    "traceback": traceback.format_exc()
                }
                diagnostics["api_calls"].append(api_call_info)
        
        print(f"\n📊 Summary: Tested {len(endpoint_variations)} endpoints, found {len(all_ordlines)} order lines")
        if successful_endpoint:
            print(f"   ✅ Successful endpoint: {successful_endpoint}")
        else:
            print(f"   ⚠️  No successful endpoint found")
        
        # Analyze what we got
        diagnostics["response_analysis"] = {
            "total_ordlines_found": len(all_ordlines),
            "successful_endpoint": successful_endpoint,
            "first_order_line_keys": list(all_ordlines[0].keys()) if all_ordlines else None,
            "first_order_line_sample": dict(list(all_ordlines[0].items())[:10]) if all_ordlines else None
        }
        
        if not all_ordlines:
            return {
                "error": "No order lines found in any endpoint",
                "requested_prodline": prodline,
                "diagnostics": diagnostics,
                "message": "Check the 'diagnostics' section to see what each API endpoint returned"
            }
        
        # Collect all unique production line values
        prodline_values = set()
        prodline_fields = {}
        
        # Sample of order lines with their prodline-related fields
        sample_lines = []
        for line in all_ordlines[:100]:  # Check first 100
            # Look for any field that might contain production line info
            line_prodline_info = {}
            for key, value in line.items():
                key_lower = str(key).lower()
                if 'prod' in key_lower or 'line' in key_lower or '300' in str(value) or '200' in str(value) or '100' in str(value):
                    line_prodline_info[key] = value
                    if value:
                        prodline_values.add(str(value))
            
            if line_prodline_info:
                sample_lines.append({
                    "ordline_id": line.get("ordline_id"),
                    "wo_number": f"{line.get('ordernum')}-{line.get('lineitem')}",
                    "prodline_fields": line_prodline_info,
                    "all_keys": list(line.keys())[:20]  # First 20 keys for reference
                })
        
        # Count occurrences of each prodline value
        prodline_counts = {}
        for line in all_ordlines:
            for key, value in line.items():
                key_lower = str(key).lower()
                if 'production_line' in key_lower or 'prodline' in key_lower:
                    val_str = str(value) if value else "None"
                    prodline_counts[val_str] = prodline_counts.get(val_str, 0) + 1
        
        return {
            "total_ordlines": len(all_ordlines),
            "requested_prodline": prodline,
            "unique_prodline_values_found": list(prodline_values)[:20],
            "prodline_value_counts": prodline_counts,
            "sample_lines_with_prodline_info": sample_lines[:10],
            "all_field_names": list(all_ordlines[0].keys()) if all_ordlines else [],
            "diagnostics": diagnostics,
            "successful_endpoint": successful_endpoint
        }
        
    except Exception as e:
        import traceback
        return {
            "error": f"Failed to fetch order lines: {str(e)}",
            "traceback": traceback.format_exc(),
            "diagnostics": diagnostics
        }


def ensure_metabase_session():
    """Ensure we have a valid Metabase session token using stored credentials"""
    use_session = METABASE_CONFIG.get("use_session_auth", False)
    session_token = METABASE_CONFIG.get("session_token")
    if use_session and session_token:
        return True

    db = None
    try:
        db = SessionLocal()
        if load_metabase_credentials(db):
            return True
    except Exception as e:
        print(f"❌ Failed to ensure Metabase session: {e}")
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass
    return False

@app.get("/api/cetec/prodline/{prodline}/test-endpoints")
def test_cetec_schedule_endpoints(
    prodline: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Test various Cetec API endpoints to find schedule/labor/routing data for a production line.
    Returns results from all endpoints that respond successfully.
    """
    results = {
        "prodline": prodline,
        "tested_endpoints": [],
        "successful_endpoints": [],
        "failed_endpoints": [],
        "sample_data": {}
    }
    
    # First, get some order lines for this prodline to use as test data
    try:
        ordlines_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list"
        ordlines_params = {
            "preshared_token": CETEC_CONFIG["token"],
            "format": "json"
        }
        ordlines_response = requests.get(ordlines_url, params=ordlines_params, timeout=30)
        ordlines_response.raise_for_status()
        all_ordlines = ordlines_response.json() or []
        
        # Try multiple possible field names and values for prodline
        prodline_ordlines = []
        for line in all_ordlines:
            # Try different field names
            prodline_field = (
                line.get("production_line_description") or 
                line.get("production_line") or 
                line.get("prodline") or 
                line.get("prod_line") or
                line.get("productionline_description") or
                line.get("line_description")
            )
            
            # Try matching as string or number
            if str(prodline_field) == str(prodline) or prodline_field == int(prodline) if prodline.isdigit() else None:
                prodline_ordlines.append(line)
        
        # If still no matches, get first few order lines for testing anyway
        if not prodline_ordlines and all_ordlines:
            results["warning"] = f"No exact matches for prodline '{prodline}', using first available order lines for testing"
            prodline_ordlines = all_ordlines[:5]
        
        results["total_ordlines"] = len(all_ordlines)
        results["total_ordlines_found"] = len(prodline_ordlines)
        results["sample_ordline_ids"] = [line.get("ordline_id") for line in prodline_ordlines[:5] if line.get("ordline_id")]
        
        if not results["sample_ordline_ids"]:
            return {
                **results,
                "error": f"No order lines found. Total in Cetec: {len(all_ordlines)}",
                "message": "Cannot test endpoints without sample order line IDs. Try the /diagnose endpoint to see available data."
            }
        
        test_ordline_id = results["sample_ordline_ids"][0]
        results["test_ordline_id"] = test_ordline_id
        
        # Include sample order line data for debugging
        if prodline_ordlines:
            sample_line = prodline_ordlines[0]
            results["sample_order_line"] = {
                "ordline_id": sample_line.get("ordline_id"),
                "wo_number": f"{sample_line.get('ordernum')}-{sample_line.get('lineitem')}",
                "production_line_fields": {
                    k: v for k, v in sample_line.items() 
                    if 'prod' in str(k).lower() or 'line' in str(k).lower()
                }
            }
        
    except Exception as e:
        return {
            **results,
            "error": f"Failed to fetch order lines: {str(e)}"
        }
    
    # Test endpoints that might contain schedule data
    test_endpoints = [
        # Labor planning endpoints
        {
            "name": "Labor Plan List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/laborplan/list",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "list"
        },
        {
            "name": "Labor Plan (per ordline)",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{test_ordline_id}/laborplan",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "detail"
        },
        {
            "name": "Labor Plan (alt)",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/labor/plan",
            "params": {"preshared_token": CETEC_CONFIG["token"], "ordline_id": test_ordline_id},
            "type": "detail"
        },
        {
            "name": "Labor List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/labor/list",
            "params": {"preshared_token": CETEC_CONFIG["token"], "ordline_id": test_ordline_id},
            "type": "list"
        },
        {
            "name": "Order Lines Labor",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/labor",
            "params": {"preshared_token": CETEC_CONFIG["token"], "prodline": prodline},
            "type": "list"
        },
        # Routing endpoints
        {
            "name": "Routing List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/routing/list",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "list"
        },
        {
            "name": "Routing (per ordline)",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{test_ordline_id}/routing",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "detail"
        },
        # Operations endpoints
        {
            "name": "Operations List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/operations/list",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "list"
        },
        # Schedule/Assignment endpoints (guesses)
        {
            "name": "Schedule List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/schedule/list",
            "params": {"preshared_token": CETEC_CONFIG["token"], "prodline": prodline},
            "type": "list"
        },
        {
            "name": "Schedule (per ordline)",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{test_ordline_id}/schedule",
            "params": {"preshared_token": CETEC_CONFIG["token"]},
            "type": "detail"
        },
        {
            "name": "Assignment List",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/assignment/list",
            "params": {"preshared_token": CETEC_CONFIG["token"], "prodline": prodline},
            "type": "list"
        },
        {
            "name": "Work Plan",
            "url": f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/workplan/list",
            "params": {"preshared_token": CETEC_CONFIG["token"], "prodline": prodline},
            "type": "list"
        },
    ]
    
    # Test each endpoint
    for endpoint in test_endpoints:
        endpoint_name = endpoint["name"]
        results["tested_endpoints"].append(endpoint_name)
        
        try:
            response = requests.get(endpoint["url"], params=endpoint["params"], timeout=10)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    results["successful_endpoints"].append({
                        "name": endpoint_name,
                        "url": endpoint["url"],
                        "status_code": response.status_code,
                        "response_type": type(data).__name__,
                        "response_size": len(str(data)),
                        "sample_keys": list(data.keys())[:10] if isinstance(data, dict) else "list",
                        "sample_data": str(data)[:500] if len(str(data)) > 500 else data
                    })
                    results["sample_data"][endpoint_name] = data
                except:
                    results["successful_endpoints"].append({
                        "name": endpoint_name,
                        "url": endpoint["url"],
                        "status_code": response.status_code,
                        "response_type": "text",
                        "response_preview": response.text[:500]
                    })
            else:
                results["failed_endpoints"].append({
                    "name": endpoint_name,
                    "url": endpoint["url"],
                    "status_code": response.status_code,
                    "error": response.text[:200] if response.text else "No error message"
                })
        except requests.exceptions.RequestException as e:
            results["failed_endpoints"].append({
                "name": endpoint_name,
                "url": endpoint["url"],
                "error": str(e)
            })
    
    return results


@app.get("/api/cetec/prodline/{prodline}/scheduled-work")
def get_scheduled_work_for_prodline(
    prodline: str,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Get all scheduled work orders for a production line (e.g., "300" for Wire Harness).
    Returns work orders with their locations and operations.
    """
    try:
        # Step 1: Get all order lines for this prodline
        ordlines_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list"
        ordlines_params = {
            "preshared_token": CETEC_CONFIG["token"],
            "format": "json"
        }
        
        ordlines_response = requests.get(ordlines_url, params=ordlines_params, timeout=30)
        ordlines_response.raise_for_status()
        all_ordlines = ordlines_response.json() or []
        
        # Filter by prodline
        prodline_ordlines = [
            line for line in all_ordlines 
            if line.get("production_line_description") == prodline
        ]
        
        if not prodline_ordlines:
            return {
                "prodline": prodline,
                "work_orders": [],
                "message": f"No order lines found for production line {prodline}"
            }
        
        # Step 2: For each order line, get location maps and operations
        scheduled_work = []
        
        for order_line in prodline_ordlines[:50]:  # Limit to first 50 for now
            ordline_id = order_line.get("ordline_id")
            if not ordline_id:
                continue
            
            try:
                # Get location maps
                location_maps_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/location_maps"
                location_params = {
                    "preshared_token": CETEC_CONFIG["token"],
                    "include_children": "true"
                }
                
                location_response = requests.get(location_maps_url, params=location_params, timeout=30)
                location_response.raise_for_status()
                location_maps = location_response.json() or []
                
                # Extract all locations and operations
                locations = []
                for loc_map in location_maps:
                    location_info = {
                        "location_id": loc_map.get("id"),
                        "location_name": loc_map.get("name") or loc_map.get("description"),
                        "operations": []
                    }
                    
                    # Get operations for this location
                    operations = loc_map.get("operations", [])
                    for op in operations:
                        location_info["operations"].append({
                            "operation_id": op.get("id"),
                            "operation_name": op.get("name"),
                            "sequence": op.get("sequence") or op.get("step") or op.get("build_order"),
                            "estimated_time": op.get("estimated_time") or op.get("time_minutes"),
                            "status": op.get("status")
                        })
                    
                    locations.append(location_info)
                
                # Build work order summary
                wo_number = f"{order_line.get('ordernum')}-{order_line.get('lineitem')}"
                scheduled_work.append({
                    "ordline_id": ordline_id,
                    "wo_number": wo_number,
                    "customer": order_line.get("customer"),
                    "assembly": order_line.get("prcpart"),
                    "revision": order_line.get("revision"),
                    "quantity": order_line.get("oorderqty") or order_line.get("quantity"),
                    "balance_due": order_line.get("balancedue") or order_line.get("balance_due"),
                    "ship_date": order_line.get("shipdate") or order_line.get("ship_date"),
                    "current_location": order_line.get("work_location") or order_line.get("current_location"),
                    "locations": locations,
                    "total_locations": len(locations),
                    "total_operations": sum(len(loc["operations"]) for loc in locations)
                })
                
            except Exception as e:
                print(f"Error processing ordline {ordline_id}: {str(e)}")
                continue
        
        return {
            "prodline": prodline,
            "total_found": len(prodline_ordlines),
            "processed": len(scheduled_work),
            "work_orders": scheduled_work
        }
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from Cetec: {str(e)}"
        )

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


@app.get("/api/cetec/ordline/{ordline_id}/work_progress")
def get_cetec_ordline_work_progress(
    ordline_id: int,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Proxy endpoint to fetch per-operation completion (work progress) from Cetec.
    Normalizes various possible Cetec response shapes into:
      [{
        "operation_id": int | None,
        "operation_name": str | None,
        "status_id": int | None,
        "status_name": str | None,
        "completed_qty": int
      }]
    """
    try:
        params_base = {
            "preshared_token": CETEC_CONFIG["token"]
        }

        # Candidate URLs; some take ordline id in path, some as query param
        candidate_urls = [
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/ordlinework",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/work",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/work_log",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/work_history",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/history",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/workhistory",
            # List-style endpoints with filters
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlinework/list",
            f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/workhistory/list",
        ]

        raw_data = None
        for url in candidate_urls:
            try:
                print(f"Cetec work_progress request: {url}")
                # Provide generous filter params for list endpoints
                params = params_base.copy()
                if url.endswith('/ordlinework/list') or url.endswith('/workhistory/list'):
                    params.update({
                        "rows": "1000",
                        "ordline_id": str(ordline_id),
                    })
                resp = requests.get(url, params=params, timeout=30)
                if resp.status_code == 200:
                    ctype = resp.headers.get('Content-Type')
                    preview = resp.text[:200].replace('\n', ' ')
                    print(f"Cetec work_progress 200 {ctype}, length={len(resp.text)} bytes, preview={preview}")
                    raw_data = resp.json()
                    break
                else:
                    print(f"Cetec work_progress non-200: {resp.status_code}")
            except requests.exceptions.RequestException:
                continue

        if raw_data is None:
            print("Cetec work_progress: no usable response from candidates")
            return []

        normalized = []
        def to_int(x):
            try:
                return int(float(x))
            except Exception:
                return 0

        def extract_completed_qty(item: dict) -> int:
            # Try several possible keys from Cetec variations
            for k in (
                "completed_qty", "qty_completed", "quantity_completed", "pieces_completed",
                "Pieces Completed", "pcs_completed", "pcs", "quantity"
            ):
                if k in item and item.get(k) is not None:
                    return to_int(item.get(k))
            return 0

        def extract_operation_name(item: dict) -> str:
            for k in ("operation_name", "operation", "op_name", "work_location", "location", "status_name", "status"):
                if k in item and item.get(k):
                    return str(item.get(k))
            return None

        if isinstance(raw_data, list):
            for item in raw_data:
                normalized.append({
                    "operation_id": item.get("operation_id") or item.get("op_id") or item.get("operationid"),
                    "operation_name": extract_operation_name(item),
                    "status_id": item.get("status_id") or item.get("statusid"),
                    "status_name": item.get("status_name") or item.get("status"),
                    "completed_qty": extract_completed_qty(item)
                })
        elif isinstance(raw_data, dict):
            container = raw_data.get("entries") or raw_data.get("data") or raw_data.get("results") or []
            for item in container:
                normalized.append({
                    "operation_id": item.get("operation_id") or item.get("op_id") or item.get("operationid"),
                    "operation_name": extract_operation_name(item),
                    "status_id": item.get("status_id") or item.get("statusid"),
                    "status_name": item.get("status_name") or item.get("status"),
                    "completed_qty": extract_completed_qty(item)
                })

        print(f"Cetec work_progress normalized rows: {len(normalized)}")

        # Resolve missing status_name via ordlinestatus list
        try:
            missing_ids = sorted(set([r.get("status_id") for r in normalized if r.get("status_id") and not r.get("status_name")]))
            if missing_ids:
                print(f"Resolving status names for ids: {missing_ids}")
                status_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlinestatus/list"
                status_params = {"preshared_token": CETEC_CONFIG["token"], "rows": "1000"}
                s_resp = requests.get(status_url, params=status_params, timeout=30)
                if s_resp.status_code == 200:
                    s_json = s_resp.json()
                    status_rows = []
                    if isinstance(s_json, list):
                        status_rows = s_json
                    elif isinstance(s_json, dict):
                        for k in ("data", "rows", "ordlinestatus", "entries"):
                            if k in s_json and isinstance(s_json[k], list):
                                status_rows = s_json[k]
                                break
                    id_to_name = {}
                    for s in status_rows:
                        sid = s.get("id") or s.get("status_id") or s.get("statusid")
                        sname = s.get("name") or s.get("status") or s.get("status_name") or s.get("description")
                        if sid is not None and sname:
                            id_to_name[int(sid)] = str(sname)
                    # Apply mapping
                    for r in normalized:
                        if r.get("status_id") and not r.get("status_name"):
                            mapped = id_to_name.get(int(r["status_id"]))
                            if mapped:
                                r["status_name"] = mapped
                else:
                    print(f"ordlinestatus list non-200: {s_resp.status_code}")
        except Exception as e:
            print(f"ordlinestatus resolution error: {e}")

        combined: Dict[str, int] = {}
        for row in normalized:
            key = str(row.get("operation_id") or row.get("operation_name") or row.get("status_id") or row.get("status_name") or "unknown")
            combined[key] = combined.get(key, 0) + int(row.get("completed_qty") or 0)

        result = []
        for row in normalized:
            key = str(row.get("operation_id") or row.get("operation_name") or row.get("status_id") or row.get("status_name") or "unknown")
            if any(r.get("__k") == key for r in result):
                continue
            result.append({
                "__k": key,
                "operation_id": row.get("operation_id"),
                "operation_name": row.get("operation_name"),
                "status_id": row.get("status_id"),
                "status_name": row.get("status_name"),
                "completed_qty": combined.get(key, 0)
            })

        for r in result:
            r.pop("__k", None)

        print(f"Cetec work_progress combined distinct keys: {len(result)}; totals={sum(r.get('completed_qty',0) for r in result)}")
        # Log a few sample rows for debugging
        for sample in result[:3]:
            print(f"work_progress sample: {sample}")
        return result
    except requests.exceptions.RequestException as e:
        print(f"Cetec ordlinework API error: {str(e)}")
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


@app.get("/api/cetec/wire-harness/ordlines")
def get_wire_harness_ordlines(
    current_user: User = Depends(auth.get_current_user)
):
    """
    Fetch Wire Harness (prodline 300) ordlines using Metabase Card 985
    This is much faster than calling CETEC ordlines/list directly (which times out)
    """
    try:
        print("🔍 Fetching Wire Harness ordlines from Metabase Card 985...")
        print("   This is much faster than CETEC ordlines/list (which times out)")
        
        # Use Metabase Card 984: Same as Wire Harness Schedule Detail
        # This is the card that the working Wire Harness pages use
        card_id = 984
        
        url = f"{METABASE_CONFIG['base_url']}/api/card/{card_id}/query"
        headers = get_metabase_headers()
        
        # Execute the card with prodline 300 filter
        request_body = {"prodline": "300"}
        
        print(f"   Executing Metabase Card {card_id}")
        print(f"   URL: {url}")
        
        response = requests.post(url, headers=headers, json=request_body, timeout=30)
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code not in [200, 202]:
            error_text = response.text[:500]
            print(f"   ❌ Metabase error: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Metabase query failed: {error_text}"
            )
        
        try:
            result = response.json()
        except ValueError as e:
            print(f"   ❌ Failed to parse Metabase response: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Invalid JSON response from Metabase: {str(e)}"
            )
        
        # Extract data from Metabase response - Card 984 format
        data_rows = []
        columns = []
        
        # Card 984 returns data in result.data.rows format
        if 'data' in result and 'rows' in result['data']:
            data_rows = result['data'].get('rows', [])
            columns = result['data'].get('cols', [])
        # Fallback for other formats
        elif 'data' in result:
            data_rows = result['data'].get('rows', [])
            columns = result['data'].get('cols', [])
        
        print(f"   ✅ Metabase query successful: {len(data_rows)} rows returned")
        print(f"   📊 Columns: {len(columns)}")
        
        if not data_rows:
            print("   ⚠️  No data rows found in Metabase response")
            return []
        
        # Map column names to indices - using the same logic as Wire Harness Schedule
        col_map = {}
        for idx, col in enumerate(columns):
            display_name = (col.get('display_name') or '').lower()
            name = (col.get('name') or '').lower()
            combined = f"{display_name} {name}"
            
            # Workcenter (Scheduled Location) - this will be our current_location
            if ((display_name.find('scheduled location') >= 0 or display_name.find('ordline status') >= 0 or 
                 name.find('description') >= 0) and 'workcenter' not in col_map):
                col_map['workcenter'] = idx
                col_map['current_location'] = idx  # Same field for work order move
            # Build Operation
            elif (combined.find('build operation') >= 0 or combined.find('operation') >= 0 or name == 'name'):
                if 'operation' not in col_map:
                    col_map['operation'] = idx
            # Order Number
            elif (combined.find('order') >= 0 and (combined.find('ordernum') >= 0 or combined.find('order num') >= 0)):
                col_map['order'] = idx
                col_map['order_number'] = idx  # Alias for work order move
            # Line Item
            elif (combined.find('line') >= 0 and (combined.find('lineitem') >= 0 or combined.find('line item') >= 0)):
                col_map['line'] = idx
                col_map['line_number'] = idx  # Alias for work order move
            # Part Number
            elif (combined.find('prcpart') >= 0 or combined.find('prc part') >= 0 or combined.find('part') >= 0):
                if 'part' not in col_map:
                    col_map['part'] = idx
            # Production Status
            elif (combined.find('prod') >= 0 and combined.find('status') >= 0):
                col_map['prod_status'] = idx
            # Priority
            elif combined.find('priority') >= 0:
                col_map['priority'] = idx
                col_map['priority_rank'] = idx  # Alias for work order move
            # Current Location (alternative field)
            elif (combined.find('current') >= 0 and combined.find('location') >= 0):
                if 'current_location' not in col_map:
                    col_map['current_location'] = idx
            # Look for ordline_id field specifically
            elif (name.find('ordline') >= 0 and name.find('id') >= 0):
                col_map['ordline_id'] = idx
        
        print(f"   📋 Column mapping found: {list(col_map.keys())}")
        print(f"   📋 Full column mapping: {col_map}")
        
        # Debug: Print first few column names to understand structure
        if columns:
            print(f"   🔍 First 10 columns:")
            for i, col in enumerate(columns[:10]):
                display_name = col.get('display_name', '')
                name = col.get('name', '')
                print(f"     [{i}] {display_name} ({name})")
        
        # Debug: Print first row to see data structure
        if data_rows:
            print(f"   📊 First row sample: {data_rows[0][:10] if len(data_rows[0]) > 10 else data_rows[0]}")
        
        # First, collect unique work orders from Card 984 (which shows each WO multiple times)
        unique_work_orders = {}  # Key: ordline_id, Value: work order data
        
        for row in data_rows:
            try:
                if not isinstance(row, list) or len(row) == 0:
                    continue
                
                # Extract ordline_id (try to get it, but construct if not available)
                ordline_id = None
                if 'ordline_id' in col_map and col_map['ordline_id'] < len(row):
                    ordline_id = row[col_map['ordline_id']]
                
                # If no ordline_id, try to construct from order + line
                if not ordline_id:
                    order_num = None
                    line_num = None
                    
                    if 'order' in col_map and col_map['order'] < len(row):
                        order_num = row[col_map['order']]
                    if 'line' in col_map and col_map['line'] < len(row):
                        line_num = row[col_map['line']]
                    
                    if order_num:
                        if line_num:
                            ordline_id = f"{order_num}.{line_num}"
                        else:
                            ordline_id = str(order_num)
                
                if not ordline_id:
                    continue  # Skip if we can't identify this work order
                
                # Extract other fields with fallbacks
                def get_field(field_name, fallback_fields=None, default=""):
                    if fallback_fields is None:
                        fallback_fields = []
                    
                    # Try primary field first
                    if field_name in col_map and col_map[field_name] < len(row):
                        value = row[col_map[field_name]]
                        if value is not None:
                            return str(value)
                    
                    # Try fallback fields
                    for fallback in fallback_fields:
                        if fallback in col_map and col_map[fallback] < len(row):
                            value = row[col_map[fallback]]
                            if value is not None:
                                return str(value)
                    
                    return default
                
                # Store unique work orders (Card 984 shows each WO multiple times for different steps)
                if ordline_id not in unique_work_orders:
                    unique_work_orders[ordline_id] = {
                        "ordline_id": ordline_id,
                        "order_number": get_field('order', ['order_number']),
                        "line_number": get_field('line', ['line_number']),
                        "part": get_field('part'),
                        "prod_status": get_field('prod_status'),
                        "priority_rank": 0,  # Default priority
                        # Note: We'll get the REAL current location from CETEC below
                    }
                    
                    # Try to extract priority as integer
                    try:
                        priority_val = None
                        if 'priority' in col_map and col_map['priority'] < len(row):
                            priority_val = row[col_map['priority']]
                        elif 'priority_rank' in col_map and col_map['priority_rank'] < len(row):
                            priority_val = row[col_map['priority_rank']]
                        
                        if priority_val is not None:
                            unique_work_orders[ordline_id]["priority_rank"] = int(float(priority_val))
                    except (ValueError, TypeError):
                        pass  # Keep default 0
                
            except Exception as e:
                print(f"   ⚠️  Error processing row: {str(e)}")
                continue  # Skip this row and continue
        
        print(f"   ✅ Found {len(unique_work_orders)} unique work orders from Metabase data")
        
        # Now get the REAL current locations from CETEC ordlines API
        print(f"   🔍 Fetching actual current locations from CETEC...")
        work_orders = []
        
        # Get ordline status mapping first
        ordline_status_map = {}
        
        # Wrap the entire CETEC fetching in a try-catch to provide fallback
        try:
            status_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlinestatus/list"
            status_response = requests.get(
                status_url,
                params={"preshared_token": CETEC_CONFIG["token"], "rows": "1000"},
                timeout=15
            )
            
            if status_response.status_code == 200:
                status_data = status_response.json()
                status_list = status_data if isinstance(status_data, list) else (status_data.get("data") or [])
                
                for status in status_list:
                    if isinstance(status, dict) and status.get("id"):
                        ordline_status_map[status["id"]] = status.get("description") or status.get("name") or f"Location {status['id']}"
                
                print(f"   📍 Loaded {len(ordline_status_map)} location mappings")
            else:
                print(f"   ⚠️  Failed to load ordline statuses: {status_response.status_code}")
        except Exception as e:
            print(f"   ⚠️  Error loading ordline statuses: {str(e)}")
        
        # Try to fetch current locations in batch from CETEC (more efficient)
        ordline_ids = list(unique_work_orders.keys())
        print(f"   🔍 Fetching current locations for {len(ordline_ids)} work orders...")
        
        # Batch fetch ordlines from CETEC (limit to reasonable batch size)
        batch_size = 50  # Limit batch size to avoid timeouts
        ordline_locations = {}
        
        for i in range(0, len(ordline_ids), batch_size):
            batch_ids = ordline_ids[i:i + batch_size]
            print(f"   📦 Processing batch {i//batch_size + 1}: {len(batch_ids)} ordlines")
            
            try:
                # Build filter for this batch of ordline IDs
                ordline_filter = ",".join(str(oid) for oid in batch_ids)
                
                ordline_url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordlines/list"
                ordline_params = {
                    "preshared_token": CETEC_CONFIG["token"],
                    "prodline": "300",  # Wire Harness only
                    "ordline_id": ordline_filter,
                    "rows": str(batch_size * 2)  # Allow for some extra
                }
                
                ordline_response = requests.get(ordline_url, params=ordline_params, timeout=30)
                
                if ordline_response.status_code == 200:
                    ordline_data = ordline_response.json()
                    ordlines = ordline_data if isinstance(ordline_data, list) else (ordline_data.get("data") or [])
                    
                    # Map ordline_id to work_location
                    for ordline in ordlines:
                        if isinstance(ordline, dict):
                            oid = ordline.get("ordline_id")
                            work_loc_id = ordline.get("work_location")
                            if oid and work_loc_id:
                                ordline_locations[str(oid)] = work_loc_id
                    
                    print(f"   ✅ Batch {i//batch_size + 1}: Found locations for {len([oid for oid in batch_ids if str(oid) in ordline_locations])} ordlines")
                else:
                    print(f"   ⚠️  Batch {i//batch_size + 1} failed: {ordline_response.status_code}")
                    
            except Exception as e:
                print(f"   ⚠️  Error fetching batch {i//batch_size + 1}: {str(e)}")
                continue
        
        print(f"   📍 Successfully mapped {len(ordline_locations)} ordline locations")
        
        # Create final work orders with resolved locations
        for ordline_id, wo_data in unique_work_orders.items():
            work_location_id = ordline_locations.get(str(ordline_id))
            current_location = "Unknown"
            
            if work_location_id and work_location_id in ordline_status_map:
                current_location = ordline_status_map[work_location_id]
            elif work_location_id:
                current_location = f"Location {work_location_id}"  # Fallback if name not found
            
            # Create the final work order
            work_order = {
                **wo_data,  # Include all the data from Card 984
                "work_location_id": work_location_id,
                "work_location": current_location,
                "current_location": current_location,
                "scheduled_location": current_location,  # For now, same as current
            }
            
            work_orders.append(work_order)
        
        print(f"   ✅ Processed {len(work_orders)} work orders with real current locations")
        
        # If we got no work orders with the new approach, fall back to using Card 984 data as-is
        if len(work_orders) == 0 and len(unique_work_orders) > 0:
            print(f"   ⚠️  Fallback: Using Card 984 scheduled locations since CETEC fetch failed")
            for ordline_id, wo_data in unique_work_orders.items():
                work_order = {
                    **wo_data,
                    "work_location_id": None,
                    "work_location": "Scheduled Location",
                    "current_location": "Scheduled Location", 
                    "scheduled_location": "Scheduled Location",
                }
                work_orders.append(work_order)
        
        except Exception as cetec_error:
            print(f"   ❌ CETEC location fetching failed: {str(cetec_error)}")
            print(f"   🔄 Falling back to Card 984 data without real current locations")
            
            # Fallback: Use Card 984 data as-is
            for ordline_id, wo_data in unique_work_orders.items():
                work_order = {
                    **wo_data,
                    "work_location_id": None,
                    "work_location": "From Schedule",
                    "current_location": "From Schedule", 
                    "scheduled_location": "From Schedule",
                }
                work_orders.append(work_order)
        
        print(f"   🎯 Returning {len(work_orders)} Wire Harness work orders")
        
        return work_orders
        
    except requests.exceptions.Timeout as e:
        error_msg = str(e)
        print(f"CETEC API timeout: {error_msg}")
        print("Returning empty list - CETEC API timed out (too many ordlines)")
        # Return empty list instead of error so the page loads
        # The user can try again or we can optimize this endpoint later
        return []
    except requests.exceptions.RequestException as e:
        error_msg = str(e)
        print(f"CETEC API error: {error_msg}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_body = e.response.text
                print(f"CETEC API error response: {error_body}")
            except:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch from CETEC: {error_msg}"
        )
    except HTTPException:
        # Re-raise HTTPExceptions as-is
        raise
    except Exception as e:
        error_msg = str(e)
        import traceback
        error_trace = traceback.format_exc()
        print(f"Unexpected error in get_wire_harness_ordlines: {error_msg}")
        print(error_trace)
        
        # Log to help debug
        print(f"ERROR DETAILS:")
        print(f"  Error type: {type(e).__name__}")
        print(f"  Error message: {error_msg}")
        print(f"  Work orders collected so far: {len(work_orders)}")
        
        # If we have some work orders, return them with a warning
        if work_orders:
            print(f"WARNING: Returning partial data due to error")
            return work_orders
        
        # Otherwise raise the error
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {error_msg}"
        )


@app.patch("/api/cetec/ordline/{ordline_id}/move")
def move_ordline_to_location(
    ordline_id: int,
    move_data: dict = Body(...),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Move an ordline to a new location using Cetec API
    Requires location_id or ordline_map_id, optional complete_schedule flag and user_id
    """
    try:
        params = {
            "preshared_token": CETEC_CONFIG["token"]
        }
        
        # Get user_id from request body or current user
        user_id = move_data.get("userId") or current_user.id
        
        if user_id:
            params["user_id"] = str(user_id)
        
        # Build request body
        body = {}
        
        if "locationId" in move_data:
            body["location_id"] = move_data["locationId"]
        elif "ordlineMapId" in move_data:
            body["ordline_map_id"] = move_data["ordlineMapId"]
        else:
            raise HTTPException(
                status_code=400,
                detail="Either location_id or ordline_map_id is required"
            )
        
        if "completeSchedule" in move_data:
            body["complete_schedule"] = bool(move_data["completeSchedule"])
        
        if "ordlineStatus" in move_data:
            body["ordline_status"] = move_data["ordlineStatus"]
        
        url = f"https://{CETEC_CONFIG['domain']}/goapis/api/v1/ordline/{ordline_id}/move"
        
        print(f"Moving ordline {ordline_id} to location: {body}")
        print(f"URL: {url}")
        print(f"Params: {params}")
        
        response = requests.patch(url, json=body, params=params, timeout=30)
        
        print(f"Cetec move response status: {response.status_code}")
        
        if response.status_code == 200:
            return {"success": True, "message": "Work order moved successfully", "data": response.json()}
        else:
            error_text = response.text
            print(f"Cetec move error response: {error_text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to move work order: {error_text}"
            )
        
    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        print(f"Cetec API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to move work order: {str(e)}"
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


@app.get("/api/cetec/health", response_model=schemas.CetecHealthResponse)
def get_cetec_health(
    stale_threshold_minutes: int = 360,
    error_window_hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Return high-level Cetec sync health metrics for dashboard banners."""
    from sqlalchemy import func

    latest_sync = db.query(func.max(WorkOrder.last_cetec_sync)).scalar()
    now = datetime.utcnow()
    stale_minutes = None
    is_stale = False
    if latest_sync:
        delta = now - latest_sync
        stale_minutes = int(delta.total_seconds() // 60)
        is_stale = stale_minutes > stale_threshold_minutes
    else:
        is_stale = True

    error_window_start = now - timedelta(hours=error_window_hours)

    recent_error_count = db.query(func.count(CetecSyncLog.id)).filter(
        CetecSyncLog.change_type == "error",
        CetecSyncLog.sync_date >= error_window_start
    ).scalar() or 0

    last_error_entry = db.query(CetecSyncLog).filter(
        CetecSyncLog.change_type == "error"
    ).order_by(CetecSyncLog.sync_date.desc()).first()

    return schemas.CetecHealthResponse(
        latest_sync=latest_sync,
        stale_minutes=stale_minutes,
        stale_threshold_minutes=stale_threshold_minutes,
        is_stale=is_stale,
        recent_error_count=recent_error_count,
        recent_error_window_hours=error_window_hours,
        last_error_at=last_error_entry.sync_date if last_error_entry else None,
        last_error_message=last_error_entry.new_value if last_error_entry else None
    )


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
                
                # Calculate time (rounded to nearest minute) - PRODUCTION FIX FOR NONE VALUES
                time_minutes = 0
                if smt_location and smt_operation:
                    # Safely convert None values to numbers - THIS FIXES THE IMPORT ERRORS
                    avg_secs = int(smt_operation.get('avg_secs') or 0)
                    repetitions = int(smt_operation.get('repetitions') or 1)
                    balance_due = int(order_line.get('balancedue') or order_line.get('release_qty') or order_line.get('orig_order_qty') or 0)
                    
                    # Only calculate if all values are positive
                    if avg_secs > 0 and repetitions > 0 and balance_due > 0:
                        time_minutes = round((avg_secs * repetitions * balance_due) / 60)
                
                # Import ALL work orders, even without SMT time calculations
                # Time will be 0 for non-SMT work orders, which is fine
                if time_minutes == 0:
                    print(f"  ℹ️  WO {wo_number}: No SMT time calculated (avg_secs={avg_secs}, reps={repetitions}, qty={balance_due}) - importing anyway")
                
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
                    
                    # Track changes (handle None values safely)
                    if (existing_wo.quantity or 0) != (quantity or 0):
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="qty_changed",
                            field_name="quantity",
                            old_value=str(existing_wo.quantity or 0),
                            new_value=str(quantity or 0),
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.quantity = quantity
                        has_changes = True
                    
                    # Compare dates safely (handle None)
                    old_date = existing_wo.cetec_ship_date
                    new_date = cetec_ship_date
                    if (old_date is None and new_date is not None) or (old_date is not None and new_date is None) or (old_date is not None and new_date is not None and old_date != new_date):
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="date_changed",
                            field_name="cetec_ship_date",
                            old_value=str(existing_wo.cetec_ship_date or ''),
                            new_value=str(cetec_ship_date or ''),
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.cetec_ship_date = cetec_ship_date
                        has_changes = True
                    
                    if (existing_wo.time_minutes or 0) != (time_minutes or 0):
                        existing_wo.time_minutes = time_minutes
                        has_changes = True
                    
                    if (existing_wo.current_location or '') != (current_location or ''):
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="location_changed",
                            field_name="current_location",
                            old_value=existing_wo.current_location or '',
                            new_value=current_location or '',
                            cetec_ordline_id=ordline_id
                        ))
                        existing_wo.current_location = current_location
                        has_changes = True
                    
                    if (existing_wo.material_status or '') != (material_status or ''):
                        changes.append(CetecSyncLog(
                            sync_date=sync_time,
                            wo_number=wo_number,
                            change_type="material_changed",
                            field_name="material_status",
                            old_value=existing_wo.material_status or '',
                            new_value=material_status or '',
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
                        status_id=unassigned_status.id,  # Use Status table
                        # Don't set status column at all - let it use the database default or remove the column
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
                import traceback
                print(f"Error processing ordline {ordline_id}: {str(e)}")
                print(f"Full traceback:")
                traceback.print_exc()
                changes.append(CetecSyncLog(
                    sync_date=sync_time,
                    wo_number=wo_number,
                    change_type="error",
                    field_name="exception",
                    old_value=None,
                    new_value=str(e),
                    cetec_ordline_id=ordline_id
                ))
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


# ============================================================================
# OPTIMIZER ENDPOINTS - Auto-Scheduling
# ============================================================================

@app.post("/api/auto-schedule")
def auto_schedule_jobs(
    mode: str = "balanced",
    dry_run: bool = True,
    clear_existing: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Run the simple auto-scheduler to assign work orders to lines.
    
    Args:
        mode: Ignored - uses simple logic for all modes
        dry_run: If True, return proposed changes without saving
        clear_existing: If True, clear all existing schedules before redistributing
    
    Returns:
        Summary of scheduling results including:
        - jobs_scheduled: Total jobs processed
        - jobs_at_risk: Jobs that might miss promise dates
        - jobs_will_be_late: Jobs currently scheduled to be late
        - line_assignments: Distribution across lines
        - trolley_utilization: Trolley counts per line
        - changes: List of proposed changes (if dry_run=True)
    """
    from simple_scheduler import simple_auto_schedule
    
    try:
        result = simple_auto_schedule(db, dry_run=dry_run, clear_existing=clear_existing)
        return result
    except Exception as e:
        print(f"Auto-schedule error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Auto-schedule failed: {str(e)}")


@app.get("/api/schedule-analysis")
def get_schedule_analysis(db: Session = Depends(get_db)):
    """
    Get current schedule statistics and performance metrics.
    
    Returns:
        - promise_date_stats: Hit rate, average variance
        - jobs_at_risk_count: Number of jobs that might miss promise dates
        - jobs_late_count: Number of jobs currently scheduled to be late
        - trolley_utilization: Current trolley usage
        - line_loads: Current workload per line
    """
    from optimizer import get_schedulable_jobs, get_general_lines, get_mci_line, get_line_current_load
    from sqlalchemy import and_
    
    try:
        # Get all jobs with scheduled dates
        all_jobs = db.query(WorkOrder).filter(
            and_(
                WorkOrder.is_complete == False,
                WorkOrder.scheduled_end_date.isnot(None)
            )
        ).all()
        
        if not all_jobs:
            return {
                'promise_date_stats': {
                    'total_jobs': 0,
                    'on_time': 0,
                    'at_risk': 0,
                    'will_be_late': 0,
                    'hit_rate_percent': 0,
                    'average_variance_days': 0
                },
                'jobs_at_risk_count': 0,
                'jobs_late_count': 0,
                'trolley_utilization': {},
                'line_loads': {}
            }
        
        # Calculate stats
        on_time_jobs = [j for j in all_jobs if not j.will_be_late()]
        at_risk_jobs = [j for j in all_jobs if j.is_at_risk()]
        late_jobs = [j for j in all_jobs if j.will_be_late()]
        
        hit_rate = (len(on_time_jobs) / len(all_jobs)) * 100 if all_jobs else 0
        
        # Calculate average variance
        variances = [j.promise_date_variance_days for j in all_jobs if j.promise_date_variance_days is not None]
        avg_variance = sum(variances) / len(variances) if variances else 0
        
        # Get line loads
        general_lines = get_general_lines(db)
        mci_line = get_mci_line(db)
        all_lines = general_lines + ([mci_line] if mci_line else [])
        
        line_loads = {}
        trolley_util = {}
        for line in all_lines:
            load = get_line_current_load(db, line.id)
            line_loads[line.name] = {
                'job_count': load['job_count'],
                'total_hours': round(load['total_hours'], 2),
                'completion_date': load['completion_date'].isoformat()
            }
            trolley_util[line.name] = {
                'positions_1_2': load['trolleys_in_p1_p2'],
                'limit': 24,
                'exceeds_limit': load['trolleys_in_p1_p2'] > 24
            }
        
        return {
            'promise_date_stats': {
                'total_jobs': len(all_jobs),
                'on_time': len(on_time_jobs),
                'at_risk': len(at_risk_jobs),
                'will_be_late': len(late_jobs),
                'hit_rate_percent': round(hit_rate, 1),
                'average_variance_days': round(avg_variance, 1)
            },
            'jobs_at_risk_count': len(at_risk_jobs),
            'jobs_late_count': len(late_jobs),
            'trolley_utilization': trolley_util,
            'line_loads': line_loads
        }
    except Exception as e:
        print(f"Schedule analysis error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/capacity-forecast")
def get_capacity_forecast_endpoint(weeks: int = 8, db: Session = Depends(get_db)):
    """
    Get capacity forecast for the next N weeks.
    
    Args:
        weeks: Number of weeks to forecast (default: 8)
    
    Returns:
        - weeks: Array of weekly capacity data
        - pipeline: Summary of work not yet in SMT PRODUCTION
    """
    from optimizer import get_capacity_forecast
    
    try:
        forecast = get_capacity_forecast(db, weeks=weeks)
        return forecast
    except Exception as e:
        print(f"Capacity forecast error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


# ============================================================================
# DEBUG ENDPOINTS - For troubleshooting scheduler issues
# ============================================================================

@app.get("/api/debug/line-capacity")
def debug_line_capacity(line_id: int, start_date: str, end_date: str, db: Session = Depends(get_db)):
    """
    Debug endpoint to see capacity calculations for a specific line and date range.
    
    Args:
        line_id: Line ID to check
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    
    Returns:
        - line_info: Basic line information
        - capacity_data: Daily capacity calculations
        - shifts: Active shifts for this line
    """
    from datetime import datetime, date, timedelta
    from scheduler import get_capacity_for_date
    from models import SMTLine, Shift
    
    try:
        # Parse dates
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # Get line info
        line = db.query(SMTLine).filter(SMTLine.id == line_id).first()
        if not line:
            raise HTTPException(status_code=404, detail=f"Line {line_id} not found")
        
        # Get shifts for this line
        shifts = db.query(Shift).filter(Shift.line_id == line_id).all()
        
        # Calculate capacity for each day
        capacity_data = []
        current_date = start_dt
        while current_date <= end_dt:
            capacity = get_capacity_for_date(db, line_id, current_date, 8.0)
            capacity_data.append({
                'date': current_date.isoformat(),
                'capacity_hours': capacity,
                'is_weekend': current_date.weekday() >= 5
            })
            current_date += timedelta(days=1)
        
        return {
            'line_info': {
                'id': line.id,
                'name': line.name,
                'hours_per_day': line.hours_per_day,
                'is_active': line.is_active
            },
            'shifts': [
                {
                    'id': shift.id,
                    'name': shift.name,
                    'start_time': shift.start_time.isoformat() if shift.start_time else None,
                    'end_time': shift.end_time.isoformat() if shift.end_time else None,
                    'active_days': shift.active_days,
                    'is_active': shift.is_active
                }
                for shift in shifts
            ],
            'capacity_data': capacity_data
        }
        
    except Exception as e:
        print(f"Debug line capacity error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


@app.get("/api/debug/job-dates")
def debug_job_dates(line_id: int, db: Session = Depends(get_db)):
    """
    Debug endpoint to see detailed job date calculations for a specific line.
    
    Args:
        line_id: Line ID to check
    
    Returns:
        - line_info: Basic line information
        - jobs: Detailed job information with calculated dates
        - calculation_details: Step-by-step calculation details
    """
    from datetime import datetime, date
    from scheduler import calculate_job_dates, get_capacity_for_date
    from models import SMTLine, WorkOrder
    from sqlalchemy import and_
    
    try:
        # Get line info
        line = db.query(SMTLine).filter(SMTLine.id == line_id).first()
        if not line:
            raise HTTPException(status_code=404, detail=f"Line {line_id} not found")
        
        # Get all jobs on this line
        jobs = db.query(WorkOrder).filter(
            and_(
                WorkOrder.line_id == line_id,
                WorkOrder.is_complete == False
            )
        ).order_by(WorkOrder.line_position).all()
        
        # Calculate job dates using proper datetime calculations
        from time_scheduler import calculate_job_datetimes
        job_datetimes = calculate_job_datetimes(db, line_id)
        
        # Prepare detailed job information
        jobs_data = []
        for job in jobs:
            job_info = {
                'wo_number': job.wo_number,
                'line_position': job.line_position,
                'is_locked': job.is_locked,
                'time_minutes': job.time_minutes,
                'setup_time_hours': job.setup_time_hours,
                'trolley_count': job.trolley_count,
                'calculated_start_datetime': job.calculated_start_datetime.isoformat() if job.calculated_start_datetime else None,
                'calculated_end_datetime': job.calculated_end_datetime.isoformat() if job.calculated_end_datetime else None
            }
            
            # Add calculated dates if available
            if job.id in job_datetimes:
                dates = job_datetimes[job.id]
                job_info['calculated_start_datetime'] = dates['start_datetime'].isoformat()
                job_info['calculated_end_datetime'] = dates['end_datetime'].isoformat()
                job_info['calculated_start_date'] = dates['start_datetime'].date().isoformat()
                job_info['calculated_end_date'] = dates['end_datetime'].date().isoformat()
            
            jobs_data.append(job_info)
        
        return {
            'line_info': {
                'id': line.id,
                'name': line.name,
                'hours_per_day': line.hours_per_day,
                'is_active': line.is_active
            },
            'jobs': jobs_data,
            'job_datetimes_count': len(job_datetimes),
            'latest_end_date': max([dates['end_datetime'].date() for dates in job_datetimes.values()]).isoformat() if job_datetimes else None
        }
        
    except Exception as e:
        print(f"Debug job dates error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


@app.get("/api/debug/scheduler-state")
def debug_scheduler_state(db: Session = Depends(get_db)):
    """
    Debug endpoint to see current scheduler state and line loads.
    
    Returns:
        - line_loads: Current load information for each line
        - schedulable_jobs: Jobs that can be auto-scheduled
        - mci_availability: MCI line availability status
    """
    from simple_scheduler import get_schedulable_jobs, get_line_current_load
    from models import SMTLine, WorkOrder
    from sqlalchemy import and_
    
    try:
        # Get all active lines
        lines = db.query(SMTLine).filter(SMTLine.is_active == True).order_by(SMTLine.id).all()
        
        # Get line loads
        line_loads = {}
        for line in lines:
            load = get_line_current_load(db, line.id)
            line_loads[line.name] = {
                'line_id': line.id,
                'job_count': load['job_count'],
                'total_hours': load['total_hours'],
                'positions_used': load['positions_used'],
                'trolleys_in_p1_p2': load['trolleys_in_p1_p2'],
                'completion_date': load['completion_date'].isoformat()
            }
        
        # Get schedulable jobs (both scheduled and unscheduled for debugging)
        schedulable_jobs = get_schedulable_jobs(db, include_scheduled=True)
        
        # Check MCI availability
        mci_line = db.query(SMTLine).filter(
            and_(
                SMTLine.is_active == True,
                SMTLine.name.ilike("%MCI%")
            )
        ).first()
        
        mci_availability = None
        if mci_line:
            incomplete_mci_jobs = db.query(WorkOrder).filter(
                and_(
                    WorkOrder.customer.ilike("%Midcontinent%"),
                    WorkOrder.is_complete == False
                )
            ).count()
            
            mci_availability = {
                'line_id': mci_line.id,
                'line_name': mci_line.name,
                'incomplete_mci_jobs': incomplete_mci_jobs,
                'available_for_other_customers': incomplete_mci_jobs == 0
            }
        
        return {
            'line_loads': line_loads,
            'schedulable_jobs_count': len(schedulable_jobs),
            'mci_availability': mci_availability,
            'total_active_lines': len(lines)
        }
        
    except Exception as e:
        print(f"Debug scheduler state error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")


# ========== Migration Endpoints ==========

@app.post("/api/migrate/cetec-progress")
def migrate_cetec_progress(db: Session = Depends(get_db)):
    """Run migration to add Cetec progress tracking columns"""
    try:
        from sqlalchemy import text
        
        # Add Cetec progress columns
        db.execute(text("""
            ALTER TABLE work_orders 
            ADD COLUMN IF NOT EXISTS cetec_original_qty INTEGER,
            ADD COLUMN IF NOT EXISTS cetec_balance_due INTEGER,
            ADD COLUMN IF NOT EXISTS cetec_shipped_qty INTEGER,
            ADD COLUMN IF NOT EXISTS cetec_invoiced_qty INTEGER,
            ADD COLUMN IF NOT EXISTS cetec_completed_qty INTEGER,
            ADD COLUMN IF NOT EXISTS cetec_remaining_qty INTEGER
        """))
        
        # Add indexes
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_work_orders_cetec_remaining_qty 
            ON work_orders (cetec_remaining_qty)
        """))
        
        db.commit()
        return {"message": "Cetec progress columns added successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


@app.post("/api/migrate/deleted-canceled")
def migrate_deleted_canceled(db: Session = Depends(get_db)):
    """Run migration to add is_deleted and is_canceled columns"""
    try:
        from sqlalchemy import text
        
        # Add deleted/canceled columns
        db.execute(text("""
            ALTER TABLE work_orders 
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_canceled BOOLEAN DEFAULT FALSE
        """))
        
        # Add indexes
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_work_orders_is_deleted 
            ON work_orders (is_deleted)
        """))
        
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_work_orders_is_canceled 
            ON work_orders (is_canceled)
        """))
        
        db.commit()
        return {"message": "Deleted/canceled columns added successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


@app.post("/api/migrate/status-progress")
def migrate_status_progress(db: Session = Depends(get_db)):
    """Run migration to add cetec_status_progress column"""
    try:
        from sqlalchemy import text
        
        # Add status progress column
        db.execute(text("""
            ALTER TABLE work_orders 
            ADD COLUMN IF NOT EXISTS cetec_status_progress TEXT
        """))
        
        db.commit()
        return {"message": "Status progress column added successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

