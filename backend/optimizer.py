"""
SMT Production Scheduler - Throughput-Focused Optimizer

This module provides intelligent auto-scheduling for SMT work orders.

Core Strategy:
- MAXIMIZE THROUGHPUT (jobs/day) as primary goal
- Track promise dates but don't sacrifice throughput to hit them
- Jobs can finish up to 3 weeks early (no cash flow impact)
- Respect trolley constraints (24 max in positions 1+2)
- Reserve Line 4 for MCI jobs only
- Honor locked jobs (manual overrides)
- Multi-day jobs flow naturally across days

Priority Handling:
1. Critical Mass: Immediate scheduling (position 1)
2. Overclocked: High priority (positions 2-3 typically)
3. Factory Default: Normal priority (optimize for throughput)
4. Trickle Charge: Lower priority
5. Power Down: Lowest priority
"""

"""Test Comment for change"""

from datetime import date, datetime, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_
import math
from models import WorkOrder, SMTLine, Priority, Status
from scheduler import (
    calculate_job_dates,
    get_capacity_for_date,
    is_weekend,
    add_business_days
)


def get_schedulable_jobs(session: Session) -> List[WorkOrder]:
    """
    Get all jobs that can be scheduled by the optimizer.
    
    Criteria:
    - In 'SMT PRODUCTION' location (material ready)
    - Not complete
    - Not locked (user has manually positioned)
    - Not manual schedule (hand-built schedules excluded)
    
    Returns:
        List of WorkOrder objects ready for scheduling
    """
    jobs = session.query(WorkOrder).filter(
        and_(
            WorkOrder.is_complete == False,
            WorkOrder.is_locked == False,
            WorkOrder.is_manual_schedule == False,
            WorkOrder.current_location == 'SMT PRODUCTION'
        )
    ).all()
    
    return jobs


def calculate_earliest_completion_dates(session: Session, jobs: List[WorkOrder] = None):
    """
    Calculate the earliest possible completion date for each job.
    This assumes unlimited capacity - just shows if promise date is theoretically achievable.
    
    Sets earliest_completion_date on each WorkOrder.
    This is used to flag jobs "at risk" of missing promise dates.
    # Balanced mode load distribution fix applied
    
    Args:
        session: Database session
        jobs: Optional list of jobs to calculate. If None, calculates for all schedulable jobs.
    """
    if jobs is None:
        jobs = get_schedulable_jobs(session)
    
    for job in jobs:
        if not job.min_start_date or not job.time_minutes:
            continue
        
        # Calculate how many days this job needs
        # Account for Line 1 2x multiplier if assigned
        time_multiplier = 2.0 if job.line and job.line.name == "1-EURO 264" else 1.0
        
        total_minutes = (job.time_minutes + (job.setup_time_hours or 0) * 60) * time_multiplier
        
        # Assume 8 hours/day capacity
        hours_per_day = 8.0
        minutes_per_day = hours_per_day * 60
        days_needed = total_minutes / minutes_per_day
        
        # Start from min_start_date and add business days
        earliest_completion = add_business_days(job.min_start_date, days_needed)
        
        job.earliest_completion_date = earliest_completion
    
    session.commit()


def get_mci_line(session: Session) -> Optional[SMTLine]:
    """
    Get Line 4 (MCI dedicated line).
    
    Returns:
        SMTLine object for MCI line, or None if not found
    """
    return session.query(SMTLine).filter(
        and_(
            SMTLine.is_special_customer == True,
            SMTLine.special_customer_name == "MCI"
        )
    ).first()


def get_general_lines(session: Session) -> List[SMTLine]:
    """
    Get general purpose lines available for auto-scheduling.
    Excludes:
    - MCI dedicated lines (is_special_customer=True)
    - Manual-only/hand-build lines (is_manual_only=True)
    
    Returns:
        List of SMTLine objects available for auto-scheduling
    """
    return session.query(SMTLine).filter(
        and_(
            SMTLine.is_active == True,
            SMTLine.is_special_customer == False,
            SMTLine.is_manual_only == False
        )
    ).order_by(SMTLine.order_position).all()


def move_jobs_off_down_lines(session: Session, general_lines: List[SMTLine], mci_line: Optional[SMTLine]) -> List[WorkOrder]:
    """
    Identify and move jobs that are scheduled during line downtime.
    
    Args:
        session: Database session
        general_lines: List of general lines available for scheduling
        mci_line: MCI line (if available)
    
    Returns:
        List of WorkOrder objects that were moved
    """
    moved_jobs = []
    all_lines = general_lines + ([mci_line] if mci_line else [])
    
    for line in all_lines:
        # Get all jobs currently scheduled on this line
        line_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.line_id == line.id,
                WorkOrder.is_complete == False,
                WorkOrder.is_locked == False  # Don't move locked jobs
            )
        ).all()
        
        for job in line_jobs:
            # Check if job is scheduled during downtime
            if job.calculated_start_datetime and job.calculated_end_datetime:
                job_start = job.calculated_start_datetime.date()
                job_end = job.calculated_end_datetime.date()
                
                # Check each day the job is scheduled
                current_date = job_start
                job_conflicts_with_downtime = False
                
                while current_date <= job_end:
                    day_capacity = get_capacity_for_date(session, line.id, current_date, 8.0)
                    if day_capacity == 0:
                        job_conflicts_with_downtime = True
                        print(f"🚨 Job {job.wo_number} on Line {line.id} conflicts with downtime on {current_date}")
                        break
                    current_date += timedelta(days=1)
                
                if job_conflicts_with_downtime:
                    # Move this job to another line
                    print(f"🔄 Moving job {job.wo_number} off Line {line.id} due to downtime conflict")
                    
                    # Remove from current line
                    job.line_id = None
                    job.line_position = None
                    job.calculated_start_datetime = None
                    job.calculated_end_datetime = None
                    
                    moved_jobs.append(job)
    
    if moved_jobs:
        print(f"📦 Moved {len(moved_jobs)} jobs off down lines: {[job.wo_number for job in moved_jobs]}")
        session.commit()
    
    return moved_jobs


def get_line_current_load(session: Session, line_id: int) -> Dict:
    """
    Calculate current workload on a line.
    
    Returns:
        dict with:
        - job_count: Number of jobs in queue
        - total_hours: Total hours of work
        - positions_used: Highest position number
        - trolleys_in_p1_p2: Trolley count in positions 1+2
    """
    jobs = session.query(WorkOrder).filter(
        and_(
            WorkOrder.line_id == line_id,
            WorkOrder.is_complete == False
        )
    ).order_by(WorkOrder.line_position).all()
    
    if not jobs:
        return {
            'job_count': 0,
            'total_hours': 0,
            'positions_used': 0,
            'trolleys_in_p1_p2': 0,
            'completion_date': date.today()
        }
    
    # Calculate total hours
    total_minutes = sum(
        (job.time_minutes or 0) + ((job.setup_time_hours or 0) * 60)
        for job in jobs
    )
    
    # Check Line 1 multiplier
    line = session.query(SMTLine).filter(SMTLine.id == line_id).first()
    if line and line.name == "1-EURO 264":
        total_minutes *= 2.0
    
    total_hours = total_minutes / 60
    
    # Count trolleys in positions 1 and 2
    trolleys_p1_p2 = sum(
        job.trolley_count or 0
        for job in jobs
        if job.line_position in [1, 2]
    )
    
    # Get highest position used (handle case where all positions are None)
    positions = [job.line_position for job in jobs if job.line_position is not None]
    positions_used = max(positions) if positions else 0
    
    # Get completion date of last job
    job_dates = calculate_job_dates(session, line_id)
    completion_date = date.today()
    if job_dates:
        end_dates = [dates['end_date'] for dates in job_dates.values()]
        completion_date = max(end_dates) if end_dates else date.today()
    
    return {
        'job_count': len(jobs),
        'total_hours': total_hours,
        'positions_used': positions_used,
        'trolleys_in_p1_p2': trolleys_p1_p2,
        'completion_date': completion_date
    }


def find_best_line_for_job(
    session: Session,
    job: WorkOrder,
    general_lines: List[SMTLine],
    line_loads: Dict[int, Dict],
    mode: str = 'balanced'
) -> Tuple[int, int]:
    """
    Find the best line and position for a job.
    
    Strategy:
    - Balanced mode: Pick line with fewest jobs (load balancing)
    - Throughput mode: Pick line with earliest completion date (maximize throughput)
    - Always check trolley constraints and line capacity
    
    Args:
        session: Database session
        job: WorkOrder to assign
        general_lines: List of available lines (1-3)
        line_loads: Current load info for each line
        mode: 'balanced' or 'throughput_max' or 'promise_focused'
    
    Returns:
        (line_id, position) tuple
    """
    best_line = None
    best_position = None
    earliest_completion = None
    
    for line in general_lines:
        load = line_loads[line.id]
        
        # Position will be at end of queue
        proposed_position = load['positions_used'] + 1
        
        # Check trolley constraint if this would be position 1 or 2
        if proposed_position <= 2:
            proposed_trolleys = load['trolleys_in_p1_p2'] + (job.trolley_count or 0)
            if proposed_trolleys > 24:
                # Can't fit here due to trolley limit
                continue
        
        # Calculate when this job would complete on this line
        # This is roughly: line's current completion + this job's time
        line_completion = load['completion_date']
        
        # Check if line has capacity during the scheduling period
        # If line completion is today or in the future, check capacity
        if line_completion >= date.today():
            # Check capacity for the days this job would run
            job_start_date = line_completion
            job_duration_days = max(1, math.ceil((job.time_minutes or 0) / 60 / 8))  # Rough estimate
            
            has_capacity = True
            for day_offset in range(job_duration_days):
                check_date = job_start_date + timedelta(days=day_offset)
                day_capacity = get_capacity_for_date(session, line.id, check_date, 8.0)
                print(f"🔍 Optimizer checking Line {line.id} capacity on {check_date}: {day_capacity}h")
                if day_capacity == 0:
                    # Line is down on this date - skip this line
                    print(f"❌ Line {line.id} is down on {check_date} - skipping for job {job.wo_number}")
                    has_capacity = False
                    break
            
            if not has_capacity:
                print(f"❌ Skipping Line {line.id} for job {job.wo_number} - no capacity during scheduling period")
                continue  # Skip this line if it's down during scheduling period
        
        # Choose line based on mode
        if best_line is None:
            best_line = line.id
            best_position = proposed_position
            earliest_completion = line_completion
            print(f"🎯 First line selected: Line {line.id} ({line.name}) with {load['job_count']} jobs")
        else:
            # For balanced mode, prefer line with fewer jobs
            # For throughput mode, prefer line with earliest completion
            current_job_count = line_loads[best_line]['job_count']
            this_job_count = load['job_count']
            
            print(f"🔍 Comparing Line {line.id} ({line.name}): {this_job_count} jobs vs Line {best_line}: {current_job_count} jobs")
            
            if mode == 'balanced':
                if this_job_count < current_job_count:
                    print(f"✅ Balanced mode: Line {line.id} has fewer jobs ({this_job_count} < {current_job_count}) - selecting it")
                    best_line = line.id
                    best_position = proposed_position
                    earliest_completion = line_completion
                elif this_job_count == current_job_count:
                    # Tiebreaker: choose line with earlier completion date for better load distribution
                    if line_completion < earliest_completion:
                        print(f"✅ Balanced mode: Tiebreaker - Line {line.id} has earlier completion ({line_completion} < {earliest_completion}) - selecting it")
                        best_line = line.id
                        best_position = proposed_position
                        earliest_completion = line_completion
                    else:
                        print(f"❌ Balanced mode: Tiebreaker - keeping Line {best_line} with earlier completion")
                else:
                    print(f"❌ Balanced mode: Line {line.id} has more jobs ({this_job_count} > {current_job_count}) - keeping Line {best_line}")
            elif mode != 'balanced' and line_completion < earliest_completion:
                print(f"✅ Throughput mode: Line {line.id} has earlier completion ({line_completion} < {earliest_completion}) - selecting it")
                best_line = line.id
                best_position = proposed_position
                earliest_completion = line_completion
            else:
                print(f"❌ Keeping current best line {best_line}")
    
    if best_line is None:
        # Fallback: assign to first line (shouldn't happen often)
        best_line = general_lines[0].id
        best_position = line_loads[best_line]['positions_used'] + 1
    
    return (best_line, best_position)


def optimize_for_throughput(
    session: Session,
    mode: str = 'balanced',
    dry_run: bool = False,
    clear_existing: bool = False
) -> Dict:
    """
    Main optimizer function - THROUGHPUT FOCUSED.
    
    Algorithm:
    1. Get all schedulable jobs (SMT PRODUCTION, not complete, not locked)
    2. Calculate earliest completion dates (flag at-risk jobs)
    3. Sort by priority, then promise date
    4. Assign MCI jobs to Line 4
    5. Distribute other jobs across Lines 1-3 (balance load)
    6. Calculate scheduled start/end dates for all jobs
    7. Update promise_date_variance_days
    
    Args:
        session: Database session
        mode: 'balanced', 'promise_focused', or 'throughput_max'
        dry_run: If True, return proposed changes without saving
    
    Returns:
        dict with:
        - jobs_scheduled: Number of jobs scheduled
        - jobs_at_risk: Jobs that might miss promise dates
        - jobs_will_be_late: Jobs currently scheduled to be late
        - line_assignments: Summary of assignments per line
        - trolley_utilization: Trolley counts per line
        - changes: List of proposed changes (if dry_run)
    """
    # Step 1: Get schedulable jobs
    jobs = get_schedulable_jobs(session)
    
    # Step 1.5: Move existing jobs off down lines
    general_lines = get_general_lines(session)
    mci_line = get_mci_line(session)
    moved_jobs = move_jobs_off_down_lines(session, general_lines, mci_line)
    
    # Add moved jobs to the schedulable jobs list
    jobs.extend(moved_jobs)
    
    # Step 1.6: Clear existing schedules if requested (for true balanced mode)
    if clear_existing and not dry_run:
        print("🧹 Clearing existing schedules for balanced redistribution...")
        # Get all currently scheduled jobs (including the ones we just got)
        all_scheduled_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.line_id.isnot(None),
                WorkOrder.is_complete == False,
                WorkOrder.is_locked == False  # Don't clear locked jobs
            )
        ).all()
        
        for job in all_scheduled_jobs:
            job.line_id = None
            job.line_position = None
            job.calculated_start_datetime = None
            job.calculated_end_datetime = None
        
        # Add all cleared jobs to our schedulable list
        jobs.extend(all_scheduled_jobs)
        print(f"📦 Cleared {len(all_scheduled_jobs)} existing jobs for redistribution")
    
    if not jobs:
        return {
            'jobs_scheduled': 0,
            'jobs_at_risk': [],
            'jobs_will_be_late': [],
            'line_assignments': {},
            'trolley_utilization': {},
            'changes': []
        }
    
    # Step 2: Calculate earliest completion dates
    calculate_earliest_completion_dates(session, jobs)
    
    # Step 3: Sort jobs by priority, then promise date
    def sort_key(job):
        priority_rank = job.get_priority_rank()
        promise_date = job.cetec_ship_date or date.today()
        return (priority_rank, promise_date)
    
    sorted_jobs = sorted(jobs, key=sort_key)
    
    # Step 4: Lines already obtained in Step 1.5
    
    # Initialize line loads
    line_loads = {}
    for line in general_lines:
        line_loads[line.id] = get_line_current_load(session, line.id)
        load = line_loads[line.id]
        print(f"📊 Line {line.id} ({line.name}): {load['job_count']} jobs, completion: {load['completion_date']}")
    if mci_line:
        line_loads[mci_line.id] = get_line_current_load(session, mci_line.id)
        load = line_loads[mci_line.id]
        print(f"📊 MCI Line {mci_line.id} ({mci_line.name}): {load['job_count']} jobs, completion: {load['completion_date']}")
    
    # Step 5: Assign jobs to lines
    changes = []
    
    for job in sorted_jobs:
        old_line_id = job.line_id
        old_position = job.line_position
        
        # MCI jobs go to Line 4 (if line has capacity)
        if job.is_mci_job() and mci_line:
            load = line_loads[mci_line.id]
            line_completion = load['completion_date']
            
            # Check if MCI line has capacity during scheduling period
            if line_completion >= date.today():
                job_start_date = line_completion
                job_duration_days = max(1, math.ceil((job.time_minutes or 0) / 60 / 8))
                
                has_capacity = True
                for day_offset in range(job_duration_days):
                    check_date = job_start_date + timedelta(days=day_offset)
                    day_capacity = get_capacity_for_date(session, mci_line.id, check_date, 8.0)
                    print(f"🔍 Optimizer checking MCI Line {mci_line.id} capacity on {check_date}: {day_capacity}h")
                    if day_capacity == 0:
                        print(f"❌ MCI Line {mci_line.id} is down on {check_date} - assigning to general lines")
                        has_capacity = False
                        break
                
                if has_capacity:
                    new_line_id = mci_line.id
                    new_position = load['positions_used'] + 1
                    print(f"✅ MCI job {job.wo_number} assigned to MCI Line {mci_line.id}")
                else:
                    # MCI line is down, assign to general lines
                    print(f"🔄 MCI job {job.wo_number} reassigned to general lines due to MCI line downtime")
                    new_line_id, new_position = find_best_line_for_job(
                        session, job, general_lines, line_loads, mode
                    )
            else:
                new_line_id = mci_line.id
                new_position = load['positions_used'] + 1
        else:
            # Find best general line
            new_line_id, new_position = find_best_line_for_job(
                session, job, general_lines, line_loads, mode
            )
        
        # Update job assignment
        if not dry_run:
            job.line_id = new_line_id
            job.line_position = new_position
        
        # Track changes
        if old_line_id != new_line_id or old_position != new_position:
            changes.append({
                'wo_number': job.wo_number,
                'old_line_id': old_line_id,
                'new_line_id': new_line_id,
                'old_position': old_position,
                'new_position': new_position
            })
        
        # Update line load (for next iteration)
        load = line_loads[new_line_id]
        load['positions_used'] = new_position
        if new_position <= 2:
            load['trolleys_in_p1_p2'] += (job.trolley_count or 0)
        
        # Estimate new completion date (rough)
        job_time_hours = ((job.time_minutes or 0) + ((job.setup_time_hours or 0) * 60)) / 60
        line = session.query(SMTLine).filter(SMTLine.id == new_line_id).first()
        if line and line.name == "1-EURO 264":
            job_time_hours *= 2.0
        load['total_hours'] += job_time_hours
        # Assume 8 hours/day capacity
        days_to_add = job_time_hours / 8
        load['completion_date'] = add_business_days(load['completion_date'], days_to_add)
    
    # Step 6: Calculate actual scheduled dates for all lines
    all_lines = general_lines + ([mci_line] if mci_line else [])
    
    for line in all_lines:
        job_dates = calculate_job_dates(session, line.id)
        
        # Update scheduled dates on each job
        for job_id, dates in job_dates.items():
            job = session.query(WorkOrder).filter(WorkOrder.id == job_id).first()
            if job:
                if not dry_run:
                    job.scheduled_start_date = dates['start_date']
                    job.scheduled_end_date = dates['end_date']
                    job.promise_date_variance_days = job.calculate_promise_date_variance()
    
    # Step 6b: Update variance for ALL jobs that have scheduled_end_date (including ones that weren't moved)
    if not dry_run:
        all_scheduled_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.is_complete == False,
                WorkOrder.scheduled_end_date.isnot(None)
            )
        ).all()
        
        for job in all_scheduled_jobs:
            job.promise_date_variance_days = job.calculate_promise_date_variance()
    
    # Step 7: Compile results
    if not dry_run:
        session.commit()
    
    jobs_at_risk = [job for job in jobs if job.is_at_risk()]
    jobs_will_be_late = [job for job in jobs if job.will_be_late()]
    
    line_assignments = {}
    trolley_utilization = {}
    for line in all_lines:
        load = line_loads[line.id]
        line_assignments[line.name] = {
            'job_count': load['job_count'],
            'total_hours': round(load['total_hours'], 2),
            'completion_date': load['completion_date'].isoformat()
        }
        trolley_utilization[line.name] = {
            'positions_1_2': load['trolleys_in_p1_p2'],
            'limit': 24,
            'exceeds_limit': load['trolleys_in_p1_p2'] > 24
        }
    
    return {
        'jobs_scheduled': len(jobs),
        'jobs_at_risk': [{'wo_number': j.wo_number, 'customer': j.customer, 'assembly': j.assembly} for j in jobs_at_risk],
        'jobs_will_be_late': [{'wo_number': j.wo_number, 'customer': j.customer, 'assembly': j.assembly, 'variance_days': j.promise_date_variance_days} for j in jobs_will_be_late],
        'line_assignments': line_assignments,
        'trolley_utilization': trolley_utilization,
        'changes': changes if dry_run else []
    }


def get_capacity_forecast(session: Session, weeks: int = 8) -> Dict:
    """
    Generate capacity forecast for the next N weeks.
    
    Shows:
    - Total available capacity per week
    - Scheduled hours per week
    - Late jobs per week
    - Current/Next week combined (overdue + this week)
    
    Args:
        session: Database session
        weeks: Number of weeks to forecast
    
    Returns:
        dict with weekly capacity data
    """
    today = date.today()
    
    # Get general lines (1-3) for capacity calculation
    general_lines = get_general_lines(session)
    
    # Get all scheduled jobs
    jobs = session.query(WorkOrder).filter(
        and_(
            WorkOrder.is_complete == False,
            WorkOrder.scheduled_end_date.isnot(None)
        )
    ).all()
    
    # Build week buckets
    weeks_data = []
    current_week_start = today - timedelta(days=today.weekday())  # Monday of current week
    
    for week_num in range(weeks):
        week_start = current_week_start + timedelta(weeks=week_num)
        week_end = week_start + timedelta(days=4)  # Friday
        
        # Calculate available capacity for this week
        total_capacity_hours = 0
        for line in general_lines:
            for day_offset in range(5):  # Mon-Fri
                check_date = week_start + timedelta(days=day_offset)
                day_capacity = get_capacity_for_date(session, line.id, check_date, 8.0)
                total_capacity_hours += day_capacity
        
        # Find jobs scheduled in this week
        week_jobs = [
            job for job in jobs
            if week_start <= job.scheduled_end_date <= week_end
        ]
        
        # Calculate scheduled hours
        scheduled_hours = 0
        for job in week_jobs:
            job_minutes = (job.time_minutes or 0) + ((job.setup_time_hours or 0) * 60)
            # Check if on Line 1
            if job.line and job.line.name == "1-EURO 264":
                job_minutes *= 2.0
            scheduled_hours += job_minutes / 60
        
        # Find late jobs (promise date before scheduled end)
        late_jobs = [
            job for job in week_jobs
            if job.will_be_late()
        ]
        
        # Special handling for week 0 (current/next week - includes overdue)
        if week_num == 0:
            # Include any overdue jobs
            overdue_jobs = [
                job for job in jobs
                if job.cetec_ship_date < today and job.scheduled_end_date >= today
            ]
            late_jobs.extend(overdue_jobs)
            late_jobs = list(set(late_jobs))  # Remove duplicates
        
        weeks_data.append({
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'week_label': 'CURRENT/NEXT' if week_num == 0 else f'Week of {week_start.strftime("%m/%d")}',
            'total_capacity_hours': round(total_capacity_hours, 1),
            'scheduled_hours': round(scheduled_hours, 1),
            'available_hours': round(total_capacity_hours - scheduled_hours, 1),
            'late_job_count': len(late_jobs),
            'late_jobs': [
                {
                    'wo_number': job.wo_number,
                    'assembly': job.assembly,
                    'customer': job.customer,
                    'promise_date': job.cetec_ship_date.isoformat(),
                    'scheduled_end': job.scheduled_end_date.isoformat() if job.scheduled_end_date else None,
                    'variance_days': job.promise_date_variance_days
                }
                for job in late_jobs
            ]
        })
    
    # Get pipeline (non-SMT PRODUCTION jobs)
    pipeline_jobs = session.query(WorkOrder).filter(
        and_(
            WorkOrder.is_complete == False,
            WorkOrder.current_location != 'SMT PRODUCTION'
        )
    ).all()
    
    pipeline_by_location = {}
    for job in pipeline_jobs:
        loc = job.current_location or 'UNKNOWN'
        if loc not in pipeline_by_location:
            pipeline_by_location[loc] = {
                'job_count': 0,
                'total_hours': 0
            }
        
        job_hours = ((job.time_minutes or 0) + ((job.setup_time_hours or 0) * 60)) / 60
        pipeline_by_location[loc]['job_count'] += 1
        pipeline_by_location[loc]['total_hours'] += job_hours
    
    return {
        'weeks': weeks_data,
        'pipeline': pipeline_by_location
    }

