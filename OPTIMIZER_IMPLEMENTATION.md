# SMT Production Scheduler - Auto-Scheduler Implementation

**Status**: ✅ **Ready for Testing** (Development Branch)  
**Date**: October 8, 2025  
**Branch**: `development`

---

## 🎯 Overview

We've built an **AI-powered auto-scheduler** for SMT production that:
- **Maximizes throughput** (jobs completed per day) as the primary goal
- Tracks promise dates and flags at-risk jobs **without** sacrificing throughput
- Respects trolley constraints (24 max in positions 1+2)
- Reserves Line 4 for MCI jobs only
- Honors locked jobs (manual overrides)
- Supports multi-day jobs that flow naturally across days

---

## 📦 What Was Built

### **Phase 1: Foundation** ✅
**Files Modified:**
- `backend/models.py` - Added helper methods to WorkOrder class:
  - `calculate_promise_date_variance()` - Calculate days early/late
  - `is_at_risk()` - Check if earliest completion > promise date
  - `will_be_late()` - Check if scheduled end > promise date
  - `get_priority_rank()` - Numeric priority for sorting
  - `is_mci_job()` - Detect MCI jobs for Line 4 routing

- `backend/scheduler.py` - Updated setup time calculation:
  - **Linear formula**: 1 hour base + 0.33 hours (20 min) per trolley after 2
  - **Before**: Stepped tiers (1hr, 2hrs, 3hrs, 4hrs)
  - **After**: Granular (e.g., 3 trolleys = 1.33hrs, 5 trolleys = 2.0hrs)

- `backend/schemas.py` - Added optimizer fields to WorkOrderResponse:
  - `earliest_completion_date` - Earliest possible finish (unlimited capacity)
  - `scheduled_start_date` - Optimizer's planned start
  - `scheduled_end_date` - Optimizer's planned completion
  - `promise_date_variance_days` - Days early/late vs Cetec promise

**Database Migration** (already in `seed_data.py`):
```sql
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS earliest_completion_date DATE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_start_date DATE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_end_date DATE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS promise_date_variance_days INTEGER;
```

---

### **Phase 2: Core Optimizer Algorithm** ✅
**New File:** `backend/optimizer.py`

**Key Functions:**

1. **`get_schedulable_jobs(session)`**
   - Filters jobs in 'SMT PRODUCTION' location
   - Excludes completed and locked jobs
   - Returns list ready for optimization

2. **`calculate_earliest_completion_dates(session, jobs)`**
   - Assumes unlimited capacity
   - Calculates theoretical earliest finish date
   - Flags jobs "at risk" of missing promise dates

3. **`optimize_for_throughput(session, mode, dry_run)`**
   - **Main optimizer function**
   - Modes: `balanced` (default), `throughput_max`, `promise_focused`
   - Sorts by priority → promise date
   - Routes MCI jobs to Line 4
   - Distributes other jobs across Lines 1-3
   - Packs positions tightly (no gaps)
   - Enforces 24 trolley limit
   - Returns summary with changes, at-risk jobs, line loads

4. **`get_capacity_forecast(session, weeks)`**
   - Generates 8-week capacity forecast
   - Shows available vs scheduled hours per week
   - Flags late jobs in "CURRENT/NEXT" bucket
   - Includes pipeline (non-SMT PRODUCTION) summary

**Optimization Strategy:**
```
Priority Handling:
1. Critical Mass → Position 1 (immediate)
2. Overclocked → Positions 2-3 (high priority)
3. Factory Default → Optimize for throughput
4. Trickle Charge → Lower priority
5. Power Down → Lowest priority

Line Assignment:
- MCI jobs → Line 4 (reserved)
- Other jobs → Lines 1-3 (pick earliest completion)
- Balance load across lines
- Respect trolley constraints
```

---

### **Phase 3: API Endpoints** ✅
**File Modified:** `backend/main.py`

**New Endpoints:**

1. **`POST /api/auto-schedule`**
   - Parameters:
     - `mode`: Optimization mode (balanced/throughput_max/promise_focused)
     - `dry_run`: If true, preview without saving
   - Returns:
     - `jobs_scheduled`: Total jobs processed
     - `jobs_at_risk`: Jobs that might miss promise dates
     - `jobs_will_be_late`: Jobs currently scheduled to be late
     - `line_assignments`: Distribution across lines
     - `trolley_utilization`: Trolley counts per line
     - `changes`: List of proposed changes (if dry_run)

2. **`GET /api/schedule-analysis`**
   - Returns current schedule statistics:
     - Promise date hit rate (%)
     - Jobs at risk count
     - Average variance (days early/late)
     - Trolley utilization per line
     - Line loads (job count, hours, completion date)

3. **`GET /api/capacity-forecast?weeks=8`**
   - Returns 8-week capacity forecast
   - Week buckets with:
     - Total capacity hours
     - Scheduled hours
     - Available hours
     - Late job count and details
   - Pipeline summary (work not yet in SMT PRODUCTION)

---

### **Phase 4: Frontend UI** ✅
**Files Modified/Created:**

**1. `frontend/src/components/AutoScheduleModal.jsx` (NEW)**
   - **Mode Selection**: Balanced, Maximum Throughput, Promise Focused
   - **Preview Mode**: Dry run shows proposed changes before applying
   - **Summary Cards**: Jobs scheduled, at risk, will be late
   - **Line Distribution**: Visual breakdown per line
   - **Trolley Utilization**: Color-coded (green = OK, red = over limit)
   - **Late Jobs List**: Table showing jobs missing promise dates
   - **Changes Preview**: Shows all proposed job movements

**2. `frontend/src/pages/Schedule.jsx`**
   - **Auto-Schedule Button**: Green button with lightning bolt icon (⚡)
   - **Promise Date Variance Column**: Color-coded badges
     - 🔴 Red: Late (+days)
     - 🟡 Yellow: On-time or slightly early (0 to -7 days)
     - 🟢 Green: Well ahead (< -7 days)
   - **Renamed "Ship" to "Promise"**: Clearer terminology
   - **Sortable Variance Column**: Click to sort by days early/late

**Visual Design:**
```
Schedule Table Columns (updated):
# | Cust | Assy | WO# | Qty | Stat | Mat | Loc | Pri | Line | Min Start | Promise | Var | Hrs | Trl | TH | Actions

New "Var" column shows:
  +5d (red badge)    = 5 days late
  -3d (yellow badge) = 3 days early
  -10d (green badge) = 10 days early
```

---

## 🚀 How to Use

### **For Schedulers:**

1. **Open Schedule Page** (`/schedule`)
2. **Click "Auto-Schedule" button** (green, top-right)
3. **Select Mode:**
   - **Balanced** (recommended): Even distribution, maximize throughput
   - **Maximum Throughput**: Pure speed, may have uneven loading
   - **Promise Focused**: Slight bias toward hitting dates
4. **Click "👁️ Preview Schedule"**
   - Review proposed changes
   - Check trolley utilization
   - See which jobs will be late
5. **Click "✅ Apply Schedule"** to execute
   - Locked jobs stay in place
   - Unlocked jobs move to optimized positions
   - Page refreshes automatically

### **Manual Overrides:**
- **Lock Icon**: Click to lock a job in its current position
- **Drag & Drop**: Manually reorder jobs on a line (filter to single line first)
- **Edit Job**: Change priority, trolley count, etc.

---

## 📊 Understanding the Metrics

### **Promise Date Variance**
- **Negative** = Job will finish EARLY (good!)
- **Positive** = Job will finish LATE (bad!)
- **Example**: 
  - `-7d` = Job finishes 7 days before promise date
  - `+2d` = Job finishes 2 days after promise date

### **At Risk vs Will Be Late**
- **At Risk**: `earliest_completion_date > promise_date`
  - Job *might* miss promise date even with perfect conditions
  - Flag to consider priority bump or overtime
- **Will Be Late**: `scheduled_end_date > promise_date`
  - Job *will* miss promise date with current schedule
  - Needs immediate action

### **Trolley Utilization**
- **Limit**: 24 trolleys max in positions 1+2 per line
- **Green**: Under limit (safe)
- **Red**: Over limit (violates constraint)
- Optimizer automatically prevents overages

---

## 🧪 Testing Checklist

### **Phase 5: Testing (In Progress)**

**Backend Testing:**
- [ ] Test auto-schedule with real production data
- [ ] Verify MCI jobs only go to Line 4
- [ ] Confirm trolley limits are enforced
- [ ] Check locked jobs stay in place
- [ ] Validate earliest completion dates
- [ ] Test all 3 optimization modes

**Frontend Testing:**
- [ ] Auto-schedule modal opens correctly
- [ ] Preview mode shows accurate changes
- [ ] Apply mode saves and refreshes data
- [ ] Promise variance badges display correctly
- [ ] Color coding is intuitive
- [ ] Sortable columns work
- [ ] Error handling displays properly

**Integration Testing:**
- [ ] Cetec import → auto-schedule workflow
- [ ] Manual edits preserved after auto-schedule
- [ ] Multi-day jobs flow correctly
- [ ] Line completion dates update
- [ ] Dashboard stats reflect changes

**Edge Cases:**
- [ ] All jobs are Critical Mass
- [ ] Capacity fully booked (over-subscription)
- [ ] No jobs in SMT PRODUCTION
- [ ] All jobs locked
- [ ] Missing trolley counts (default to 1 hour)
- [ ] Jobs with no promise date

---

## 🔧 Configuration

### **Optimizer Modes**

**Balanced (Default)**:
```python
- Even distribution across Lines 1-3
- Maximize throughput
- Track promise dates
- Best for normal operations
```

**Maximum Throughput**:
```python
- Pure speed optimization
- May have uneven line loading
- Ignores promise dates (except for priority)
- Use when catching up on backlog
```

**Promise Focused**:
```python
- Slight bias toward hitting dates
- May leave small gaps in schedule
- Use when promise date hit rate is critical
```

### **Trolley Constraint**
```python
TROLLEY_LIMIT = 24  # Positions 1+2 combined
```

### **Line Configuration**
```python
Line 1 (1-EURO 264): 2x time multiplier
Lines 2-3: General purpose
Line 4 (MCI): Reserved for MCI customers only
```

---

## 📝 Future Enhancements

**Priority for Next Phase:**
1. **Dashboard Widget**: Capacity forecast with 8-week view
2. **Daily Auto-Schedule**: Cron job to run at 6 AM
3. **Real-Time Re-Optimization**: Auto-adjust when jobs complete
4. **Material Availability Integration**: Only schedule jobs with materials
5. **Qty Tracking from Cetec**: Bidirectional sync for work-in-progress
6. **What-If Analysis**: Compare multiple scenarios side-by-side
7. **Historical Learning**: Improve time estimates based on actual completions

**Long-Term Vision:**
- Predictive intelligence (ML-based time estimates)
- Constraint optimization (add overtime, split shifts)
- Customer-specific rules (e.g., Boeing always priority 1)
- Material shortage prediction

---

## 🐛 Troubleshooting

**Auto-Schedule Returns No Changes:**
- Check if all jobs are locked
- Verify jobs are in "SMT PRODUCTION" location
- Ensure jobs aren't already optimally placed

**Trolley Limit Violations:**
- Red indicators show which lines are over
- Manually lock some jobs to different positions
- Consider splitting large jobs

**Jobs Marked "Will Be Late":**
- Review priority assignments
- Consider adding overtime (capacity overrides)
- Adjust promise dates in Cetec if feasible
- Move lower-priority jobs to later slots

**Modal Doesn't Open:**
- Check browser console for errors
- Verify API endpoints are accessible
- Ensure user is authenticated

---

## 📚 Technical Details

### **Database Schema**
```sql
work_orders Table (new columns):
- earliest_completion_date: DATE  -- Theoretical earliest finish
- scheduled_start_date: DATE      -- Optimizer's planned start
- scheduled_end_date: DATE        -- Optimizer's planned end
- promise_date_variance_days: INT -- Days early(-) or late(+)
```

### **API Response Example**
```json
{
  "jobs_scheduled": 27,
  "jobs_at_risk": [
    {"wo_number": "15323.6-1", "customer": "Internal", "assembly": "BOM123"}
  ],
  "jobs_will_be_late": [
    {"wo_number": "14757.1-1", "customer": "Boeing", "assembly": "SUB789", "variance_days": 2}
  ],
  "line_assignments": {
    "1-EURO 264": {"job_count": 8, "total_hours": 64.5, "completion_date": "2025-10-15"},
    "2-EURO 127": {"job_count": 9, "total_hours": 68.2, "completion_date": "2025-10-14"},
    "3-EURO 588": {"job_count": 7, "total_hours": 52.1, "completion_date": "2025-10-13"},
    "4-EURO 586 MCI": {"job_count": 3, "total_hours": 22.0, "completion_date": "2025-10-12"}
  },
  "trolley_utilization": {
    "1-EURO 264": {"positions_1_2": 18, "limit": 24, "exceeds_limit": false},
    "2-EURO 127": {"positions_1_2": 22, "limit": 24, "exceeds_limit": false},
    "3-EURO 588": {"positions_1_2": 16, "limit": 24, "exceeds_limit": false},
    "4-EURO 586 MCI": {"positions_1_2": 8, "limit": 24, "exceeds_limit": false}
  },
  "changes": [
    {"wo_number": "15394.1-1", "old_line_id": null, "new_line_id": 2, "old_position": null, "new_position": 5}
  ]
}
```

---

## ✅ Deployment Checklist

**Before Merging to Main:**
- [ ] Complete Phase 5 testing
- [ ] Fix any identified bugs
- [ ] Update user documentation
- [ ] Train schedulers on new workflow
- [ ] Create backup of production database
- [ ] Test rollback procedure
- [ ] Monitor first auto-schedule in production
- [ ] Gather user feedback

**Post-Deployment:**
- [ ] Monitor promise date hit rate
- [ ] Track throughput improvements
- [ ] Collect scheduler feedback
- [ ] Document lessons learned
- [ ] Plan Phase 2 features

---

## 🎉 Success Metrics

**Goals:**
- **Throughput**: Increase jobs/day by 15-20%
- **Promise Date Hit Rate**: Maintain or improve current rate
- **Scheduler Time**: Reduce manual scheduling time by 50%
- **Visibility**: Real-time view of at-risk jobs
- **Flexibility**: Easy overrides for special cases

**Measurements:**
- Track `promise_date_variance_days` over time
- Monitor trolley utilization efficiency
- Compare manual vs auto-schedule outcomes
- Survey scheduler satisfaction

---

**Built by**: AI Assistant  
**For**: SMT Production Scheduler  
**Branch**: `development`  
**Ready for**: User testing and feedback

