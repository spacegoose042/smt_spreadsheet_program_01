# Hand Build Line - Manual Scheduling Only

## Overview

Line 5 "Hand Build" is now configured to be **completely excluded from auto-scheduling**. This line is for manual assembly of small jobs and special cases.

---

## How It Works

### **Database Configuration**
- **Line Name**: "Hand Build"
- **Order Position**: 5
- **Flag**: `is_manual_only = TRUE`

### **Auto-Scheduler Behavior**
When you click "Auto-Schedule":
- ✅ Lines 1-3: Available for general auto-scheduling
- ✅ Line 4 (MCI): Reserved for MCI customers only
- ✅ **Line 5 (Hand Build): COMPLETELY SKIPPED**

Jobs on the Hand Build line will:
- ❌ **Never be moved** by auto-scheduler
- ❌ **Never have new jobs assigned** to them by auto-scheduler
- ✅ **Only get jobs when you manually add them**

---

## Usage

### **Adding Jobs to Hand Build Line**

**Method 1: Drag & Drop**
1. Filter to show Hand Build line
2. Drag a job from another line to Hand Build
3. Position it manually

**Method 2: Edit Job**
1. Click edit on any job
2. Set Line = "Hand Build"
3. Set Position manually
4. Save

**Method 3: Create New Job**
1. Click "Add Work Order"
2. Fill in details
3. Select Line = "Hand Build"
4. Set Position manually
5. Create

### **What You Can Do**
- ✅ Manually add jobs anytime
- ✅ Manually reorder jobs
- ✅ Lock/unlock jobs (same as other lines)
- ✅ See capacity and completion dates
- ✅ Run auto-scheduler without affecting Hand Build jobs

---

## Key Differences

### **Line 4 (MCI) vs Line 5 (Hand Build)**

| Feature | Line 4 (MCI) | Line 5 (Hand Build) |
|---------|-------------|---------------------|
| Auto-scheduler | ✅ Assigns MCI jobs automatically | ❌ Never assigns jobs |
| Purpose | Dedicated customer (MCI only) | Manual small jobs |
| Job Criteria | `customer contains "MCI"` | None (manual only) |
| Can manually add jobs? | ✅ Yes | ✅ Yes |

---

## Technical Details

### **Database Schema**
```sql
-- smt_lines table
is_manual_only BOOLEAN DEFAULT FALSE

-- Hand Build line marked as manual-only
UPDATE smt_lines 
SET is_manual_only = TRUE 
WHERE name = 'Hand Build';
```

### **Optimizer Logic**
```python
def get_general_lines(session):
    """Get lines available for auto-scheduling"""
    return session.query(SMTLine).filter(
        and_(
            SMTLine.is_active == True,
            SMTLine.is_special_customer == False,  # Excludes MCI line
            SMTLine.is_manual_only == False        # Excludes Hand Build line
        )
    ).all()
```

---

## Deployment

**Railway Auto-Deploy**: ~2 minutes after code push

**What Happens:**
1. ✅ Migration adds `is_manual_only` column to `smt_lines`
2. ✅ Seed data updates Hand Build line with `is_manual_only = TRUE`
3. ✅ Auto-scheduler now excludes Hand Build from all operations

---

## Testing

### **Before Auto-Schedule:**
1. Put a job on Hand Build line (position 1)
2. Note the job details (wo_number, position)

### **Run Auto-Schedule:**
1. Click "Auto-Schedule" button
2. Click "Preview Schedule"
3. Check proposed changes

### **Expected Result:**
- ✅ Hand Build line NOT shown in "Line Distribution"
- ✅ Job on Hand Build line NOT in "Changes" list
- ✅ Job stays exactly where you put it

### **After Apply:**
- ✅ Job still on Hand Build line
- ✅ Same position as before
- ✅ Other lines optimized normally

---

## FAQ

**Q: Can I still drag jobs to Hand Build line?**  
A: Yes! Manual operations work exactly the same.

**Q: Will auto-scheduler calculate dates for Hand Build jobs?**  
A: No, Hand Build is completely excluded. You can still see calculated dates in LineView though.

**Q: What if I accidentally put a job on Hand Build?**  
A: Just drag it back to another line or edit it to change the line.

**Q: Can I have multiple manual-only lines?**  
A: Yes! Just mark any line with `is_manual_only = TRUE` in the database.

**Q: Does this affect the Line View page?**  
A: No, Line View still works normally. You can still see jobs and their timing.

---

## Summary

✅ **Line 5 "Hand Build" is now protected from auto-scheduler**  
✅ **Manual control only - add jobs when needed**  
✅ **Auto-scheduler will never touch it**  
✅ **Perfect for small jobs, special cases, or custom builds**

---

**Created**: Oct 8, 2025  
**Feature**: Manual-only line exclusion from auto-scheduler

