# Import Issue Root Cause Analysis

## The Problem

Import is failing with error: `'<=' not supported between instances of 'NoneType' and 'int'`

## Root Cause

**The error occurs when UPDATING existing work orders, NOT when creating new ones.**

### Why Dev Worked Earlier
- Dev database was EMPTY (no existing work orders)
- All imports created NEW work orders → Never hit the UPDATE code path
- No None comparison errors

### Why Production/Dev Fails Now
- Database has existing work orders from previous imports
- Import tries to UPDATE existing work orders
- Comparison `if existing_wo.cetec_ship_date != cetec_ship_date` fails when `existing_wo.cetec_ship_date` is None
- Python internally uses `<=` operator when comparing None to date object → ERROR

## The Fix

### File: `backend/main.py` (around line 2180)

**BEFORE (Broken):**
```python
if existing_wo.cetec_ship_date != cetec_ship_date:
```

**AFTER (Fixed):**
```python
# Compare dates safely (handle None)
old_date = existing_wo.cetec_ship_date
new_date = cetec_ship_date
if (old_date is None and new_date is not None) or (old_date is not None and new_date is None) or (old_date is not None and new_date is not None and old_date != new_date):
```

## What Changed in backend/main.py

1. **Line 2120**: Removed `continue` statement that was skipping non-SMT work orders
   - Now imports ALL work orders regardless of location
   
2. **Lines 2167, 2193, 2197, 2210**: Fixed None comparisons for:
   - `quantity` → `(existing_wo.quantity or 0) != (quantity or 0)`
   - `time_minutes` → `(existing_wo.time_minutes or 0) != (time_minutes or 0)`
   - `current_location` → `(existing_wo.current_location or '') != (current_location or '')`
   - `material_status` → `(existing_wo.material_status or '') != (material_status or '')`

3. **Line 2180**: Fixed date comparison (the one I just created)
   - Safely handles None values in date comparisons

## To Fix This

### Option 1: Quick Fix - Clear Database
Delete all existing work orders in production/dev so imports create fresh ones (avoids UPDATE code path)

### Option 2: Proper Fix - Deploy the Code Fix
1. Review the changes to `backend/main.py` in GitHub Desktop
2. Commit: "Fix None value comparisons in work order UPDATE logic"
3. Push to both `development` and `main` branches
4. Wait for Railway to deploy
5. Import should now work

## Testing
After deploying the fix:
1. Run import in dev
2. Should see work orders from ALL locations (WAREHOUSE, KIT SHORT SHELF, DOC CONTROL, SMT PRODUCTION)
3. No more `'<=' not supported` errors
4. Repeat import - should UPDATE existing work orders without errors

