# Deploy Fixes

This file forces git to detect changes and deploy the following fixes:

## Backend Fixes:
- Fixed None value handling in Cetec import (backend/main.py)
- Fixed Status import in seed_data.py

## Frontend Fixes:
- Default Schedule page to SMT PRODUCTION filter
- Filter Visual Scheduler to only show SMT PRODUCTION work orders

## Issues Fixed:
- 18 import errors: '<=' not supported between instances of 'NoneType' and 'int'
- Schedule page not showing work orders (due to SMT PRODUCTION filter)
- Visual Scheduler showing all work orders instead of just SMT PRODUCTION

Deploy these changes to fix production issues.


