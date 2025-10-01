# Railway Deployment - Step by Step Guide

## ⚠️ Important: Deploy Backend and Frontend as SEPARATE Services

Railway needs you to create **3 services** in your project:
1. PostgreSQL Database
2. Backend Service (pointing to `/backend` folder)
3. Frontend Service (pointing to `/frontend` folder)

---

## Step 1: Push Code to GitHub

```bash
cd /Users/mattspacegrey/Documents/GitHub/smt_spreadsheet_program_01

# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - SMT Scheduler"

# Push to GitHub
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

---

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Empty Project"**
5. Give it a name: **"SMT Scheduler"**

---

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Wait for it to provision (30 seconds)
4. ✅ Done! The `DATABASE_URL` will be automatically available to other services

---

## Step 4: Deploy Backend Service

### 4.1 Add the Service

1. Click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose your repository
4. Railway will start building (it will FAIL - that's expected!)

### 4.2 Configure Root Directory

1. Click on the backend service card
2. Go to **"Settings"** tab
3. Scroll to **"Service"** section
4. Under **"Root Directory"**, enter: `backend`
5. Under **"Watch Paths"**, enter: `backend/**`

### 4.3 Add Environment Variables

Still in Settings, scroll to **"Variables"** section and add:

```
SECRET_KEY = <generate-with-command-below>
ALGORITHM = HS256
ACCESS_TOKEN_EXPIRE_MINUTES = 30
FRONTEND_URL = https://your-frontend-url.railway.app
ENVIRONMENT = production
```

**Generate SECRET_KEY** (run on your local machine):
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4.4 Get Backend URL

1. Go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `https://smt-backend-production.up.railway.app`)
4. **Save this URL** - you'll need it for the frontend!

### 4.5 Run Database Migrations

1. Go to **"Settings"** → **"Deploy"**
2. Find **"Custom Start Command"**
3. Enter: `alembic upgrade head && python seed_data.py && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. **Important**: This will run migrations once, then start the server

**OR** run migrations from your local machine:
```bash
# On your local machine
export DATABASE_URL="<copy-from-railway-postgres-variables>"
cd backend
alembic upgrade head
python seed_data.py
```

Then change start command back to:
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 4.6 Redeploy

1. Go to **"Deployments"** tab
2. Click the **"..."** menu on the latest deployment
3. Click **"Redeploy"**

---

## Step 5: Deploy Frontend Service

### 5.1 Add the Service

1. In your Railway project (main view), click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose the **SAME repository** again
4. Railway will start building (it will FAIL - that's expected!)

### 5.2 Configure Root Directory

1. Click on the frontend service card
2. Go to **"Settings"** tab
3. Under **"Root Directory"**, enter: `frontend`
4. Under **"Watch Paths"**, enter: `frontend/**`

### 5.3 Add Environment Variables

In Variables section, add:

```
VITE_API_URL = https://your-backend-url.railway.app
```

Replace with the backend URL you saved in Step 4.4.

### 5.4 Generate Frontend Domain

1. Go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. Copy the URL (e.g., `https://smt-frontend-production.up.railway.app`)

### 5.5 Update Backend CORS

Now go **back to the backend service**:

1. Click on backend service card
2. Go to **"Variables"**
3. Update `FRONTEND_URL` to your frontend URL from Step 5.4
4. The backend will automatically redeploy

### 5.6 Redeploy Frontend

1. Go to frontend service **"Deployments"** tab
2. Click **"..."** → **"Redeploy"**

---

## Step 6: Verify Deployment

1. Open your frontend URL in a browser
2. You should see the SMT Scheduler login page
3. Login with:
   - **Username**: `scheduler`
   - **Password**: `password123`

4. Test:
   - ✅ Dashboard loads
   - ✅ Can view lines
   - ✅ Can create a work order
   - ✅ Can view completed jobs

---

## Step 7: Update Backend Start Command (After First Deploy)

After the first successful deploy with migrations:

1. Go to backend service → **Settings** → **Deploy**
2. Change **Custom Start Command** to just:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
3. This prevents running migrations on every deploy

---

## Troubleshooting

### Backend Build Fails

**Error**: "No module named 'fastapi'"
- ✅ **Fix**: Make sure `Root Directory` is set to `backend`

**Error**: "Cannot find requirements.txt"
- ✅ **Fix**: Make sure `Root Directory` is set to `backend` (not `/backend`)

### Frontend Build Fails

**Error**: "Cannot find package.json"
- ✅ **Fix**: Make sure `Root Directory` is set to `frontend`

**Error**: "Command 'preview' not found"
- ✅ **Fix**: Make sure you have the `nixpacks.toml` file in the frontend folder

### Database Connection Error

**Error**: "Connection refused" or "Database doesn't exist"
- ✅ **Fix**: Make sure PostgreSQL service is running
- ✅ **Fix**: Run migrations: `alembic upgrade head && python seed_data.py`

### Frontend Can't Connect to Backend

**Error**: "Network Error" or "Failed to fetch"
- ✅ **Fix**: Check `VITE_API_URL` in frontend variables matches backend URL
- ✅ **Fix**: Check `FRONTEND_URL` in backend variables matches frontend URL
- ✅ **Fix**: Make sure both services have generated domains

### CORS Errors

**Error**: "CORS policy: No 'Access-Control-Allow-Origin' header"
- ✅ **Fix**: Update `FRONTEND_URL` in backend environment variables
- ✅ **Fix**: Make sure backend redeployed after updating FRONTEND_URL

---

## Your Railway Project Structure Should Look Like:

```
SMT Scheduler (Project)
├── postgres (Database)
│   └── DATABASE_URL available to all services
│
├── smt-backend (Service)
│   ├── Root Directory: backend
│   ├── Watch Paths: backend/**
│   └── Environment Variables:
│       ├── DATABASE_URL (auto from postgres)
│       ├── SECRET_KEY
│       ├── FRONTEND_URL
│       └── ...
│
└── smt-frontend (Service)
    ├── Root Directory: frontend
    ├── Watch Paths: frontend/**
    └── Environment Variables:
        └── VITE_API_URL
```

---

## Quick Reference

### Backend Environment Variables
```
DATABASE_URL = (automatically set by Railway)
SECRET_KEY = (generate with: python -c "import secrets; print(secrets.token_urlsafe(32))")
ALGORITHM = HS256
ACCESS_TOKEN_EXPIRE_MINUTES = 30
FRONTEND_URL = https://your-frontend.railway.app
ENVIRONMENT = production
```

### Frontend Environment Variables
```
VITE_API_URL = https://your-backend.railway.app
```

### Start Commands

**Backend** (after first deploy):
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

**Backend** (first deploy with migrations):
```
alembic upgrade head && python seed_data.py && uvicorn main:app --host 0.0.0.0 --port $PORT
```

**Frontend** (default - no custom command needed):
```
npm run preview -- --host 0.0.0.0 --port $PORT
```

---

## Cost Estimate

- PostgreSQL: ~$5/month
- Backend Service: ~$5-10/month
- Frontend Service: ~$2-5/month
- **Total: ~$12-20/month**

Railway offers $5 free credit/month for testing.

---

## Next Steps After Deployment

1. ✅ **Change default passwords** immediately!
2. ✅ Configure your production lines in Settings
3. ✅ Import/migrate existing work orders
4. ✅ Train your team
5. ✅ Set up regular database backups
6. ✅ Monitor the application

---

## Need Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check logs in Railway dashboard for error messages

