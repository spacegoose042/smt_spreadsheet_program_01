# 🚀 Quick Start Guide: Auto-Scheduler

## ✅ Status: Ready to Test!

All code is built and ready to test in the **development branch**.

---

## 📋 What We Built

### **🎯 Core Features**
1. **Auto-Schedule Button** - One-click optimization for all SMT PRODUCTION jobs
2. **Promise Date Tracking** - See which jobs will be early/late
3. **Throughput Maximization** - Pack lines efficiently to maximize jobs/day
4. **MCI Line Reservation** - Line 4 reserved for MCI customers only
5. **Trolley Constraints** - Automatic enforcement of 24 trolley limit
6. **Manual Overrides** - Lock jobs to preserve manual positioning

### **📊 New UI Elements**
- **Green "Auto-Schedule" button** on Schedule page
- **Promise Date Variance column** with color-coded badges:
  - 🔴 Red = Late (+days)
  - 🟡 Yellow = On-time (0 to -7 days)
  - 🟢 Green = Well ahead (< -7 days)
- **Auto-Schedule Modal** with preview and apply modes

---

## 🧪 Testing Steps

### **Step 1: Start the Dev Environment**
```bash
# Make sure you're on development branch
git branch  # Should show * development

# Start backend (in one terminal)
cd backend
python3 main.py

# Start frontend (in another terminal)
cd frontend
npm run dev
```

### **Step 2: Import Some Jobs from Cetec**
1. Navigate to **Cetec Import** page
2. Click **Import from Cetec**
3. Verify jobs are imported to database

### **Step 3: Test Auto-Scheduler**
1. Navigate to **Schedule** page
2. You should see a **green "Auto-Schedule" button** (top-right, next to "Add Work Order")
3. Click **"Auto-Schedule"**
4. Modal should open with 3 options:
   - Balanced (default)
   - Maximum Throughput
   - Promise Focused
5. Click **"👁️ Preview Schedule"**
6. Review the results:
   - Jobs scheduled count
   - At risk count
   - Will be late count
   - Line distribution
   - Trolley utilization
   - Proposed changes (if any)
7. If happy, click **"✅ Apply Schedule"**
8. Page should refresh with optimized schedule

### **Step 4: Verify Results**
1. Check the **Var column** on the schedule table
   - Should show colored badges with days early/late
2. Check **Line positions**
   - MCI jobs should be on Line 4 only
   - Other jobs distributed across Lines 1-3
3. Check **Trolley counts**
   - No line should have >24 trolleys in positions 1+2

---

## 🐛 If Something Doesn't Work

### **Auto-Schedule Button Missing**
- Check browser console for errors (F12)
- Verify `AutoScheduleModal.jsx` was created
- Restart frontend dev server

### **Modal Shows Errors**
- Check backend is running (`http://localhost:8000`)
- Check backend logs for error messages
- Verify API endpoints exist:
  - `POST /api/auto-schedule`
  - `GET /api/schedule-analysis`
  - `GET /api/capacity-forecast`

### **"No jobs to schedule" Message**
- Verify jobs are in "SMT PRODUCTION" location
- Check jobs aren't all locked
- Import more jobs from Cetec

### **Variance Column Shows All Dashes (-)**
- This is normal if auto-schedule hasn't been run yet
- Variance only populates after auto-schedule assigns `scheduled_end_date`

---

## 📖 How It Works

### **Optimizer Logic**
```
1. Get all jobs in "SMT PRODUCTION" (not complete, not locked)
2. Calculate earliest_completion_date for each
3. Sort by priority (Critical Mass → Factory Default → Power Down)
4. Then sort by promise date (earliest first)
5. Route MCI jobs to Line 4
6. Distribute other jobs across Lines 1-3:
   - Pick line with earliest completion date
   - Append to end of queue (minimize gaps)
   - Check trolley constraint (max 24 in positions 1+2)
7. Calculate scheduled_start_date and scheduled_end_date
8. Calculate variance: scheduled_end - promise_date
9. Return summary + proposed changes
```

### **Setup Time Calculation**
```python
# NEW: Linear formula
if trolleys <= 2:
    setup_time = 1.0 hour
else:
    setup_time = 1.0 + ((trolleys - 2) * 0.33 hours)

# Examples:
# 2 trolleys = 1.0 hour
# 3 trolleys = 1.33 hours
# 5 trolleys = 2.0 hours
# 8 trolleys = 3.0 hours
```

---

## ✨ Tips for Best Results

### **Before Running Auto-Schedule**
1. **Import latest jobs from Cetec** (fresh data)
2. **Set priorities** correctly (use Critical Mass sparingly)
3. **Lock any jobs** that must stay in specific positions
4. **Verify trolley counts** are accurate

### **After Running Auto-Schedule**
1. **Review late jobs** - consider priority bumps
2. **Check trolley utilization** - rebalance if needed
3. **Manually adjust** edge cases
4. **Lock critical jobs** to preserve positions
5. **Re-run auto-schedule** if you make many manual changes

### **When to Use Each Mode**
- **Balanced**: Default, use 90% of the time
- **Maximum Throughput**: When catching up on backlog
- **Promise Focused**: When promise date hit rate is critical

---

## 📞 Next Steps

### **If It Works:**
1. ✅ Test with more jobs
2. ✅ Try different optimization modes
3. ✅ Test locking/unlocking jobs
4. ✅ Verify MCI routing to Line 4
5. ✅ Check variance calculations
6. 📝 Provide feedback on UX
7. 📝 Suggest improvements

### **If It Doesn't Work:**
1. 🐛 Share error messages from:
   - Browser console (F12 → Console tab)
   - Backend logs (terminal running `python3 main.py`)
2. 📸 Screenshot of issue
3. 📝 Describe what you expected vs what happened

---

## 🎓 Understanding the Metrics

### **Jobs At Risk** ⚠️
- `earliest_completion_date > promise_date`
- Means: Job *might* miss promise even with perfect conditions
- Action: Consider priority bump or overtime

### **Jobs Will Be Late** 🔴
- `scheduled_end_date > promise_date`
- Means: Job *will* miss promise with current schedule
- Action: Immediate priority bump or customer communication

### **Promise Date Variance** 📊
- **Negative** (-7d) = Finishing 7 days EARLY ✅
- **Zero** (0d) = Finishing exactly on promise date
- **Positive** (+3d) = Finishing 3 days LATE ❌

---

## 🚀 Ready to Go!

Everything is built and waiting in the **development branch**. Just:
1. Start backend + frontend
2. Click "Auto-Schedule"
3. Watch the magic happen! ✨

Let me know what you think!

