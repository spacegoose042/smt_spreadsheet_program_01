# Railway Deployment Settings - Quick Reference

## 🔴 IMPORTANT: After pushing these changes, configure Railway settings exactly as shown below

---

## Backend Service Settings

### Service → Settings → Build & Deploy

**Root Directory:**
```
backend
```

**Watch Paths:**
```
backend/**
```

**Custom Start Command:**
```
alembic upgrade head && python seed_data.py && uvicorn main:app --host 0.0.0.0 --port $PORT
```

**After first successful deploy, change to:**
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Service → Variables

```
DATABASE_URL = (auto-set by Railway when you add PostgreSQL)
SECRET_KEY = 0JezKbmnre8VUU12DYRApU0qZlnAMkxCtpHlTSnsmK0
ALGORITHM = HS256
ACCESS_TOKEN_EXPIRE_MINUTES = 30
FRONTEND_URL = https://your-frontend-url.railway.app
ENVIRONMENT = production
```

---

## Frontend Service Settings

### Service → Settings → Build & Deploy

**Root Directory:**
```
frontend
```

**Watch Paths:**
```
frontend/**
```

**Build Command:**
```
npm ci && npm run build
```

**Start Command:**
```
npx vite preview --host 0.0.0.0 --port $PORT
```

**Install Command:**
```
npm ci
```

### Service → Variables

```
VITE_API_URL = https://your-backend-url.railway.app
```

---

## ⚠️ Critical: Set These in Railway UI

The Caddy server logs you're seeing mean Railway is auto-detecting your app type. You need to **manually override** this:

### For Frontend Service:

1. Go to **Settings** tab
2. Scroll to **Build & Deploy** section
3. **CRITICAL**: Set these fields **manually**:
   - ✅ Root Directory: `frontend`
   - ✅ Build Command: `npm ci && npm run build`
   - ✅ Start Command: `npx vite preview --host 0.0.0.0 --port $PORT`
   - ✅ Install Command: `npm ci`

### For Backend Service:

1. Go to **Settings** tab
2. Scroll to **Build & Deploy** section
3. Set these fields:
   - ✅ Root Directory: `backend`
   - ✅ Start Command: (see above - includes migrations)

---

## 🔄 After Setting These

1. **Commit and push** the updated files:
   ```bash
   git add .
   git commit -m "Fix frontend deployment configuration"
   git push
   ```

2. **Manually trigger redeploy** in Railway:
   - Go to each service
   - Click "Deployments" tab
   - Click "..." on latest deployment
   - Click "Redeploy"

---

## 🐛 If Frontend Still Shows Caddy Logs

This means Railway is still auto-detecting it as a static site. To fix:

1. Delete the frontend service completely
2. Create a new service from GitHub
3. Immediately go to Settings (before it finishes building)
4. Set all the settings above
5. Let it build

---

## ✅ How to Verify It's Working

### Backend:
- Visit: `https://your-backend-url.railway.app`
- Should show: `{"status":"ok","message":"SMT Production Scheduler API"}`

### Frontend:
- Visit: `https://your-frontend-url.railway.app`
- Should show: Login page with SMT Scheduler branding

---

## 📞 Still Having Issues?

Check the deployment logs:

**If you see Caddy logs (admin endpoint, HTTPS disabled, etc.):**
- ❌ Railway is ignoring your start command
- ✅ Fix: Manually set start command in Settings as shown above

**If you see "Module not found" errors:**
- ❌ Dependencies not installed
- ✅ Fix: Check Root Directory is correct

**If you see "Cannot find module 'vite'":**
- ❌ Build didn't run or node_modules missing
- ✅ Fix: Set Build Command to `npm ci && npm run build`

**If frontend shows blank page:**
- ❌ API URL not set or CORS issue
- ✅ Fix: Check VITE_API_URL is set and FRONTEND_URL in backend matches

