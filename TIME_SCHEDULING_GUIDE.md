# Time-of-Day Scheduling - Feature Guide

## 🎯 What's New

Your SMT Scheduler now includes **precise time-of-day scheduling** with:

✅ **Hourly precision** - Jobs scheduled down to the minute (15-min rounding)  
✅ **Shift configuration** - Set start/end times per line  
✅ **Break handling** - Lunch breaks automatically accounted for  
✅ **Buffer time** - Configurable buffer between jobs (default: 15 min)  
✅ **Visual timeline** - See exactly when jobs run on the Visual Scheduler  
✅ **Time display** - Start/end times shown on all pages  

---

## 📅 Default Configuration

### Shift Times (All Lines):
- **Start**: 7:30 AM
- **End**: 4:30 PM  
- **Days**: Monday - Friday

### Lunch Break:
- **Time**: 11:30 AM - 12:30 PM
- **Paid**: No (1 hour unpaid)

### Other Settings:
- **Buffer between jobs**: 15 minutes
- **Time rounding**: 15 minutes
- **Timezone**: America/Chicago (CST)

---

## 🔄 How It Works

### Sequential Job Scheduling

```
Line 2-EURO 127 - Oct 1, 2025

7:30 AM  ├─────────────────────────┐
         │ Job 1: Setup (15 min)   │
8:00 AM  │ Job 1: Build (505 min)  │
         │                          │
11:30 AM │ >>> LUNCH BREAK <<<     │
12:30 PM │ (continues after lunch) │
         │                          │
3:45 PM  └─────────────────────────┘
4:00 PM  Buffer (15 min)
4:15 PM  └─> Too late, continues tomorrow

Oct 2, 7:30 AM
         ├─────────────────────────┐
         │ Job 2: Setup (15 min)   │
         │ Job 2: Build (500 min)  │
         └─────────────────────────┘
```

### Key Rules:

1. **Jobs run continuously** until breaks/shift end
2. **Lunch breaks pause** the job (unpaid breaks don't count toward work time)
3. **End of shift**: Job continues next business day at 7:30 AM
4. **15-minute buffer** between jobs (configurable)
5. **Weekends skipped** automatically
6. **Times rounded** to nearest 15 minutes

---

## 📊 What You'll See

### Schedule Page:
```
Start Date          End Date
-----------------   -----------------
Oct 1, 2025         Oct 3, 2025
7:30 am            2:45 pm
```

### Line View Page:
- Same format - shows dates and times

### Visual Scheduler:
- Jobs positioned **by minute** on timeline
- Shows exact time spans
- Weekends have diagonal stripes
- Hover shows full time range

---

## ⚙️ Configurable Settings (Coming Soon in UI)

You'll be able to configure per line:

### Shift Settings:
- Start time (e.g., 7:30 AM, 6:00 AM, etc.)
- End time (e.g., 4:30 PM, 6:00 PM, etc.)
- Days active (Mon-Fri, or add weekends)
- Multiple shifts per day (2nd shift, 3rd shift)

### Break Settings:
- Break name (Lunch, Coffee, etc.)
- Start/end times
- Paid vs unpaid

### Other:
- Buffer time between jobs (0-60 minutes)
- Time rounding (5, 10, 15, 30 min intervals)

---

## 🚀 Deployment Steps

### 1. Push All Changes

```bash
cd /Users/mattspacegrey/Documents/GitHub/smt_spreadsheet_program_01

git add .
git commit -m "Add time-of-day scheduling with shifts, breaks, and buffer time"
git push
```

### 2. Railway Will Redeploy

Both backend and frontend will redeploy automatically.

### 3. Run Migration & Seed

After backend deploys, visit:
```
https://smtspreadsheetprogram01-production-backend.up.railway.app/api/recalculate-all
```

This will:
- Create shift tables
- Add default shifts (7:30 AM - 4:30 PM)
- Add lunch breaks (11:30 AM - 12:30 PM)
- Recalculate all jobs with time-of-day precision

### 4. Verify

1. Go to **Schedule** page - you should see times under dates
2. Go to **Visual** page - jobs should be positioned by time
3. Create a new work order - it should show precise start/end times

---

## 📈 What This Enables

### Before (Date-Only):
```
Job 1: Oct 1 - Oct 3 (3 days)
Job 2: Oct 6 - Oct 8 (starts Monday)
```
**Can't see**: What time on Oct 1? All day? Just morning?

### After (Time-of-Day):
```
Job 1: Oct 1, 7:30 AM - Oct 3, 2:45 PM
       (breaks for lunch 11:30-12:30 each day)
Job 2: Oct 3, 3:00 PM - Oct 6, 11:15 AM
       (15-min buffer after Job 1)
```
**Now you know**: Exact times! Can plan around them.

---

## 🎨 Visual Scheduler Enhancements

With time-of-day scheduling, the Visual Scheduler now shows:

- **Partial day fills** - A 4-hour job only fills half the day column
- **Precise positioning** - Jobs positioned by hour and minute
- **Time labels on blocks** - See "7:30 AM - 2:45 PM" on hover/block
- **Break gaps visible** - Can see lunch breaks in longer jobs
- **True capacity view** - See exactly when lines are busy

---

## 🔮 Future Enhancements

- UI to configure shifts per line (in Settings page)
- Add/edit breaks visually
- Drag to adjust job times (not just reassign lines)
- Show shift time markers on Visual Scheduler
- Multiple shifts per day support
- Real-time "current time" indicator on Visual

---

## 📝 Notes

- **Existing jobs** will show times after running `/api/recalculate-all`
- **New jobs** automatically get time calculations
- **Fallback**: If no shift configured, uses default (7:30 AM - 4:30 PM)
- **Line 1 still 2x slower** - time multiplier still applies

---

**Ready to deploy?** Push the changes and watch your scheduler gain hourly precision! ⏰

