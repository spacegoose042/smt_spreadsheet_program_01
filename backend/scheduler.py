"""
Core scheduling logic for calculating minimum start dates and managing work orders
"""
from datetime import date, datetime, timedelta
from typing import Optional
from models import WorkOrder, SMTLine, THKitStatus


def is_weekend(check_date: date) -> bool:
    """Check if a date falls on a weekend (Saturday=5, Sunday=6)"""
    return check_date.weekday() >= 5


def add_business_days(start_date: date, days: float) -> date:
    """Add business days (skipping weekends) to a date"""
    import math
    
    current_date = start_date
    days_remaining = abs(days)
    direction = 1 if days >= 0 else -1
    
    # Round up fractional days (0.1 days still counts as needing to move to next day)
    full_days = math.ceil(days_remaining) if days_remaining > 0 else 0
    
    for _ in range(full_days):
        current_date += timedelta(days=direction)
        # Skip weekends
        while is_weekend(current_date):
            current_date += timedelta(days=direction)
    
    return current_date


def calculate_actual_ship_date(cetec_ship_date: date, th_kit_status: THKitStatus) -> date:
    """
    Calculate the actual ship date based on TH KIT status.
    If SMT ONLY, subtract 7 days to account for no dependent through-hole work.
    """
    if th_kit_status == THKitStatus.SMT_ONLY:
        # Subtract 7 calendar days
        return cetec_ship_date - timedelta(days=7)
    return cetec_ship_date


def calculate_setup_time_hours(trolley_count: int) -> float:
    """
    Calculate setup time based on trolley count.
    This is a simplified version - adjust based on your actual formula.
    
    Assuming:
    - 1-2 trolleys: 1 hour
    - 3-4 trolleys: 2 hours
    - 5-6 trolleys: 3 hours
    - 7-8 trolleys: 4 hours
    """
    if trolley_count <= 2:
        return 1.0
    elif trolley_count <= 4:
        return 2.0
    elif trolley_count <= 6:
        return 3.0
    else:
        return 4.0


def calculate_min_start_date(
    actual_ship_date: date,
    time_minutes: float,
    setup_time_hours: float,
    line_hours_per_day: float = 8.0,
    line_name: str = None
) -> date:
    """
    Calculate the minimum start date by working backwards from the actual ship date.
    
    Args:
        actual_ship_date: The target completion date
        time_minutes: Build time in minutes
        setup_time_hours: Setup time in hours
        line_hours_per_day: How many hours the line runs per day
        line_name: Name of the line (for Line 1 2x multiplier)
    
    Returns:
        The minimum start date (skipping weekends)
    """
    # Line 1 (1-EURO 264) takes twice as long
    time_multiplier = 2.0 if line_name == "1-EURO 264" else 1.0
    
    # Convert everything to minutes (with multiplier)
    total_minutes = (time_minutes + (setup_time_hours * 60)) * time_multiplier
    minutes_per_day = line_hours_per_day * 60
    
    # Calculate number of business days needed
    days_needed = total_minutes / minutes_per_day
    
    # Work backwards from actual ship date, skipping weekends
    min_start = add_business_days(actual_ship_date, -days_needed)
    
    return min_start


def update_work_order_calculations(wo: WorkOrder, line: Optional[SMTLine] = None) -> WorkOrder:
    """
    Update all calculated fields for a work order.
    This should be called whenever relevant fields change.
    """
    # Calculate actual ship date
    wo.actual_ship_date = calculate_actual_ship_date(wo.cetec_ship_date, wo.th_kit_status)
    
    # Calculate setup time based on trolley count
    wo.setup_time_hours = calculate_setup_time_hours(wo.trolley_count)
    
    # Calculate minimum start date (with Line 1 2x multiplier if applicable)
    line_hours = line.hours_per_day if line else 8.0
    line_name = line.name if line else None
    wo.min_start_date = calculate_min_start_date(
        wo.actual_ship_date,
        wo.time_minutes,
        wo.setup_time_hours,
        line_hours,
        line_name
    )
    
    return wo


def get_trolley_count_in_use(session, exclude_wo_id: Optional[int] = None) -> int:
    """
    Calculate total trolleys currently in use.
    Counts trolleys for work orders with status "Running" or "Clear to Build" (with or without *)
    """
    from sqlalchemy import and_
    from models import WorkOrderStatus
    
    query = session.query(WorkOrder).filter(
        and_(
            WorkOrder.is_complete == False,
            WorkOrder.status.in_([
                WorkOrderStatus.RUNNING,
                WorkOrderStatus.SECOND_SIDE_RUNNING,
                WorkOrderStatus.CLEAR_TO_BUILD,
                WorkOrderStatus.CLEAR_TO_BUILD_NEW
            ])
        )
    )
    
    if exclude_wo_id:
        query = query.filter(WorkOrder.id != exclude_wo_id)
    
    work_orders = query.all()
    total_trolleys = sum(wo.trolley_count for wo in work_orders)
    
    return total_trolleys


def check_trolley_limit(session, new_trolley_count: int, exclude_wo_id: Optional[int] = None) -> dict:
    """
    Check if adding trolleys would exceed the limit.
    
    Returns:
        dict with 'current', 'proposed', 'limit', 'exceeds' keys
    """
    TROLLEY_LIMIT = 24
    current_in_use = get_trolley_count_in_use(session, exclude_wo_id)
    proposed_total = current_in_use + new_trolley_count
    
    return {
        "current": current_in_use,
        "proposed": proposed_total,
        "limit": TROLLEY_LIMIT,
        "exceeds": proposed_total > TROLLEY_LIMIT,
        "warning": proposed_total >= TROLLEY_LIMIT - 2  # Warning threshold
    }


def reorder_line_positions(session, line_id: int, inserted_position: int, wo_id: Optional[int] = None):
    """
    Reorder work orders on a line when a new position is assigned.
    Shifts all positions >= inserted_position down by 1.
    
    Args:
        session: Database session
        line_id: The line to reorder
        inserted_position: The position being inserted
        wo_id: The work order being inserted (to exclude from shifting)
    """
    # Get all work orders on this line at or after the inserted position
    query = session.query(WorkOrder).filter(
        WorkOrder.line_id == line_id,
        WorkOrder.line_position >= inserted_position,
        WorkOrder.is_complete == False
    )
    
    if wo_id:
        query = query.filter(WorkOrder.id != wo_id)
    
    # Shift them all down by 1
    for wo in query.all():
        wo.line_position += 1
    
    session.commit()


def validate_line_position(session, line_id: int, position: int, wo_id: Optional[int] = None) -> bool:
    """
    Check if a position is already taken on a line.
    
    Returns:
        True if position is available, False if already taken
    """
    query = session.query(WorkOrder).filter(
        WorkOrder.line_id == line_id,
        WorkOrder.line_position == position,
        WorkOrder.is_complete == False
    )
    
    if wo_id:
        query = query.filter(WorkOrder.id != wo_id)
    
    return query.first() is None


def calculate_job_dates(session, line_id: int, line_hours_per_day: float = 8.0) -> dict:
    """
    Calculate actual start and end dates for all jobs in a line's queue.
    
    This calculates sequentially:
    - First job starts today (or its WO start date if set)
    - Each subsequent job starts when the previous one ends
    - End date accounts for build time, setup time, line capacity, and weekends
    - Line 1 (1-EURO 264) takes twice as long (2x multiplier)
    
    Returns:
        dict mapping work_order_id to {'start_date': date, 'end_date': date}
    """
    from datetime import date as date_type, timedelta
    from models import SMTLine
    
    # Get all jobs on this line, ordered by position
    jobs = session.query(WorkOrder).filter(
        WorkOrder.line_id == line_id,
        WorkOrder.is_complete == False
    ).order_by(WorkOrder.line_position).all()
    
    if not jobs:
        return {}
    
    # Check if this is Line 1 (1-EURO 264) - it takes twice as long
    line = session.query(SMTLine).filter(SMTLine.id == line_id).first()
    time_multiplier = 2.0 if line and line.name == "1-EURO 264" else 1.0
    
    results = {}
    current_date = date_type.today()
    
    # Ensure we start on a business day
    while is_weekend(current_date):
        current_date += timedelta(days=1)
    
    for job in jobs:
        # Start date is either the current_date or the job's manual start date
        start_date = job.wo_start_date if job.wo_start_date and job.wo_start_date > current_date else current_date
        
        # Ensure start date is not a weekend
        while is_weekend(start_date):
            start_date += timedelta(days=1)
        
        # Calculate total time needed (with Line 1 multiplier if applicable)
        total_minutes = (job.time_minutes + (job.setup_time_hours * 60)) * time_multiplier
        minutes_per_day = line_hours_per_day * 60
        days_needed = total_minutes / minutes_per_day
        
        # Calculate end date by adding business days (rounds up fractional days)
        end_date = add_business_days(start_date, days_needed)
        
        results[job.id] = {
            'start_date': start_date,
            'end_date': end_date
        }
        
        # Next job starts the next business day after this one ends
        # Add 1 business day using the add_business_days function
        current_date = add_business_days(end_date, 1)
    
    return results


def get_line_completion_date(session, line_id: int, line_hours_per_day: float = 8.0) -> Optional[date]:
    """
    Get the completion date of the last job in a line's queue.
    
    Returns:
        The end date of the last job, or None if no jobs
    """
    job_dates = calculate_job_dates(session, line_id, line_hours_per_day)
    
    if not job_dates:
        return None
    
    # Get the latest end date
    end_dates = [dates['end_date'] for dates in job_dates.values()]
    return max(end_dates) if end_dates else None

