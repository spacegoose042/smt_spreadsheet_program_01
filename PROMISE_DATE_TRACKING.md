# Promise Date Tracking & Auto-Scheduling System

## 🎯 **Key Principle**
**NEVER modify the Cetec promise date** - it's the customer's original commitment and must remain visible at all times.

---

## 📊 **Date Fields Explained**

### **From Cetec (Read-Only)**
```python
cetec_ship_date = Column(Date, nullable=False)
```
- **Source**: Imported from Cetec ERP
- **Purpose**: Original customer promise date
- **Never Changes**: This is sacrosanct - always preserved
- **Display**: Always show this to users as "Customer Promise Date"

### **System Calculated (Auto-Updated)**
```python
actual_ship_date = Column(Date)
```
- **Calculated**: `cetec_ship_date - 7 days` (if SMT Only) or `cetec_ship_date` (if full assembly)
- **Purpose**: Accounts for TH assembly time after SMT
- **When**: Updated whenever TH kit status changes

```python
min_start_date = Column(Date)
```
- **Calculated**: Works backward from `actual_ship_date` based on job time
- **Purpose**: Latest date we can start and still meet promise
- **Formula**: `actual_ship_date - (total_time / line_capacity)`

```python
earliest_completion_date = Column(Date)
```
- **Calculated**: Based on current capacity and queue position
- **Purpose**: Earliest we can realistically finish this job
- **When**: Updated by optimizer when schedule changes

### **Optimizer Assigned (Auto-Scheduled)**
```python
scheduled_start_date = Column(Date)
scheduled_end_date = Column(Date)
```
- **Set By**: Auto-scheduler algorithm
- **Purpose**: When optimizer plans to actually run this job
- **Updates**: Daily re-optimization or when queue changes

### **Calculated Metrics (Read-Only)**
```python
promise_date_variance_days = Column(Integer)
```
- **Calculated**: `scheduled_end_date - cetec_ship_date`
- **Meaning**: 
  - Negative = Early (good!)
  - Zero = On time (perfect!)
  - Positive = Late (problem!)
- **Display**: "7 days late" or "2 days early"

---

## 🎨 **UI Display Examples**

### **Schedule Page - Work Order Row**
```
WO: 12345 | Customer: Acme Corp | Assembly: XYZ-100

Customer Promise:    Oct 15, 2025 (from Cetec)
Earliest Possible:   Oct 22, 2025
Scheduled:           Oct 22, 2025
Status:              ⚠️ 7 days late

Actions: [Contact Customer] [Add Overtime] [View Details]
```

### **Promise Date Status Badge**
```javascript
if (variance_days <= 0) {
  return <Badge color="green">✅ On Time</Badge>
}
else if (variance_days <= 3) {
  return <Badge color="yellow">⚠️ At Risk ({variance_days} days)</Badge>
}
else {
  return <Badge color="red">❌ Will Miss ({variance_days} days)</Badge>
}
```

### **Detailed Work Order View**
```
Promise Date Management:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Customer Promise Date:     Oct 15, 2025 (from Cetec - locked)
TH Kit Status:             SMT Only
Actual Ship Date:          Oct 8, 2025 (promise - 7 days)
Min Start Date:            Oct 6, 2025 (latest to start)

Current Schedule:
  Earliest Completion:     Oct 22, 2025
  Scheduled Start:         Oct 18, 2025
  Scheduled End:           Oct 22, 2025
  Variance:                +7 days late

Reason for Delay:
  ✓ Capacity constraint on Line 2
  ✓ 3 Critical Mass jobs ahead in queue
  ✓ Material arrived late (Oct 10)

Suggestions:
  1. Add 4 hours overtime to Line 2 → Oct 20 (still 5 days late)
  2. Move to Line 3 → Oct 19 (4 days late)
  3. Contact customer about Oct 22 date
```

---

## 🔄 **Auto-Scheduler Workflow**

### **1. Calculate Feasibility**
```python
def calculate_earliest_completion(work_order):
    """
    Based on current capacity, when CAN we finish this job?
    """
    # Consider:
    # - Current queue on all lines
    # - Available capacity
    # - Trolley constraints
    # - Material availability
    # - Priority constraints
    
    return earliest_date
```

### **2. Optimize Schedule**
```python
def auto_schedule_all_jobs():
    """
    Try to schedule all jobs optimally within constraints
    """
    # 1. Lock Critical Mass jobs (highest priority)
    # 2. Respect locked positions
    # 3. Optimize remaining jobs
    # 4. Balance trolley usage
    # 5. Minimize promise date variance
    
    return optimized_schedule
```

### **3. Calculate Variance**
```python
def update_promise_variance(work_order):
    """
    How far off are we from the customer promise?
    """
    variance = work_order.scheduled_end_date - work_order.cetec_ship_date
    work_order.promise_date_variance_days = variance.days
```

---

## 📋 **Communication Workflow**

### **When Schedule Can't Meet Promise Date**
```
System Actions:
1. ✅ Calculate variance
2. ✅ Flag job with "At Risk" or "Will Miss" status
3. ✅ Show on dashboard with warning
4. ✅ Calculate alternatives (overtime, line change, etc.)

Scheduler Actions:
1. Review flagged jobs
2. Decide action:
   - Add capacity (overtime)
   - Adjust other jobs
   - Contact customer
3. System tracks decision
```

### **Never Automatically Change Cetec Date**
```
❌ WRONG: Update cetec_ship_date to match schedule
✅ RIGHT: Track variance, alert user, suggest alternatives
```

---

## 🚀 **Benefits of This Approach**

1. **Visibility**: Always see original customer promise vs reality
2. **Proactive**: Know problems before they happen
3. **Traceable**: Full audit trail of promise date vs actual
4. **Flexible**: Can optimize schedule without losing customer commitment
5. **Actionable**: Clear indicators of where intervention needed

---

## 💡 **Example Scenarios**

### **Scenario 1: Job Can Meet Promise**
```
Customer Promise:    Oct 15, 2025
Earliest Possible:   Oct 12, 2025
Scheduled:           Oct 13, 2025
Variance:            -2 days (early)
Status:              ✅ On Time
```

### **Scenario 2: Job Will Miss Promise**
```
Customer Promise:    Oct 15, 2025
Earliest Possible:   Oct 22, 2025
Scheduled:           Oct 22, 2025
Variance:            +7 days (late)
Status:              ❌ Will Miss
Action:              Contact customer or add capacity
```

### **Scenario 3: Critical Mass Job**
```
Customer Promise:    Oct 15, 2025
Priority:            Critical Mass
Scheduled:           ASAP (bumps other jobs)
Variance:            0 days
Status:              ✅ On Time (forced)
```

---

## 🔧 **Implementation Notes**

### **Database Migration**
- New columns added automatically on startup
- Existing jobs: variance calculated on next optimization
- No data loss - all original dates preserved

### **API Changes**
- GET `/api/work-orders` includes all date fields
- Promise variance calculated in response
- Status badges updated based on variance

### **Frontend Display**
- Add variance column to Schedule page
- Color-code promise date status
- Show "days late/early" clearly
- Keep Cetec date always visible

---

## ❓ **FAQs**

**Q: What if customer changes promise date in Cetec?**
A: Next Cetec sync will update `cetec_ship_date`, and optimizer will recalculate variance.

**Q: Can we manually override the scheduled dates?**
A: Yes - if you lock a job, it keeps its position and dates.

**Q: What if we add overtime to meet a promise date?**
A: Adjust line capacity, optimizer will recalculate, variance should improve.

**Q: How do we communicate new dates to customers?**
A: System flags the need - you decide whether to contact customer or add capacity.

---

This system gives you **full transparency** while keeping the optimizer free to find the best schedule within your constraints.



