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
    current_date = start_date
    days_remaining = abs(days)
    direction = 1 if days >= 0 else -1
    
    while days_remaining > 0:
        current_date += timedelta(days=direction)
        if not is_weekend(current_date):
            days_remaining -= 1
    
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
    line_hours_per_day: float = 8.0
) -> date:
    """
    Calculate the minimum start date by working backwards from the actual ship date.
    
    Args:
        actual_ship_date: The target completion date
        time_minutes: Build time in minutes
        setup_time_hours: Setup time in hours
        line_hours_per_day: How many hours the line runs per day
    
    Returns:
        The minimum start date (skipping weekends)
    """
    # Convert everything to minutes
    total_minutes = time_minutes + (setup_time_hours * 60)
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
    
    # Calculate minimum start date
    line_hours = line.hours_per_day if line else 8.0
    wo.min_start_date = calculate_min_start_date(
        wo.actual_ship_date,
        wo.time_minutes,
        wo.setup_time_hours,
        line_hours
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

