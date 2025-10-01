# SMT Production Scheduler - Setup Instructions

## What You Have

A complete, production-ready web application for managing SMT production scheduling with:

✅ **Backend API** (Python/FastAPI)  
✅ **Frontend UI** (React/Vite)  
✅ **Database Schema** (PostgreSQL)  
✅ **Automatic Date Calculations**  
✅ **Multi-Line Management**  
✅ **Trolley Tracking**  
✅ **Priority System**  
✅ **Deployment Ready** (Railway)

## Quick Start (5 Minutes)

### 1. Install Prerequisites

You need:
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+

### 2. Set Up Database

```bash
# Create database
createdb smt_scheduler
```

### 3. Set Up Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smt_scheduler
SECRET_KEY=change-this-to-a-secure-random-string
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
EOF

# Initialize database
alembic upgrade head
python seed_data.py
```

### 4. Set Up Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
```

### 5. Run It

**Terminal 1** (Backend):
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

**Terminal 2** (Frontend):
```bash
cd frontend
npm run dev
```

Open: **http://localhost:5173**

Login: `scheduler` / `password123`

## What's Included

### Backend (`/backend`)

- **FastAPI application** with REST API
- **PostgreSQL database** models and schema
- **Automatic scheduling logic**:
  - Calculates min start dates
  - Skips weekends
  - Accounts for line capacity
  - Manages trolley limits
- **Auto-renumbering** for line positions
- **Database migrations** with Alembic
- **Seed data** for initial setup

### Frontend (`/frontend`)

- **React application** with modern UI
- **5 main pages**:
  1. Dashboard - Real-time overview
  2. Schedule - Manage all work orders
  3. Line Views - Individual line schedules
  4. Completed - Historical tracking
  5. Settings - Configure lines

### Documentation (`/docs`)

- **QUICKSTART.md** - Get running in 5 minutes
- **DEPLOYMENT.md** - Deploy to Railway
- **USER_GUIDE.md** - Complete user manual

## Key Features

### Automatic Calculations

The system automatically calculates:
- **Actual Ship Date**: Adjusts for SMT-only jobs
- **Setup Time**: Based on trolley count (1-4 hours)
- **Min Start Date**: Works backwards from ship date, skipping weekends

### Scheduling Logic

```
Actual Ship Date = Cetec Ship Date - 7 days (if SMT ONLY)
Total Time = Build Time + Setup Time
Min Start Date = Actual Ship Date - (Total Time / Line Hours/Day)
* Skips weekends in calculation
```

### Trolley Management

- **Limit**: 24 trolleys
- **Warning**: At 22+ trolleys
- **Per Job**: 1-8 trolleys
- **Automatic tracking** of jobs using trolleys

### Priority System

1. **Critical Mass** - Top priority, runs immediately
2. **Overclocked** - Rush job, overrides dates
3. **Factory Default** - Normal priority
4. **Trickle Charge** - Low priority
5. **Power Down** - On hold

### Status Workflow

- Clear to Build / Clear to Build * (new rev)
- Running / 2nd Side Running
- On Hold
- Program/Stencil (waiting for setup)

## Database Schema

### Main Tables

1. **users** - Authentication and roles
2. **smt_lines** - Production line configuration
3. **work_orders** - All work orders (active)
4. **completed_work_orders** - Historical completion data
5. **settings** - System configuration

### Key Relationships

- Work Orders → SMT Lines (many-to-one)
- Work Orders → Completed Records (one-to-one)
- Automatic cascade on deletes

## API Endpoints

Full API documentation at: `http://localhost:8000/docs`

### Work Orders
- `GET /api/work-orders` - List all work orders
- `POST /api/work-orders` - Create new work order
- `PUT /api/work-orders/{id}` - Update work order
- `DELETE /api/work-orders/{id}` - Delete work order
- `POST /api/work-orders/{id}/complete` - Mark complete

### Lines
- `GET /api/lines` - List all lines
- `PUT /api/lines/{id}` - Update line configuration

### Dashboard
- `GET /api/dashboard` - Get dashboard data
- `GET /api/trolley-status` - Current trolley usage

### Completed
- `GET /api/completed` - Historical completion data

## Default Configuration

### SMT Lines Created

1. **1-EURO 264** - General purpose
2. **2-EURO 127** - General purpose
3. **3-EURO 588** - General purpose
4. **4-EURO 586 MCI** - MCI dedicated line
5. **Hand Build** - Manual assembly

All configured for 8 hrs/day, 40 hrs/week.

### Default Users

| Username | Password | Role |
|----------|----------|------|
| scheduler | password123 | Full access |
| operator | password123 | View only |
| manager | password123 | View all |

**⚠️ Change passwords immediately!**

## Deployment to Production

See `docs/DEPLOYMENT.md` for full Railway deployment guide.

**Quick summary:**
1. Push code to GitHub
2. Create Railway project
3. Add PostgreSQL database
4. Deploy backend service
5. Deploy frontend service
6. Configure environment variables
7. Run migrations

Estimated cost: **$12-20/month**

## Customization

### Adjust Line Capacity

Go to Settings page or update directly:

```python
# In settings page or via API
line.hours_per_day = 10.0  # Run 10 hours/day
line.hours_per_week = 50.0  # 5 days × 10 hours
```

### Modify Setup Time Calculation

Edit `backend/scheduler.py`:

```python
def calculate_setup_time_hours(trolley_count: int) -> float:
    # Customize your setup time logic here
    return trolley_count * 0.5  # Example: 0.5 hours per trolley
```

### Add Custom Fields

1. Update model in `backend/models.py`
2. Create migration: `alembic revision --autogenerate -m "Add field"`
3. Run migration: `alembic upgrade head`
4. Update frontend forms

### Change Trolley Limit

Edit `backend/scheduler.py`:

```python
TROLLEY_LIMIT = 32  # Change from 24 to 32
```

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env
   
2. **Module not found**
   - Activate virtual environment
   - Run `pip install -r requirements.txt`

3. **Port already in use**
   - Kill process on port 8000 or 5173
   - Or use different ports

4. **Frontend can't reach API**
   - Check VITE_API_URL in frontend/.env
   - Verify backend is running

See `docs/QUICKSTART.md` for detailed troubleshooting.

## Project Structure

```
smt_spreadsheet_program_01/
├── backend/
│   ├── alembic/              # Database migrations
│   ├── main.py               # FastAPI app
│   ├── models.py             # Database models
│   ├── schemas.py            # API schemas
│   ├── scheduler.py          # Scheduling logic
│   ├── database.py           # Database connection
│   ├── config.py             # Configuration
│   ├── seed_data.py          # Initial data
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── pages/            # React pages
│   │   ├── components/       # React components
│   │   ├── App.jsx           # Main app component
│   │   └── api.js            # API client
│   ├── package.json          # Node dependencies
│   └── vite.config.js        # Vite configuration
├── docs/
│   ├── QUICKSTART.md         # Quick start guide
│   ├── DEPLOYMENT.md         # Railway deployment
│   └── USER_GUIDE.md         # User manual
├── README.md                 # Project overview
└── SETUP.md                  # This file
```

## Next Steps

1. ✅ Review this setup guide
2. ✅ Follow QUICKSTART.md to run locally
3. ✅ Read USER_GUIDE.md to understand features
4. ✅ Customize for your specific needs
5. ✅ Deploy to Railway using DEPLOYMENT.md
6. ✅ Train your team on the system

## Support

For questions or issues:
- Check documentation in `/docs`
- Review code comments
- Check Railway documentation
- Contact your development team

## License

Proprietary - Internal Use Only

---

**Ready to get started?** → See `docs/QUICKSTART.md`

