"""
Main FastAPI application
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from database import engine, get_db, Base
from models import WorkOrder, SMTLine, CompletedWorkOrder, WorkOrderStatus, Priority
import schemas
import scheduler as sched
import time_scheduler as time_sched

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SMT Production Scheduler API",
    description="API for managing SMT production scheduling",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/")
def read_root():
    return {"status": "ok", "message": "SMT Production Scheduler API"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


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
        estimated_time_minutes=db_wo.time_minutes,
        time_variance_minutes=completion_data.actual_time_clocked_minutes - db_wo.time_minutes
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
    
    # Recalculate variance
    if completed.actual_time_clocked_minutes and completed.estimated_time_minutes:
        completed.time_variance_minutes = completed.actual_time_clocked_minutes - completed.estimated_time_minutes
    
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

