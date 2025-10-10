# SMT Scheduler - Testing Checklist (Phase 1)

Before moving to Phase 2 (Capacity Calendar), let's thoroughly test the current system.

## 🎯 Core Functionality Tests

### ✅ 1. Dashboard
- [ ] Dashboard loads without errors
- [ ] Shows trolley count correctly
- [ ] Shows active lines count
- [ ] Shows high priority jobs
- [ ] Shows upcoming deadlines
- [ ] Line cards show job counts
- [ ] Line completion dates display correctly
- [ ] Auto-refreshes every 30 seconds

### ✅ 2. Work Order Management

#### Create Work Order
- [ ] Can create new work order with all required fields
- [ ] Defaults to "Unscheduled" (no line assigned)
- [ ] Can assign to a line during creation
- [ ] Auto-assigns line position when left blank
- [ ] WO number must be unique (can't duplicate)
- [ ] Form appears as popup modal (not full page)
- [ ] Can cancel without saving

#### Edit Work Order
- [ ] Can edit existing work order
- [ ] Changes save correctly
- [ ] Dates recalculate when relevant fields change
- [ ] Can change line assignment
- [ ] Can unschedule (set back to "⚠️ Unscheduled")
- [ ] Position auto-renumbers when inserting between jobs

#### Delete Work Order
- [ ] Can delete work orders
- [ ] Confirmation dialog appears
- [ ] Other positions renumber after deletion

### ✅ 3. Scheduling Features

#### Line Positions
- [ ] Auto-assigns to end of queue when blank
- [ ] Prevents duplicate positions on same line
- [ ] Renumbers other jobs when inserting in middle
- [ ] Shows position in "Pos" column

#### Priority System
- [ ] Can set all 5 priority levels
- [ ] Critical Mass shows red badge
- [ ] Overclocked shows orange badge
- [ ] Factory Default shows blue badge
- [ ] Other priorities show correctly

#### Status Workflow
- [ ] Can set all statuses (Clear to Build, Running, etc.)
- [ ] Status badges show correct colors
- [ ] "Clear to Build *" works (or use New Rev checkbox)

#### Locking
- [ ] Can lock work orders
- [ ] Locked jobs highlighted in yellow
- [ ] Lock icon shows on Visual Scheduler
- [ ] Locked jobs can't be dragged

### ✅ 4. Date/Time Calculations

#### Dates
- [ ] MIN START DATE calculates correctly (backward from ship date)
- [ ] Actual Ship Date = Cetec Ship Date (normal jobs)
- [ ] Actual Ship Date = Cetec Ship Date - 7 days (SMT ONLY jobs)
- [ ] Weekends are skipped in calculations

#### Times
- [ ] Start times show (e.g., "7:30 am")
- [ ] End times show (e.g., "2:45 pm")
- [ ] Times display on Schedule page
- [ ] Times display on Line View page
- [ ] First job starts at 7:30 AM
- [ ] Lunch break (11:30-12:30) is accounted for
- [ ] 15-minute buffer between jobs works
- [ ] Times round to nearest 15 minutes

#### Line 1 Special Handling
- [ ] Jobs on Line 1 (1-EURO 264) take 2x as long
- [ ] MIN START DATE reflects 2x multiplier
- [ ] Start/End dates show longer duration
- [ ] Visual Scheduler shows wider blocks for Line 1

### ✅ 5. Visual Scheduler

#### Display
- [ ] Shows all 5 lines (1-EURO 264, 2-EURO 127, etc.)
- [ ] Shows 28-day timeline
- [ ] Date headers show correctly
- [ ] Weekend columns have diagonal stripes
- [ ] Can navigate: Previous Week / This Week / Next Week

#### Work Order Blocks
- [ ] Blocks appear on correct dates
- [ ] Block width represents duration
- [ ] Colors match priority (red=Critical, blue=Factory, etc.)
- [ ] Locked jobs show lock icon
- [ ] Hover tooltip shows job details
- [ ] Times show in tooltip

#### Drag and Drop
- [ ] Can drag job from one line to another
- [ ] Can drag job from Unscheduled pool onto a line
- [ ] Can drag job back to Unscheduled area
- [ ] Locked jobs can't be dragged
- [ ] Line highlights blue when dragging over it
- [ ] Job reassigns after drop
- [ ] Schedule recalculates after reassignment

#### Unscheduled Pool
- [ ] Shows count of unscheduled jobs
- [ ] Unscheduled jobs appear in yellow banner
- [ ] Shows "No unscheduled jobs" when empty
- [ ] Can drag jobs from here

### ✅ 6. Schedule Page

#### Display
- [ ] Line Completion Summary bar shows at top
- [ ] Each line shows completion date
- [ ] Shows job count per line
- [ ] Filters work (All Lines, by specific line, Unscheduled)
- [ ] Status filter works

#### Data Columns
- [ ] Position shows correctly
- [ ] Customer, Assembly, Revision display
- [ ] WO Number shows
- [ ] Quantity shows
- [ ] Status badge shows
- [ ] Priority badge shows
- [ ] Line shows (or "⚠️ Unscheduled")
- [ ] Start Date + Time shows
- [ ] End Date + Time shows
- [ ] Ship Date shows
- [ ] Time in minutes shows
- [ ] Trolley count shows

#### Actions
- [ ] Complete button (green checkmark) works
- [ ] Lock/Unlock button toggles
- [ ] Edit button opens form modal
- [ ] Delete button works with confirmation

### ✅ 7. Line Views

#### Individual Line View
- [ ] Can select a line
- [ ] Shows only that line's jobs
- [ ] Jobs in position order
- [ ] First job highlighted green
- [ ] Shows start/end times
- [ ] Complete button works
- [ ] Auto-refreshes every 10 seconds

#### All Lines Overview
- [ ] Shows all line cards
- [ ] Click card to see line detail
- [ ] Shows hours/day and hours/week
- [ ] Shows special customer (MCI) if applicable

### ✅ 8. Complete Work Order

#### Completion Modal
- [ ] Opens when clicking green checkmark
- [ ] Shows job details
- [ ] Pre-fills with today's date
- [ ] Pre-fills quantity with expected qty
- [ ] Shows real-time variance (over/under)
- [ ] Actual Start Date required
- [ ] Actual Finish Date required
- [ ] Quantity Completed required
- [ ] Can cancel without saving

#### After Completion
- [ ] Job marked complete
- [ ] Job moves to Completed page
- [ ] Job removed from active schedules
- [ ] Trolley count updates
- [ ] Next job in queue moves up

### ✅ 9. Completed Jobs Page

#### Display
- [ ] Shows completed jobs list
- [ ] Shows total completed count
- [ ] Shows average time variance
- [ ] Shows on/under time percentage
- [ ] Table shows all completion details
- [ ] Variance shown with up/down arrows

### ✅ 10. Settings Page

#### Line Configuration
- [ ] Can edit line name
- [ ] Can edit hours per day
- [ ] Can edit hours per week
- [ ] Can set special customer
- [ ] Can activate/deactivate lines
- [ ] Can reorder lines
- [ ] Changes save correctly

### ✅ 11. Through-Hole Integration

#### TH Kit Status
- [ ] "SMT ONLY" subtracts 7 days from ship date
- [ ] "Clear to Build" doesn't affect ship date
- [ ] "Missing" shows in table
- [ ] "N/A" shows in table
- [ ] TH WO number field works

### ✅ 12. Trolley Management

#### Tracking
- [ ] Dashboard shows trolleys in use
- [ ] Count includes Running jobs
- [ ] Count includes Clear to Build jobs
- [ ] Doesn't count On Hold jobs
- [ ] Doesn't count completed jobs

#### Warnings
- [ ] Warning at 22+ trolleys
- [ ] Warning shows on dashboard
- [ ] Can still create jobs over limit (just warns)

### ✅ 13. Special Features

#### Run Together Groups
- [ ] Can assign group name
- [ ] Jobs with same group show together
- [ ] Doesn't affect scheduling logic

#### New Rev/Assembly
- [ ] Checkbox works
- [ ] Shows asterisk (*) or flag in table
- [ ] Indicates work instructions needed

### ✅ 14. Filters & Search

#### Schedule Page Filters
- [ ] All Lines filter works
- [ ] Unscheduled filter shows only unassigned jobs
- [ ] Specific line filter shows only that line
- [ ] Status filter works
- [ ] Filters combine correctly

### ✅ 15. Data Integrity

#### Validation
- [ ] Required fields enforced (red if missing)
- [ ] Unique WO number enforced
- [ ] Can't set finish date before start date
- [ ] Trolley count 1-8 enforced
- [ ] Dates must be in valid format

#### Safety
- [ ] Can't accidentally delete formulas (it's code!)
- [ ] Changes are atomic (all-or-nothing)
- [ ] Database handles concurrent users
- [ ] No data corruption

### ✅ 16. Performance

#### Loading Speed
- [ ] Dashboard loads in < 3 seconds
- [ ] Schedule page loads in < 3 seconds
- [ ] Visual Scheduler loads in < 5 seconds
- [ ] Creating WO is instant
- [ ] Drag and drop is smooth

#### Auto-Refresh
- [ ] Dashboard auto-refreshes (30s)
- [ ] Line Views auto-refresh (10s)
- [ ] Visual Scheduler auto-refreshes (30s)

---

## 🐛 Known Issues to Check

### Potential Issues:
1. **Line position null** - Auto-assign should fix this
2. **Weekend positioning** - Should be fully fixed now
3. **Time calculations** - Verify times make sense
4. **Drag and drop** - Test thoroughly
5. **Modal forms** - Ensure they work on all pages

---

## 📝 Test Scenarios

### Scenario 1: New Job Workflow
1. Create unscheduled WO
2. View it in Schedule (should show ⚠️ Unscheduled)
3. Edit it and assign to Line 2
4. Position auto-assigns to end
5. Dates/times calculate automatically
6. View on Visual Scheduler
7. Drag to Line 3
8. Verify it recalculates
9. Complete the job
10. Verify it moves to Completed page

### Scenario 2: Multiple Jobs on One Line
1. Create 3 jobs on Line 2
2. All get sequential positions (1, 2, 3)
3. Times are sequential (Job 2 starts when Job 1 ends + buffer)
4. Weekends are skipped
5. Visual Scheduler shows them in order
6. Drag Job 3 to Line 1
7. Verify Line 2 renumbers (now just 1, 2)

### Scenario 3: Priority Override
1. Create job with late ship date
2. Set priority to "Critical Mass"
3. Verify it's flagged as high priority on dashboard
4. Should be considered for immediate scheduling

---

## 📤 Next Steps

1. **Go through this checklist** - Test each item
2. **Report any bugs** - I'll fix them immediately
3. **Once stable** - We'll move to Phase 2

---

## 💾 Phase 2 Saved

I've saved all the Phase 2 requirements (Capacity Calendar) in my memory. When you're ready, just say **"Let's do Phase 2"** and I'll continue building the capacity override system with:
- 8-week planning calendar
- Right-click menus for quick overrides
- Overtime, half-day, custom hours
- Visual capacity indicators

---

## ✅ Start Testing!

Pick any section above and test it. **Tell me what works and what doesn't**, and I'll fix any issues before we move to Phase 2! 🧪



