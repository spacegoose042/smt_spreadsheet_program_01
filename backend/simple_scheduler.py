"""
Simple, reliable auto-scheduler for SMT Production.

This replaces the complex optimizer with a straightforward approach:
1. Sort jobs by minimum start date
2. Assign each job to the line with the earliest available slot
3. Keep line completion dates balanced
"""

from datetime import date, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_
import math
from models import WorkOrder, SMTLine
from scheduler import (
    calculate_job_dates,
    get_capacity_for_date,
    add_business_days
)


def get_schedulable_jobs(session: Session) -> List[WorkOrder]:
    """Get all jobs that can be auto-scheduled (unscheduled jobs only)."""
    # Debug: Show what we're filtering
    total_in_smt = session.query(WorkOrder).filter(
        WorkOrder.current_location == "SMT PRODUCTION"
    ).count()
    
    total_incomplete = session.query(WorkOrder).filter(
        and_(
            WorkOrder.current_location == "SMT PRODUCTION",
            WorkOrder.is_complete == False
        )
    ).count()
    
    total_unlocked = session.query(WorkOrder).filter(
        and_(
            WorkOrder.current_location == "SMT PRODUCTION",
            WorkOrder.is_complete == False,
            WorkOrder.is_locked == False
        )
    ).count()
    
    total_auto_schedulable = session.query(WorkOrder).filter(
        and_(
            WorkOrder.current_location == "SMT PRODUCTION",
            WorkOrder.is_complete == False,
            WorkOrder.is_locked == False,
            WorkOrder.is_manual_schedule == False
        )
    ).count()
    
    print(f"🔍 Job filtering breakdown:")
    print(f"   Total in SMT PRODUCTION: {total_in_smt}")
    print(f"   Not complete: {total_incomplete}")
    print(f"   Not locked: {total_unlocked}")
    print(f"   Not manual schedule: {total_auto_schedulable}")
    
    unscheduled = session.query(WorkOrder).filter(
        and_(
            WorkOrder.current_location == "SMT PRODUCTION",
            WorkOrder.is_complete == False,
            WorkOrder.is_locked == False,
            WorkOrder.is_manual_schedule == False,
            WorkOrder.line_id.is_(None)  # Only get unscheduled jobs
        )
    ).all()
    
    print(f"   Unscheduled (line_id IS NULL): {len(unscheduled)}")
    
    return unscheduled


def get_line_current_load(session: Session, line_id: int) -> Dict:
    """Calculate current workload on a line."""
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
    
    # Get highest position used
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


def simple_auto_schedule(
    session: Session,
    dry_run: bool = False,
    clear_existing: bool = False
) -> Dict:
    """
    Simple, reliable auto-scheduler.
    
    Strategy:
    1. Get all schedulable jobs
    2. Sort by minimum start date (earliest first)
    3. For each job, find the line with the earliest available slot
    4. Keep line completion dates balanced
    
    Args:
        session: Database session
        dry_run: If True, return proposed changes without saving
        clear_existing: If True, clear all existing schedules before redistributing
    
    Returns:
        dict with scheduling results and statistics
    """
    print(f"🚀 Starting SIMPLE scheduler (dry_run={dry_run}, clear_existing={clear_existing})")
    
    # Step 1: Get schedulable jobs
    jobs = get_schedulable_jobs(session)
    print(f"📋 Found {len(jobs)} unscheduled jobs in SMT PRODUCTION")
    
    if not jobs:
        return {
            'jobs_scheduled': 0,
            'jobs_at_risk': [],
            'jobs_will_be_late': [],
            'line_assignments': {},
            'trolley_utilization': {},
            'changes': []
        }
    
    # Step 2: Get lines
    general_lines = session.query(SMTLine).filter(
        and_(
            SMTLine.is_active == True,
            SMTLine.is_manual_only == False
        )
    ).order_by(SMTLine.id).all()
    
    mci_line = session.query(SMTLine).filter(
        and_(
            SMTLine.is_active == True,
            SMTLine.name.ilike("%MCI%")
        )
    ).first()
    
    # Step 3: Clear existing schedules if requested
    if clear_existing and not dry_run:
        print("🧹 Clearing existing schedules...")
        all_scheduled_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.current_location == "SMT PRODUCTION",
                WorkOrder.is_complete == False,
                WorkOrder.is_locked == False,
                WorkOrder.is_manual_schedule == False,
                WorkOrder.line_id.isnot(None)
            )
        ).all()
        
        for job in all_scheduled_jobs:
            job.line_id = None
            job.line_position = None
            job.calculated_start_datetime = None
            job.calculated_end_datetime = None
        
        jobs.extend(all_scheduled_jobs)
        print(f"📦 Cleared {len(all_scheduled_jobs)} existing jobs for redistribution")
        print(f"📋 Total jobs before dedup: {len(jobs)} (unscheduled + cleared)")
    
    # Step 3.5: Deduplicate jobs by ID to prevent double-scheduling
    seen_ids = set()
    unique_jobs = []
    for job in jobs:
        if job.id not in seen_ids:
            seen_ids.add(job.id)
            unique_jobs.append(job)
    jobs = unique_jobs
    print(f"📋 After deduplication: {len(jobs)} unique jobs to schedule")
    
    # Step 4: Sort jobs by priority, then minimum start date (simple and reliable)
    def sort_key(job):
        # Get priority rank (lower number = higher priority)
        priority_rank = job.get_priority_rank()
        # Use min_start_date if available, otherwise cetec_ship_date, otherwise today
        min_start = job.min_start_date or job.cetec_ship_date or date.today()
        return (priority_rank, min_start)
    
    sorted_jobs = sorted(jobs, key=sort_key)
    print(f"📅 Sorted {len(sorted_jobs)} jobs by priority, then minimum start date")
    
    # Step 5: Initialize line tracking
    line_tracker = {}
    available_lines = general_lines.copy()
    
    # Add MCI line if it can accept non-MCI jobs
    if mci_line:
        unscheduled_mci_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.customer.ilike("%Midcontinent%"),
                WorkOrder.is_complete == False,
                WorkOrder.is_locked == False,
                WorkOrder.is_manual_schedule == False,
                WorkOrder.line_id.is_(None)
            )
        ).count()
        
        if unscheduled_mci_jobs == 0:
            available_lines.append(mci_line)
            print(f"✅ Line 4 available for any customer")
        else:
            print(f"🔒 Line 4 MCI-only ({unscheduled_mci_jobs} MCI jobs remaining)")
    
    # Initialize line tracker with current loads
    for line in available_lines:
        current_load = get_line_current_load(session, line.id)
        line_tracker[line.id] = {
            'line': line,
            'next_position': current_load['positions_used'] + 1,
            'completion_date': current_load['completion_date'],
            'job_count': current_load['job_count'],
            'trolleys_in_p1_p2': current_load['trolleys_in_p1_p2']
        }
        print(f"📊 Line {line.id} ({line.name}): {current_load['job_count']} jobs, next position: {line_tracker[line.id]['next_position']}")
    
    # Step 6: Assign jobs using simple logic
    changes = []
    
    for job in sorted_jobs:
        old_line_id = job.line_id
        old_position = job.line_position
        
        priority_rank = job.get_priority_rank()
        min_start = job.min_start_date or job.cetec_ship_date or date.today()
        print(f"🔍 Assigning job {job.wo_number} (priority: {priority_rank}, min start: {min_start})")
        
        # Find best line for this job
        best_line_id = None
        best_position = None
        earliest_available = None
        
        # For MCI jobs, try MCI line first
        if job.is_mci_job() and mci_line and mci_line.id in line_tracker:
            line_id = mci_line.id
            tracker = line_tracker[line_id]
            
            # Check if line has capacity during scheduling period
            if tracker['completion_date'] >= date.today():
                job_start_date = tracker['completion_date']
                job_duration_days = max(1, math.ceil((job.time_minutes or 0) / 60 / 8))
                
                has_capacity = True
                for day_offset in range(job_duration_days):
                    check_date = job_start_date + timedelta(days=day_offset)
                    day_capacity = get_capacity_for_date(session, line_id, check_date, 8.0)
                    if day_capacity == 0:
                        has_capacity = False
                        break
                
                if has_capacity:
                    best_line_id = line_id
                    best_position = tracker['next_position']
                    earliest_available = tracker['completion_date']
                    print(f"✅ MCI job assigned to Line {line_id}")
        
        # If not MCI line or MCI line unavailable, find earliest available slot
        if best_line_id is None:
            for line_id, tracker in line_tracker.items():
                # Skip MCI line for non-MCI jobs if it's MCI-only
                if (mci_line and line_id == mci_line.id and 
                    not job.is_mci_job() and 
                    unscheduled_mci_jobs > 0):
                    continue
                
                # Check trolley constraint for positions 1-2
                if tracker['next_position'] <= 2:
                    if tracker['trolleys_in_p1_p2'] + (job.trolley_count or 0) > 24:
                        continue
                
                # Check line capacity
                if tracker['completion_date'] >= date.today():
                    job_start_date = tracker['completion_date']
                    job_duration_days = max(1, math.ceil((job.time_minutes or 0) / 60 / 8))
                    
                    has_capacity = True
                    for day_offset in range(job_duration_days):
                        check_date = job_start_date + timedelta(days=day_offset)
                        day_capacity = get_capacity_for_date(session, line_id, check_date, 8.0)
                        if day_capacity == 0:
                            has_capacity = False
                            break
                    
                    if has_capacity:
                        if earliest_available is None or tracker['completion_date'] < earliest_available:
                            best_line_id = line_id
                            best_position = tracker['next_position']
                            earliest_available = tracker['completion_date']
        
        # Assign job
        if best_line_id is not None:
            print(f"✅ Job {job.wo_number} → Line {best_line_id}, position {best_position}")
            
            if not dry_run:
                job.line_id = best_line_id
                job.line_position = best_position
            
            # Track changes
            if old_line_id != best_line_id or old_position != best_position:
                changes.append({
                    'wo_number': job.wo_number,
                    'old_line_id': old_line_id,
                    'new_line_id': best_line_id,
                    'old_position': old_position,
                    'new_position': best_position
                })
            
            # Update line tracker
            tracker = line_tracker[best_line_id]
            tracker['next_position'] += 1
            tracker['job_count'] += 1
            
            # Update trolley count for positions 1-2
            if best_position <= 2:
                tracker['trolleys_in_p1_p2'] += (job.trolley_count or 0)
            
            # Estimate new completion date
            job_time_hours = ((job.time_minutes or 0) + ((job.setup_time_hours or 0) * 60)) / 60
            line = tracker['line']
            if line.name == "1-EURO 264":
                job_time_hours *= 2.0
            days_to_add = job_time_hours / 8
            tracker['completion_date'] = add_business_days(tracker['completion_date'], days_to_add)
        else:
            print(f"❌ No available line for job {job.wo_number}")
    
    # Step 7: Calculate actual scheduled dates
    all_lines = general_lines + ([mci_line] if mci_line else [])
    
    for line in all_lines:
        job_dates = calculate_job_dates(session, line.id)
        for wo_id, dates in job_dates.items():
            job = session.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
            if job and not dry_run:
                job.scheduled_start_date = dates['start_date']
                job.scheduled_end_date = dates['end_date']
                job.promise_date_variance_days = job.calculate_promise_date_variance()
    
    # Step 8: Update variance for all scheduled jobs
    if not dry_run:
        all_scheduled_jobs = session.query(WorkOrder).filter(
            and_(
                WorkOrder.is_complete == False,
                WorkOrder.scheduled_end_date.isnot(None)
            )
        ).all()
        
        for job in all_scheduled_jobs:
            job.promise_date_variance_days = job.calculate_promise_date_variance()
    
    # Step 9: Analyze results
    jobs_at_risk = []
    jobs_will_be_late = []
    
    for job in jobs:
        if job.scheduled_end_date and job.cetec_ship_date:
            variance = (job.scheduled_end_date - job.cetec_ship_date).days
            if variance > 7:
                jobs_will_be_late.append({
                    'wo_number': job.wo_number,
                    'promise_date': job.cetec_ship_date.isoformat(),
                    'scheduled_date': job.scheduled_end_date.isoformat(),
                    'variance_days': variance
                })
            elif variance > 0:
                jobs_at_risk.append({
                    'wo_number': job.wo_number,
                    'promise_date': job.cetec_ship_date.isoformat(),
                    'scheduled_date': job.scheduled_end_date.isoformat(),
                    'variance_days': variance
                })
    
    # Step 10: Generate summary
    line_assignments = {}
    trolley_utilization = {}
    
    for line in all_lines:
        load = get_line_current_load(session, line.id)
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
    
    print(f"✅ Simple scheduler complete: {len(changes)} changes made")
    
    return {
        'jobs_scheduled': len(jobs),
        'jobs_at_risk': jobs_at_risk,
        'jobs_will_be_late': jobs_will_be_late,
        'line_assignments': line_assignments,
        'trolley_utilization': trolley_utilization,
        'changes': changes
    }
