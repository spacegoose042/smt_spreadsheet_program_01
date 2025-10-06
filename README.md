# SMT Production Scheduler

A robust web application for managing SMT (Surface Mount Technology) production scheduling across multiple production lines.

## Features

- **Automated Scheduling**: Calculate minimum start dates based on ship dates, build times, and line capacity
- **Multi-Line Management**: Track 4 SMT lines + hand build operations
- **Intelligent Date Calculation**: Automatically accounts for weekends and line capacity
- **Trolley Management**: Monitor trolley usage with warnings at capacity
- **Priority System**: Override date-based scheduling with priority levels
- **Status Workflow**: Track jobs from "Clear to Build" through completion
- **Role-Based Access**: Schedulers, line operators, and management views
- **Completion Archive**: Track actual vs. estimated build times

## Tech Stack

- **Backend**: Python 3.11+ with FastAPI
- **Frontend**: React 18 with Vite
- **Database**: PostgreSQL 15+
- **Deployment**: Railway

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd smt_spreadsheet_program_01
```

2. Set up backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up frontend
```bash
cd frontend
npm install
```

4. Configure environment variables (see `.env.example`)

5. Run database migrations
```bash
cd backend
alembic upgrade head
```

6. Start development servers
```bash
# Terminal 1 - Backend
cd backend
uvicorn main:app --reload

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Deployment to Railway

See `docs/DEPLOYMENT.md` for detailed Railway deployment instructions.

## System Overview

### Scheduling Logic

1. User enters Work Order (WO) with Cetec Ship Date and build Time (minutes)
2. System calculates Actual Ship Date:
   - If "SMT ONLY": Actual = Cetec Ship Date - 7 days
   - Otherwise: Actual = Cetec Ship Date
3. System calculates MIN START DATE working backwards from Actual Ship Date:
   - Accounts for build time + setup time
   - Skips weekends
   - Uses line capacity (hours/day)
4. User assigns Line Position based on MIN START DATE and Priority

### Priority Levels

- **Critical Mass**: Top priority - runs immediately regardless of date
- **Overclocked**: Rush job - overrides normal scheduling
- **Factory Default**: Normal priority - scheduled by date
- **Trickle Charge**: Low priority - fills gaps in schedule
- **Power Down**: On hold - not actively scheduled

## License

Proprietary - Internal Use Only


