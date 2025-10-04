# SMT Production Scheduler - User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Managing Work Orders](#managing-work-orders)
4. [Line Views](#line-views)
5. [Completed Jobs](#completed-jobs)
6. [Settings](#settings)
7. [Best Practices](#best-practices)

## Getting Started

### First Login

Default credentials:
- **Username**: scheduler
- **Password**: password123

⚠️ **Change your password immediately after first login!**

### Understanding the Interface

The application has 5 main sections:
- **Dashboard**: Real-time overview of all production lines
- **Schedule**: Manage and edit work orders
- **Line Views**: Individual line schedules for operators
- **Completed**: Historical job completion tracking
- **Settings**: Configure lines and system settings

## Dashboard

The dashboard provides a real-time overview of your production floor.

### Key Metrics

1. **Trolleys In Use**: Current trolley usage vs. 24-trolley limit
   - Green: Normal operation
   - Yellow: Approaching limit (22+)
   - Red: Over limit

2. **Active Lines**: Number of lines with jobs queued

3. **High Priority Jobs**: Jobs marked as "Overclocked" or "Critical Mass"

4. **Upcoming Deadlines**: Jobs due in the next 7 days

### Production Lines Grid

Each line card shows:
- Line name and customer dedication (if any)
- Number of jobs queued
- Trolleys currently in use
- Next job up for production

### Refreshing Data

The dashboard auto-refreshes every 30 seconds. You can manually refresh by reloading the page.

## Managing Work Orders

### Creating a New Work Order

1. Click **Schedule** in the navigation
2. Click **Add Work Order** button
3. Fill in required fields:
   - Customer name
   - Assembly number and revision
   - WO Number (must be unique)
   - Quantity
   - Cetec Ship Date
   - Time in minutes
   - Trolley count (1-8)

4. Select optional fields:
   - Status (default: Clear to Build)
   - Priority (default: Factory Default)
   - Line assignment
   - Line position
   - TH (Through-Hole) information
   - Run together group
   - Notes

5. Check boxes if applicable:
   - **New Rev/Assembly**: Requires new work instructions or photos
   - **Lock Position**: Prevents automatic rescheduling

6. Click **Create Work Order**

### Understanding Calculated Fields

The system automatically calculates:

- **Actual Ship Date**: 
  - If TH Kit Status = "SMT ONLY": Cetec Ship Date - 7 days
  - Otherwise: Same as Cetec Ship Date

- **Setup Time**: Based on trolley count (1-4 hours)

- **Min Start Date**: Calculated by working backwards from Actual Ship Date using:
  - Build time (minutes)
  - Setup time (hours)
  - Line capacity (hours/day)
  - Skipping weekends

### Editing Work Orders

1. Find the work order in the Schedule view
2. Click the **Edit** (pencil) icon
3. Make your changes
4. Click **Update Work Order**

### Deleting Work Orders

1. Click the **Delete** (trash) icon
2. Confirm deletion in the popup

⚠️ This action cannot be undone!

### Locking/Unlocking Work Orders

Click the lock/unlock icon to prevent or allow rescheduling.

Locked jobs (highlighted in yellow) will not be moved by automatic scheduling changes.

### Filtering Work Orders

Use the dropdowns at the top of the Schedule page:
- **All Lines**: Filter by specific production line
- **All Statuses**: Filter by work order status

## Work Order Statuses

| Status | Meaning |
|--------|---------|
| **Clear to Build** | Kit is complete and ready to run |
| **Clear to Build *** | New rev/assembly requiring work instructions |
| **Running** | Currently on the line |
| **2nd Side Running** | Second side of double-sided board running |
| **On Hold** | Problem preventing production |
| **Program/Stencil** | Waiting for program or stencil creation |

## Priority Levels

From highest to lowest:

1. **Critical Mass**: Top priority - runs immediately
2. **Overclocked**: Rush job - overrides normal scheduling
3. **Factory Default**: Normal priority - scheduled by date
4. **Trickle Charge**: Low priority - fills gaps
5. **Power Down**: On hold - not actively scheduled

Priority overrides date-based scheduling. A "Critical Mass" job will run before "Factory Default" jobs even if it has a later ship date.

## Line Position Assignment

### Manual Assignment

1. Set the **Line** dropdown to assign to a specific line
2. Set the **Line Position** to place it in the queue (1, 2, 3...)
3. If the position is taken, other jobs will automatically shift down

### Best Practices

- Generally, order jobs by **Min Start Date**
- Override with **Priority** when needed
- Use **Lock Position** for confirmed schedules
- Group similar assemblies with **Run Together Group**

## TH (Through-Hole) Information

### TH Kit Status

| Status | Meaning | Impact |
|--------|---------|--------|
| **N/A** | No through-hole work required | SMT is final product |
| **Clear to Build** | TH kit ready | SMT can proceed normally |
| **Missing** | TH parts missing | Lower priority (can't complete TH anyway) |
| **SMT ONLY** | No TH work order | Actual ship date = Cetec date - 7 days |

### TH WO Number

Enter the dependent through-hole work order number for tracking.

## Line Views

### For Operators

Line Views show what's scheduled on each line in production order.

1. Click **Line Views** in navigation
2. Select your line
3. Jobs are shown in order of Line Position
4. First job (highlighted green) is next up

### Features

- Auto-refreshes every 10 seconds
- Shows all relevant job details
- Locked jobs highlighted in yellow
- New rev/assembly marked with *

## Completing Jobs

When a job is finished:

1. Go to Schedule
2. Find the completed work order
3. Mark it as complete (feature to be added in UI)

Or use the API directly:

```bash
POST /api/work-orders/{id}/complete
{
  "actual_start_date": "2025-10-01",
  "actual_finish_date": "2025-10-01",
  "actual_time_clocked_minutes": 520
}
```

## Completed Jobs

View historical completion data and performance metrics.

### Metrics

- **Total Completed**: Number of finished jobs
- **Avg Time Variance**: Average difference between estimated and actual time
- **On/Under Time %**: Percentage of jobs completed on or under estimated time

### Time Variance

- **Green/Negative**: Job completed faster than estimated
- **Red/Positive**: Job took longer than estimated

Use this data to improve future time estimates!

## Settings

### Configuring Lines

1. Click **Settings** in navigation
2. Find the line you want to edit
3. Click **Edit**
4. Modify:
   - Line name
   - Hours per day (how long the line runs)
   - Hours per week (typically hours/day × 5)
   - Special customer (for dedicated lines)
   - Active status
   - Display order

5. Click **Save**

### Adding New Lines

1. Click **Add Line**
2. Edit the new line with your configuration
3. Click **Save**

## Best Practices

### Daily Workflow

1. **Morning**: Check Dashboard for high-priority jobs and deadlines
2. **Throughout Day**: Update job statuses as they progress
3. **End of Day**: Mark completed jobs and update schedule

### Scheduling Tips

1. **Use Min Start Date**: Let the system calculate when jobs need to start
2. **Respect Priorities**: Critical/Overclocked jobs should move up
3. **Monitor Trolleys**: Keep under 24 to avoid resource conflicts
4. **Lock Confirmed Jobs**: Prevent accidental rescheduling
5. **Group Similar Work**: Use Run Together Group for efficiency

### Trolley Management

- Maximum: 24 trolleys
- System warns at 22+
- Jobs can use 1-8 trolleys each
- Only counts jobs with status: Running, 2nd Side Running, Clear to Build, or Clear to Build *

### Time Estimation

Start with conservative estimates and refine based on completed job data:

1. Check Completed page for similar assemblies
2. Note time variance (over/under)
3. Adjust estimates for future similar jobs

### Weekend Planning

The system skips weekends in calculations. For jobs needed Monday:
- Check Min Start Date accounts for weekend skip
- Schedule accordingly on Friday or earlier

## Keyboard Shortcuts

(Coming soon in future update)

## Troubleshooting

### "Trolley limit exceeded" Warning

**Solution**: 
- Complete some running jobs
- Delay new job starts
- Reduce trolley counts if possible

### Work Order Won't Save

**Common Causes**:
- Duplicate WO Number
- Missing required fields
- Invalid date format

**Solution**: Check all required fields and ensure WO number is unique

### Min Start Date Seems Wrong

**Check**:
- Actual Ship Date is correct
- Time estimate includes full build time
- Setup time is appropriate for trolley count
- Line hours/day is configured correctly

## Support

For issues or questions:
- Check this guide first
- Review deployment documentation
- Contact your system administrator

## Updates and Maintenance

Check for system updates regularly. Your administrator will notify you of:
- New features
- Bug fixes
- Scheduled maintenance


