# Optimizer Test Suite

## Overview

`test_optimizer.py` is a comprehensive test script that validates all auto-scheduler functions.

## What It Tests

1. **Get Schedulable Jobs** - Filters jobs correctly (excludes locked, non-SMT PRODUCTION)
2. **MCI Job Routing** - MCI jobs identified and routed to Line 4
3. **Earliest Completion Dates** - Calculation works for all jobs
4. **Balanced Optimization** - Full auto-schedule with all constraints
   - Trolley limits (max 24 in positions 1+2)
   - Priority ordering (Critical Mass first)
   - Locked jobs preserved
   - Variance calculated for all jobs
5. **Line Load Calculation** - Current load calculation is accurate
6. **Capacity Forecast** - 8-week forecast generation works

## Test Scenarios

The script creates 7 test work orders:
- **TEST-001**: Regular Boeing job (should go to Lines 1-3)
- **TEST-MCI-001**: MCI job (should go to Line 4)
- **TEST-002**: Critical Mass priority (should be position 1)
- **TEST-LOCKED-001**: Locked job (should NOT move)
- **TEST-003**: High trolley count (tests constraints)
- **TEST-IGNORED-001**: Not in SMT PRODUCTION (should be ignored)
- **TEST-MCI-002**: Another MCI job (should go to Line 4)

## Running the Tests

### Option 1: On Railway (Recommended)

Since your database is on Railway, the easiest way is to run the test there:

1. **Add test file to Railway** (already done - it's in the repo)

2. **SSH into Railway container**:
   ```bash
   railway run python3 test_optimizer.py
   ```

3. **Or add as a one-time job** in Railway dashboard

### Option 2: Locally (Requires local database)

If you have a local PostgreSQL database:

1. **Set environment variable**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost/smt_scheduler"
   ```

2. **Run test**:
   ```bash
   python3 test_optimizer.py
   ```

### Option 3: Quick Manual Test (Easiest!)

Instead of running the automated test, you can manually verify:

1. ✅ **Go to Schedule page**
2. ✅ **Click "Auto-Schedule"**
3. ✅ **Click "Preview"**
4. ✅ **Check the results match expected behavior:**
   - MCI jobs on Line 4
   - Critical Mass jobs in position 1
   - Trolley counts ≤ 24 in positions 1+2
   - Locked jobs don't move
   - All scheduled jobs have variance

## Expected Output

When all tests pass, you'll see:

```
================================================================================
TEST SUMMARY
================================================================================
PASS: Get Schedulable Jobs
PASS: MCI Job Routing
PASS: Earliest Completion Dates
PASS: Balanced Optimization
PASS: Line Load Calculation
PASS: Capacity Forecast

Total: 6/6 tests passed

================================================================================
ALL TESTS PASSED! ✓
================================================================================
```

## What Each Test Validates

### Get Schedulable Jobs
- ✓ Returns correct count (5 jobs)
- ✓ Excludes locked jobs
- ✓ Excludes non-SMT PRODUCTION jobs

### MCI Job Routing
- ✓ MCI line exists in database
- ✓ `is_mci_job()` correctly identifies MCI customers
- ✓ Both "MIDCONTINENT INSTRUMENTS" and "MCI Aviation" detected

### Earliest Completion Dates
- ✓ All schedulable jobs get `earliest_completion_date` calculated
- ✓ Dates are reasonable (accounts for time, setup, weekends)

### Balanced Optimization
- ✓ All 5 schedulable jobs get scheduled
- ✓ MCI jobs routed to Line 4 (both TEST-MCI-001 and TEST-MCI-002)
- ✓ Critical Mass job (TEST-002) in position 1
- ✓ Locked job (TEST-LOCKED-001) stays at Line 2, Position 1
- ✓ No line exceeds 24 trolley limit
- ✓ All scheduled jobs have `promise_date_variance_days` calculated

### Line Load Calculation
- ✓ Job counts accurate
- ✓ Hours calculation correct
- ✓ Trolley counts within limits
- ✓ Completion dates calculated

### Capacity Forecast
- ✓ Generates 8-week forecast
- ✓ Includes scheduled vs available hours
- ✓ Shows late job counts
- ✓ Includes pipeline summary

## Cleaning Up

The test automatically cleans up after itself:
- All test work orders (TEST-*) are deleted at the end
- Your real work orders are untouched
- Database returns to pre-test state

## Troubleshooting

**Error: "DATABASE_URL field required"**
- You need to set the DATABASE_URL environment variable
- Or run the test on Railway where it's already set

**Error: "max() arg is an empty sequence"**
- This was fixed in the latest optimizer.py update
- Make sure Railway has deployed the latest code

**Test fails: "MCI jobs not on Line 4"**
- Check that Line 4 exists and has `is_special_customer=True`
- Verify `special_customer_name="MCI"`

**Test fails: "Trolley limit exceeded"**
- This indicates a bug in the optimizer logic
- Check `get_line_current_load()` trolley counting
- Verify `find_best_line_for_job()` constraint checking

## Manual Verification Checklist

If you can't run the automated test, manually verify:

- [ ] Import jobs from Cetec
- [ ] Lock one job manually
- [ ] Click "Auto-Schedule" → "Preview"
- [ ] Check: MCI jobs show Line 4 in preview
- [ ] Check: Locked job not in "Changes" list
- [ ] Check: Trolley utilization all green (≤24)
- [ ] Click "Apply Schedule"
- [ ] Refresh page
- [ ] Check: All scheduled jobs show variance badges
- [ ] Check: MCI jobs actually on Line 4
- [ ] Check: Locked job didn't move

---

**Test Created**: Oct 8, 2025  
**Test Coverage**: 6 major functions, 7 test scenarios  
**Auto-cleanup**: Yes (all TEST-* work orders deleted)

