# Quick Start Guide

Get the SMT Production Scheduler running locally in minutes.

## Prerequisites

- **Python 3.11+** ([Download](https://www.python.org/downloads/))
- **Node.js 18+** ([Download](https://nodejs.org/))
- **PostgreSQL 15+** ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/downloads))

## Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd smt_spreadsheet_program_01
```

## Step 2: Set Up PostgreSQL Database

### Option A: Local PostgreSQL

```bash
# Create database
createdb smt_scheduler

# Or using psql
psql
CREATE DATABASE smt_scheduler;
\q
```

### Option B: Docker PostgreSQL

```bash
docker run --name smt-postgres \
  -e POSTGRES_DB=smt_scheduler \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15
```

## Step 3: Set Up Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smt_scheduler
SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
FRONTEND_URL=http://localhost:5173
ENVIRONMENT=development
EOF

# Run database migrations
alembic upgrade head

# Seed initial data (creates lines and default users)
python seed_data.py
```

## Step 4: Set Up Frontend

```bash
# Open a new terminal
cd frontend

# Install dependencies
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:8000" > .env
```

## Step 5: Start the Application

### Terminal 1 - Backend

```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn main:app --reload
```

Backend will run on: http://localhost:8000

### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

Frontend will run on: http://localhost:5173

## Step 6: Access the Application

1. Open your browser to: **http://localhost:5173**

2. Log in with default credentials:
   - **Username**: `scheduler`
   - **Password**: `password123`

3. **Important**: Change the default password!

## Default Users

Three users are created automatically:

| Username | Password | Role |
|----------|----------|------|
| scheduler | password123 | Full access |
| operator | password123 | View only |
| manager | password123 | View all |

## Verify Installation

### Check Backend API

Visit http://localhost:8000/docs for interactive API documentation (Swagger UI).

### Check Database

```bash
# Connect to database
psql smt_scheduler

# List tables
\dt

# Check SMT lines
SELECT * FROM smt_lines;

# Exit
\q
```

## Next Steps

1. **Configure Lines**: Go to Settings → Update line configurations
2. **Add Work Orders**: Click Schedule → Add Work Order
3. **View Dashboard**: Check real-time overview
4. **Read User Guide**: See `docs/USER_GUIDE.md` for detailed usage

## Troubleshooting

### Backend won't start

**Error**: `ModuleNotFoundError: No module named 'fastapi'`
- **Solution**: Make sure virtual environment is activated and dependencies installed
  ```bash
  source venv/bin/activate
  pip install -r requirements.txt
  ```

**Error**: `sqlalchemy.exc.OperationalError: connection refused`
- **Solution**: Ensure PostgreSQL is running
  ```bash
  # Check if PostgreSQL is running
  # macOS:
  brew services list
  # Linux:
  sudo systemctl status postgresql
  ```

### Frontend won't start

**Error**: `Cannot find module`
- **Solution**: 
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

### Database connection error

**Error**: `FATAL: database "smt_scheduler" does not exist`
- **Solution**: Create the database
  ```bash
  createdb smt_scheduler
  ```

**Error**: `FATAL: password authentication failed`
- **Solution**: Update `DATABASE_URL` in `.env` with correct credentials

### Can't see any lines in the app

**Solution**: Run the seed script
```bash
cd backend
python seed_data.py
```

### Port already in use

**Backend (Port 8000)**:
```bash
# Find process
lsof -i :8000
# Kill it
kill -9 <PID>
```

**Frontend (Port 5173)**:
```bash
# Find process
lsof -i :5173
# Kill it
kill -9 <PID>
```

## Development Tips

### Hot Reload

Both backend and frontend support hot reload:
- **Backend**: Changes to Python files auto-reload
- **Frontend**: Changes to React files auto-update in browser

### Database Reset

To reset the database:

```bash
cd backend

# Drop all tables
alembic downgrade base

# Recreate tables
alembic upgrade head

# Reseed data
python seed_data.py
```

### View Logs

**Backend logs**: Displayed in Terminal 1 where uvicorn is running

**Frontend logs**: Check browser console (F12 → Console tab)

### API Testing

Use the built-in Swagger UI at http://localhost:8000/docs to test API endpoints.

Example: Test creating a work order
1. Go to http://localhost:8000/docs
2. Find `POST /api/work-orders`
3. Click "Try it out"
4. Fill in the example data
5. Click "Execute"

## Ready for Production?

See `docs/DEPLOYMENT.md` for Railway deployment instructions.

## Need Help?

- Check `docs/USER_GUIDE.md` for detailed usage
- Review `docs/DEPLOYMENT.md` for production setup
- Check GitHub issues
- Contact your system administrator

