"""
Core scheduling logic for calculating minimum start dates and managing work orders
"""
from datetime import date, datetime, timedelta, time as time_type
from typing import Optional
from models import WorkOrder, SMTLine, THKitStatus, CapacityOverride, Shift


def get_capacity_for_date(session, line_id: int, check_date: date, default_hours_per_day: float = 8.0) -> float:
    """
    Get the effective capacity (hours) for a specific date on a line.
    Checks for capacity overrides first, then falls back to default shifts or line settings.
    
    Returns:
        Hours of capacity available on this date (0 if closed/maintenance)
    """
    # Check for capacity override first
    override = session.query(CapacityOverride).filter(
        CapacityOverride.line_id == line_id,
        CapacityOverride.start_date <= check_date,
        CapacityOverride.end_date >= check_date
    ).first()
    
    if override:
        return override.total_hours
    
    # No override - check default shifts
    shifts = session.query(Shift).filter(Shift.line_id == line_id).all()
    
    if not shifts:
        # Fall back to line default
        return default_hours_per_day
    
    # Calculate hours from shifts active on this day
    day_of_week = check_date.weekday()
    day_number = 7 if day_of_week == 6 else day_of_week + 1  # Convert to 1=Mon, 7=Sun
    
    total_hours = 0
    for shift in shifts:
        if not shift.is_active or not shift.active_days:
            continue
        
        active_days = [int(d) for d in shift.active_days.split(',')]
        if day_number not in active_days:
            continue
        
        # Calculate shift hours
        if shift.start_time and shift.end_time:
            start_dt = datetime.combine(check_date, shift.start_time)
            end_dt = datetime.combine(check_date, shift.end_time)
            
            hours = (end_dt - start_dt).total_seconds() / 3600
            
            # Handle overnight shifts
            if hours < 0:
                hours += 24
            
            # Subtract unpaid breaks
            for break_item in shift.breaks:
                if not break_item.is_paid:
                    break_start = datetime.combine(check_date, break_item.start_time)
                    break_end = datetime.combine(check_date, break_item.end_time)
                    break_hours = (break_end - break_start).total_seconds() / 3600
                    hours -= break_hours
            
            total_hours += hours
    
    return total_hours if total_hours > 0 else default_hours_per_day


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
    
    NOTE: These calculations work for ANY work order status.
    Status does NOT affect min_start_date, actual_ship_date, or setup_time calculations.
    """
    # Calculate actual ship date
    wo.actual_ship_date = calculate_actual_ship_date(wo.cetec_ship_date, wo.th_kit_status)
    
    # Calculate setup time based on trolley count
    wo.setup_time_hours = calculate_setup_time_hours(wo.trolley_count)
    
    # Calculate minimum start date (with Line 1 2x multiplier if applicable)
    # This calculation works regardless of work order status
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
    - Respects capacity overrides and varying shift configurations
    
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
    
    # Ensure we start on a business day with capacity
    while is_weekend(current_date) or get_capacity_for_date(session, line_id, current_date, line_hours_per_day) == 0:
        current_date += timedelta(days=1)
    
    for job in jobs:
        # If job is locked, keep its existing dates and use its end date as the baseline
        if job.is_locked and job.calculated_start_datetime and job.calculated_end_datetime:
            # Convert datetimes to dates
            locked_start_date = job.calculated_start_datetime.date() if isinstance(job.calculated_start_datetime, datetime) else job.calculated_start_datetime
            locked_end_date = job.calculated_end_datetime.date() if isinstance(job.calculated_end_datetime, datetime) else job.calculated_end_datetime
            
            results[job.id] = {
                'start_date': locked_start_date,
                'end_date': locked_end_date
            }
            # Next job starts after this locked job
            current_date = locked_end_date + timedelta(days=1)
            while is_weekend(current_date) or get_capacity_for_date(session, line_id, current_date, line_hours_per_day) == 0:
                current_date += timedelta(days=1)
            continue
        # Start date
        start_date = current_date
        
        # Ensure start date is not a weekend or zero-capacity day
        while is_weekend(start_date) or get_capacity_for_date(session, line_id, start_date, line_hours_per_day) == 0:
            start_date += timedelta(days=1)
        
        # Calculate total time needed (with Line 1 multiplier if applicable)
        total_minutes_needed = (job.time_minutes + (job.setup_time_hours * 60)) * time_multiplier
        
        # Walk through days, accumulating capacity until job is complete
        minutes_remaining = total_minutes_needed
        end_date = start_date
        
        while minutes_remaining > 0:
            # Get capacity for this day
            day_capacity_hours = get_capacity_for_date(session, line_id, end_date, line_hours_per_day)
            
            # Skip weekends and zero-capacity days
            if is_weekend(end_date) or day_capacity_hours == 0:
                end_date += timedelta(days=1)
                continue
            
            # Use this day's capacity
            day_capacity_minutes = day_capacity_hours * 60
            minutes_remaining -= day_capacity_minutes
            
            if minutes_remaining > 0:
                # Need more days
                end_date += timedelta(days=1)
        
        results[job.id] = {
            'start_date': start_date,
            'end_date': end_date
        }
        
        # Next job starts the next business day after this one ends
        current_date = end_date + timedelta(days=1)
        while is_weekend(current_date) or get_capacity_for_date(session, line_id, current_date, line_hours_per_day) == 0:
            current_date += timedelta(days=1)
    
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

