"""
Time-of-day scheduling logic with shift support
"""
from datetime import datetime, date, time, timedelta
from typing import List, Optional, Tuple
from models import Shift, ShiftBreak, LineConfiguration
import math


def round_to_nearest(dt: datetime, minutes: int) -> datetime:
    """Round datetime to nearest X minutes"""
    # Round minutes
    rounded_minutes = round(dt.minute / minutes) * minutes
    
    if rounded_minutes >= 60:
        dt = dt.replace(minute=0) + timedelta(hours=1)
    else:
        dt = dt.replace(minute=rounded_minutes, second=0, microsecond=0)
    
    return dt


def get_shift_working_minutes(shift: Shift, include_breaks: bool = False) -> float:
    """
    Calculate total working minutes in a shift.
    
    Args:
        shift: The shift object
        include_breaks: If True, includes break time (for visual display)
    
    Returns:
        Total minutes of work time
    """
    # Calculate shift duration
    shift_start = datetime.combine(date.today(), shift.start_time)
    shift_end = datetime.combine(date.today(), shift.end_time)
    
    # Handle shifts that cross midnight
    if shift_end <= shift_start:
        shift_end += timedelta(days=1)
    
    total_minutes = (shift_end - shift_start).total_seconds() / 60
    
    # Subtract breaks if not including them
    if not include_breaks and shift.breaks:
        for br in shift.breaks:
            if not br.is_paid:
                break_start = datetime.combine(date.today(), br.start_time)
                break_end = datetime.combine(date.today(), br.end_time)
                if break_end <= break_start:
                    break_end += timedelta(days=1)
                total_minutes -= (break_end - break_start).total_seconds() / 60
    
    return total_minutes


def is_during_break(dt: datetime, breaks: List[ShiftBreak]) -> bool:
    """Check if a datetime falls during a break"""
    check_time = dt.time()
    
    for br in breaks:
        if br.start_time <= check_time < br.end_time:
            return True
    
    return False


def add_work_time(start_dt: datetime, minutes: float, shift: Shift, buffer_minutes: float = 0) -> datetime:
    """
    Add working minutes to a datetime, accounting for shift boundaries and breaks.
    
    Args:
        start_dt: Starting datetime
        minutes: Minutes to add
        shift: The shift to work within
        buffer_minutes: Buffer time to add after
    
    Returns:
        End datetime
    """
    current_dt = start_dt
    remaining_minutes = minutes
    
    while remaining_minutes > 0:
        # Check if we're in a break - skip to end of break
        if shift.breaks and is_during_break(current_dt, shift.breaks):
            for br in shift.breaks:
                if br.start_time <= current_dt.time() < br.end_time:
                    # Skip to end of break
                    break_end = datetime.combine(current_dt.date(), br.end_time)
                    if break_end <= current_dt:
                        break_end += timedelta(days=1)
                    current_dt = break_end
                    break
            continue
        
        # Check if we're within shift hours
        shift_start = datetime.combine(current_dt.date(), shift.start_time)
        shift_end = datetime.combine(current_dt.date(), shift.end_time)
        
        if shift_end <= shift_start:
            shift_end += timedelta(days=1)
        
        # If before shift start, jump to shift start
        if current_dt < shift_start:
            current_dt = shift_start
            continue
        
        # If past shift end, jump to next day's shift start
        if current_dt >= shift_end:
            next_day = current_dt.date() + timedelta(days=1)
            # Skip weekends
            while next_day.weekday() >= 5:
                next_day += timedelta(days=1)
            current_dt = datetime.combine(next_day, shift.start_time)
            continue
        
        # Find next break or shift end
        next_break_start = None
        if shift.breaks:
            for br in shift.breaks:
                break_start = datetime.combine(current_dt.date(), br.start_time)
                if break_start > current_dt:
                    if next_break_start is None or break_start < next_break_start:
                        next_break_start = break_start
        
        # Calculate how much time we can work until next boundary
        boundary = next_break_start if next_break_start and next_break_start < shift_end else shift_end
        available_minutes = (boundary - current_dt).total_seconds() / 60
        
        if remaining_minutes <= available_minutes:
            # Job finishes within this work period
            current_dt += timedelta(minutes=remaining_minutes)
            remaining_minutes = 0
        else:
            # Use all available time and continue
            remaining_minutes -= available_minutes
            current_dt = boundary
    
    # Add buffer time (also accounts for breaks/shifts)
    if buffer_minutes > 0:
        current_dt = add_work_time(current_dt, buffer_minutes, shift, 0)
    
    return current_dt


def get_next_available_start(after_dt: datetime, shift: Shift, round_minutes: int = 15) -> datetime:
    """
    Get the next available start time, rounded to nearest interval.
    
    Args:
        after_dt: The datetime after which to find availability
        shift: The shift to work within
        round_minutes: Round to nearest X minutes
    
    Returns:
        Next available start datetime
    """
    # Round to nearest interval
    next_start = round_to_nearest(after_dt, round_minutes)
    
    # Ensure it's during shift hours
    shift_start = datetime.combine(next_start.date(), shift.start_time)
    shift_end = datetime.combine(next_start.date(), shift.end_time)
    
    if shift_end <= shift_start:
        shift_end += timedelta(days=1)
    
    # If before shift start, start at shift start
    if next_start < shift_start:
        next_start = shift_start
    
    # If after shift end, start next day
    if next_start >= shift_end:
        next_day = next_start.date() + timedelta(days=1)
        # Skip weekends
        while next_day.weekday() >= 5:
            next_day += timedelta(days=1)
        next_start = datetime.combine(next_day, shift.start_time)
    
    # If during a break, skip to end of break
    if shift.breaks and is_during_break(next_start, shift.breaks):
        for br in shift.breaks:
            if br.start_time <= next_start.time() < br.end_time:
                next_start = datetime.combine(next_start.date(), br.end_time)
                break
    
    return round_to_nearest(next_start, round_minutes)


def calculate_job_datetimes(session, line_id: int, timezone_str: str = "America/Chicago") -> dict:
    """
    Calculate start and end datetimes for all jobs in a line's queue.
    Accounts for shifts, breaks, buffer time, and time rounding.
    
    Returns:
        dict mapping work_order_id to {'start_datetime': datetime, 'end_datetime': datetime}
    """
    from models import WorkOrder, SMTLine
    import pytz
    
    # Get line and its configuration
    line = session.query(SMTLine).filter(SMTLine.id == line_id).first()
    if not line:
        return {}
    
    # Get or create configuration
    config = line.configuration
    if not config:
        from models import LineConfiguration
        config = LineConfiguration(
            line_id=line_id,
            buffer_time_minutes=15.0,
            time_rounding_minutes=15,
            timezone=timezone_str
        )
        session.add(config)
        session.commit()
    
    # Get primary shift (or create default)
    shifts = [s for s in line.shifts if s.is_active]
    if not shifts:
        # Create default shift: 7:30 AM - 4:30 PM with lunch 11:30-12:30
        from models import Shift, ShiftBreak
        default_shift = Shift(
            line_id=line_id,
            name="Day Shift",
            shift_number=1,
            start_time=time(7, 30),
            end_time=time(16, 30),
            active_days="1,2,3,4,5",
            is_active=True
        )
        session.add(default_shift)
        session.flush()
        
        lunch_break = ShiftBreak(
            shift_id=default_shift.id,
            name="Lunch",
            start_time=time(11, 30),
            end_time=time(12, 30),
            is_paid=False
        )
        session.add(lunch_break)
        session.commit()
        shifts = [default_shift]
    
    primary_shift = shifts[0]  # Use first active shift
    
    # Get all jobs on this line, ordered by position
    jobs = session.query(WorkOrder).filter(
        WorkOrder.line_id == line_id,
        WorkOrder.is_complete == False
    ).order_by(WorkOrder.line_position).all()
    
    if not jobs:
        return {}
    
    # Check if this is Line 1 (2x multiplier)
    time_multiplier = 2.0 if line.name == "1-EURO 264" else 1.0
    
    # Set timezone
    tz = pytz.timezone(config.timezone)
    
    # Start from now (or beginning of today's shift if in the past)
    now = datetime.now(tz).replace(tzinfo=None)
    current_datetime = now
    
    # If past shift end, start tomorrow
    shift_end_today = datetime.combine(now.date(), primary_shift.end_time)
    if now >= shift_end_today:
        next_day = now.date() + timedelta(days=1)
        while next_day.weekday() >= 5:
            next_day += timedelta(days=1)
        current_datetime = datetime.combine(next_day, primary_shift.start_time)
    
    results = {}
    
    for job in jobs:
        # Start datetime (manual override or calculated)
        if job.wo_start_datetime and job.wo_start_datetime > current_datetime:
            start_datetime = job.wo_start_datetime
        else:
            start_datetime = get_next_available_start(current_datetime, primary_shift, config.time_rounding_minutes)
        
        # Calculate total time (with multiplier and setup time)
        total_minutes = (job.time_minutes + (job.setup_time_hours * 60)) * time_multiplier
        
        # Calculate end datetime
        end_datetime = add_work_time(start_datetime, total_minutes, primary_shift, config.buffer_time_minutes)
        
        results[job.id] = {
            'start_datetime': start_datetime,
            'end_datetime': end_datetime
        }
        
        # Next job starts where this one ended (including buffer)
        current_datetime = end_datetime
    
    return results

