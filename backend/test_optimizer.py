"""
Test script for the auto-scheduler optimizer.

This script tests all major optimizer functions with various scenarios:
- Basic scheduling
- MCI routing
- Trolley constraints
- Locked jobs
- Different optimization modes
- Edge cases

Run: python3 test_optimizer.py
"""

import sys
from datetime import date, timedelta
from database import SessionLocal
from models import WorkOrder, SMTLine, Status, Priority, SideType, THKitStatus
from optimizer import (
    get_schedulable_jobs,
    calculate_earliest_completion_dates,
    optimize_for_throughput,
    get_capacity_forecast,
    get_mci_line,
    get_general_lines,
    get_line_current_load
)

# ANSI color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'


def print_test(name):
    """Print test name"""
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}TEST: {name}{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}")


def print_pass(message):
    """Print success message"""
    print(f"{GREEN}✓ PASS: {message}{RESET}")


def print_fail(message):
    """Print failure message"""
    print(f"{RED}✗ FAIL: {message}{RESET}")


def print_info(message):
    """Print info message"""
    print(f"{YELLOW}ℹ INFO: {message}{RESET}")


def setup_test_data(session):
    """Create test work orders for testing"""
    print_test("Setting Up Test Data")
    
    # Get or create Unassigned status
    unassigned_status = session.query(Status).filter(Status.name == "Unassigned").first()
    if not unassigned_status:
        unassigned_status = Status(name="Unassigned", color="#6c757d", is_active=True)
        session.add(unassigned_status)
        session.commit()
    
    # Clear existing test work orders
    session.query(WorkOrder).filter(WorkOrder.wo_number.like('TEST-%')).delete()
    session.commit()
    
    today = date.today()
    
    # Test Case 1: Regular job (should go to Lines 1-3)
    wo1 = WorkOrder(
        customer="Boeing",
        assembly="TEST-ASSY-001",
        revision="A",
        wo_number="TEST-001",
        quantity=100,
        status_id=unassigned_status.id,
        priority=Priority.FACTORY_DEFAULT,
        cetec_ship_date=today + timedelta(days=7),
        time_minutes=240,  # 4 hours
        setup_time_hours=1.0,
        trolley_count=4,
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=False,
        is_complete=False
    )
    session.add(wo1)
    
    # Test Case 2: MCI job (should go to Line 4)
    wo2 = WorkOrder(
        customer="MIDCONTINENT INSTRUMENTS",
        assembly="MCI-ASSY-001",
        revision="B",
        wo_number="TEST-MCI-001",
        quantity=50,
        status_id=unassigned_status.id,
        priority=Priority.FACTORY_DEFAULT,
        cetec_ship_date=today + timedelta(days=10),
        time_minutes=180,  # 3 hours
        setup_time_hours=1.0,
        trolley_count=2,
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=False,
        is_complete=False
    )
    session.add(wo2)
    
    # Test Case 3: Critical Mass priority (should be position 1)
    wo3 = WorkOrder(
        customer="Lockheed",
        assembly="TEST-ASSY-002",
        revision="A",
        wo_number="TEST-002",
        quantity=75,
        status_id=unassigned_status.id,
        priority=Priority.CRITICAL_MASS,
        cetec_ship_date=today + timedelta(days=3),
        time_minutes=120,  # 2 hours
        setup_time_hours=1.0,
        trolley_count=3,
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=False,
        is_complete=False
    )
    session.add(wo3)
    
    # Test Case 4: Locked job (should NOT be moved)
    wo4 = WorkOrder(
        customer="Raytheon",
        assembly="TEST-ASSY-003",
        revision="C",
        wo_number="TEST-LOCKED-001",
        quantity=200,
        status_id=unassigned_status.id,
        priority=Priority.FACTORY_DEFAULT,
        cetec_ship_date=today + timedelta(days=14),
        time_minutes=360,  # 6 hours
        setup_time_hours=1.0,
        trolley_count=6,
        sides=SideType.DOUBLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=True,  # LOCKED
        is_complete=False,
        line_id=2,  # Already on Line 2
        line_position=1
    )
    session.add(wo4)
    
    # Test Case 5: High trolley count (test constraint)
    wo5 = WorkOrder(
        customer="Northrop Grumman",
        assembly="TEST-ASSY-004",
        revision="A",
        wo_number="TEST-003",
        quantity=150,
        status_id=unassigned_status.id,
        priority=Priority.FACTORY_DEFAULT,
        cetec_ship_date=today + timedelta(days=5),
        time_minutes=300,  # 5 hours
        setup_time_hours=2.0,
        trolley_count=10,  # High trolley count
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=False,
        is_complete=False
    )
    session.add(wo5)
    
    # Test Case 6: Not in SMT PRODUCTION (should be ignored)
    wo6 = WorkOrder(
        customer="General Dynamics",
        assembly="TEST-ASSY-005",
        revision="B",
        wo_number="TEST-IGNORED-001",
        quantity=80,
        status_id=unassigned_status.id,
        priority=Priority.FACTORY_DEFAULT,
        cetec_ship_date=today + timedelta(days=8),
        time_minutes=240,
        setup_time_hours=1.0,
        trolley_count=4,
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="KIT SHORT SHELF",  # NOT in SMT PRODUCTION
        is_locked=False,
        is_complete=False
    )
    session.add(wo6)
    
    # Test Case 7: Another MCI job
    wo7 = WorkOrder(
        customer="MCI Aviation",
        assembly="MCI-ASSY-002",
        revision="A",
        wo_number="TEST-MCI-002",
        quantity=30,
        status_id=unassigned_status.id,
        priority=Priority.OVERCLOCKED,
        cetec_ship_date=today + timedelta(days=4),
        time_minutes=150,
        setup_time_hours=1.0,
        trolley_count=3,
        sides=SideType.SINGLE,
        th_kit_status=THKitStatus.NA,
        current_location="SMT PRODUCTION",
        is_locked=False,
        is_complete=False
    )
    session.add(wo7)
    
    session.commit()
    print_pass(f"Created 7 test work orders")
    return [wo1, wo2, wo3, wo4, wo5, wo6, wo7]


def test_get_schedulable_jobs(session):
    """Test that get_schedulable_jobs filters correctly"""
    print_test("Test get_schedulable_jobs()")
    
    schedulable = get_schedulable_jobs(session)
    
    # Should return 5 jobs (excludes locked and non-SMT PRODUCTION)
    expected_count = 5
    actual_count = len(schedulable)
    
    if actual_count == expected_count:
        print_pass(f"Found {actual_count} schedulable jobs (expected {expected_count})")
    else:
        print_fail(f"Found {actual_count} schedulable jobs (expected {expected_count})")
        return False
    
    # Verify locked job is NOT in list
    locked_numbers = [j.wo_number for j in schedulable if j.is_locked]
    if len(locked_numbers) == 0:
        print_pass("Locked jobs correctly excluded")
    else:
        print_fail(f"Locked jobs found in schedulable list: {locked_numbers}")
        return False
    
    # Verify non-SMT PRODUCTION job is NOT in list
    non_smt = [j.wo_number for j in schedulable if j.current_location != 'SMT PRODUCTION']
    if len(non_smt) == 0:
        print_pass("Non-SMT PRODUCTION jobs correctly excluded")
    else:
        print_fail(f"Non-SMT PRODUCTION jobs found: {non_smt}")
        return False
    
    return True


def test_mci_routing(session):
    """Test that MCI jobs are identified correctly"""
    print_test("Test MCI Job Detection")
    
    mci_line = get_mci_line(session)
    if not mci_line:
        print_fail("MCI line not found in database")
        return False
    
    print_pass(f"Found MCI line: {mci_line.name} (ID: {mci_line.id})")
    
    # Check test MCI jobs
    mci_jobs = session.query(WorkOrder).filter(
        WorkOrder.wo_number.like('TEST-MCI-%')
    ).all()
    
    for job in mci_jobs:
        is_mci = job.is_mci_job()
        if is_mci:
            print_pass(f"{job.wo_number} ({job.customer}) correctly identified as MCI job")
        else:
            print_fail(f"{job.wo_number} ({job.customer}) NOT identified as MCI job")
            return False
    
    return True


def test_earliest_completion_dates(session):
    """Test earliest completion date calculation"""
    print_test("Test calculate_earliest_completion_dates()")
    
    schedulable = get_schedulable_jobs(session)
    calculate_earliest_completion_dates(session, schedulable)
    
    # Verify all jobs have earliest_completion_date set
    for job in schedulable:
        if job.earliest_completion_date:
            days_until = (job.earliest_completion_date - date.today()).days
            print_pass(f"{job.wo_number}: earliest completion in {days_until} days")
        else:
            print_fail(f"{job.wo_number}: earliest_completion_date not calculated")
            return False
    
    return True


def test_balanced_optimization(session):
    """Test balanced optimization mode"""
    print_test("Test optimize_for_throughput(mode='balanced')")
    
    result = optimize_for_throughput(session, mode='balanced', dry_run=False)
    
    print_info(f"Jobs scheduled: {result['jobs_scheduled']}")
    print_info(f"Jobs at risk: {len(result['jobs_at_risk'])}")
    print_info(f"Jobs will be late: {len(result['jobs_will_be_late'])}")
    
    # Verify jobs were scheduled
    if result['jobs_scheduled'] > 0:
        print_pass(f"Successfully scheduled {result['jobs_scheduled']} jobs")
    else:
        print_fail("No jobs were scheduled")
        return False
    
    # Check line assignments
    print_info("\nLine Assignments:")
    for line_name, load in result['line_assignments'].items():
        print_info(f"  {line_name}: {load['job_count']} jobs, {load['total_hours']} hours")
    
    # Check trolley utilization
    print_info("\nTrolley Utilization:")
    for line_name, util in result['trolley_utilization'].items():
        status = "✓" if not util['exceeds_limit'] else "✗ OVER LIMIT"
        print_info(f"  {line_name}: {util['positions_1_2']}/24 trolleys {status}")
        
        if util['exceeds_limit']:
            print_fail(f"{line_name} exceeds trolley limit!")
            return False
    
    print_pass("All trolley constraints satisfied")
    
    # Verify MCI jobs went to MCI line
    mci_line = get_mci_line(session)
    mci_jobs_on_mci_line = session.query(WorkOrder).filter(
        WorkOrder.wo_number.like('TEST-MCI-%'),
        WorkOrder.line_id == mci_line.id
    ).count()
    
    total_mci_jobs = session.query(WorkOrder).filter(
        WorkOrder.wo_number.like('TEST-MCI-%'),
        WorkOrder.current_location == 'SMT PRODUCTION'
    ).count()
    
    if mci_jobs_on_mci_line == total_mci_jobs:
        print_pass(f"All {total_mci_jobs} MCI jobs correctly routed to Line 4")
    else:
        print_fail(f"Only {mci_jobs_on_mci_line}/{total_mci_jobs} MCI jobs on Line 4")
        return False
    
    # Verify locked job wasn't moved
    locked_job = session.query(WorkOrder).filter(
        WorkOrder.wo_number == 'TEST-LOCKED-001'
    ).first()
    
    if locked_job.line_id == 2 and locked_job.line_position == 1:
        print_pass("Locked job correctly preserved at Line 2, Position 1")
    else:
        print_fail(f"Locked job moved to Line {locked_job.line_id}, Position {locked_job.line_position}")
        return False
    
    # Verify Critical Mass job is in position 1
    critical_job = session.query(WorkOrder).filter(
        WorkOrder.wo_number == 'TEST-002',
        WorkOrder.priority == Priority.CRITICAL_MASS
    ).first()
    
    if critical_job.line_position == 1:
        print_pass(f"Critical Mass job correctly at position 1 on Line {critical_job.line_id}")
    else:
        print_fail(f"Critical Mass job at position {critical_job.line_position} (expected 1)")
        return False
    
    # Verify all scheduled jobs have variance calculated
    scheduled_jobs = session.query(WorkOrder).filter(
        WorkOrder.wo_number.like('TEST-%'),
        WorkOrder.scheduled_end_date.isnot(None)
    ).all()
    
    missing_variance = [j.wo_number for j in scheduled_jobs if j.promise_date_variance_days is None]
    
    if len(missing_variance) == 0:
        print_pass(f"All {len(scheduled_jobs)} scheduled jobs have variance calculated")
    else:
        print_fail(f"{len(missing_variance)} jobs missing variance: {missing_variance}")
        return False
    
    return True


def test_capacity_forecast(session):
    """Test capacity forecast generation"""
    print_test("Test get_capacity_forecast()")
    
    forecast = get_capacity_forecast(session, weeks=8)
    
    if 'weeks' not in forecast:
        print_fail("Forecast missing 'weeks' key")
        return False
    
    if len(forecast['weeks']) != 8:
        print_fail(f"Expected 8 weeks, got {len(forecast['weeks'])}")
        return False
    
    print_pass(f"Generated {len(forecast['weeks'])} week forecast")
    
    # Print forecast summary
    print_info("\nCapacity Forecast:")
    for week in forecast['weeks'][:3]:  # Just show first 3 weeks
        print_info(f"  {week['week_label']}: {week['scheduled_hours']}/{week['total_capacity_hours']} hrs, {week['late_job_count']} late jobs")
    
    # Check pipeline
    if 'pipeline' in forecast:
        print_pass(f"Pipeline summary includes {len(forecast['pipeline'])} locations")
        for location, data in forecast['pipeline'].items():
            print_info(f"  {location}: {data['job_count']} jobs ({data['total_hours']:.1f} hrs)")
    
    return True


def test_line_load_calculation(session):
    """Test line load calculation"""
    print_test("Test get_line_current_load()")
    
    general_lines = get_general_lines(session)
    
    for line in general_lines:
        load = get_line_current_load(session, line.id)
        print_info(f"{line.name}:")
        print_info(f"  Jobs: {load['job_count']}")
        print_info(f"  Hours: {load['total_hours']:.1f}")
        print_info(f"  Positions used: {load['positions_used']}")
        print_info(f"  Trolleys (P1+P2): {load['trolleys_in_p1_p2']}")
        
        # Verify trolley count is within limit
        if load['trolleys_in_p1_p2'] <= 24:
            print_pass(f"  Trolley count within limit")
        else:
            print_fail(f"  Trolley count exceeds limit: {load['trolleys_in_p1_p2']}/24")
            return False
    
    return True


def cleanup_test_data(session):
    """Remove test work orders"""
    print_test("Cleaning Up Test Data")
    
    deleted = session.query(WorkOrder).filter(
        WorkOrder.wo_number.like('TEST-%')
    ).delete()
    
    session.commit()
    print_pass(f"Deleted {deleted} test work orders")


def run_all_tests():
    """Run all tests"""
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}SMT AUTO-SCHEDULER TEST SUITE{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}")
    
    session = SessionLocal()
    
    try:
        # Setup
        test_wos = setup_test_data(session)
        
        # Run tests
        tests = [
            ("Get Schedulable Jobs", test_get_schedulable_jobs),
            ("MCI Job Routing", test_mci_routing),
            ("Earliest Completion Dates", test_earliest_completion_dates),
            ("Balanced Optimization", test_balanced_optimization),
            ("Line Load Calculation", test_line_load_calculation),
            ("Capacity Forecast", test_capacity_forecast),
        ]
        
        results = []
        for test_name, test_func in tests:
            try:
                result = test_func(session)
                results.append((test_name, result))
            except Exception as e:
                print_fail(f"Test '{test_name}' raised exception: {e}")
                import traceback
                traceback.print_exc()
                results.append((test_name, False))
        
        # Cleanup
        cleanup_test_data(session)
        
        # Summary
        print(f"\n{BLUE}{'=' * 80}{RESET}")
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print(f"{BLUE}{'=' * 80}{RESET}")
        
        passed = sum(1 for _, result in results if result)
        total = len(results)
        
        for test_name, result in results:
            status = f"{GREEN}PASS{RESET}" if result else f"{RED}FAIL{RESET}"
            print(f"{status}: {test_name}")
        
        print(f"\n{BLUE}Total: {passed}/{total} tests passed{RESET}")
        
        if passed == total:
            print(f"\n{GREEN}{'=' * 80}{RESET}")
            print(f"{GREEN}ALL TESTS PASSED! ✓{RESET}")
            print(f"{GREEN}{'=' * 80}{RESET}")
            return 0
        else:
            print(f"\n{RED}{'=' * 80}{RESET}")
            print(f"{RED}SOME TESTS FAILED! ✗{RESET}")
            print(f"{RED}{'=' * 80}{RESET}")
            return 1
        
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(run_all_tests())

