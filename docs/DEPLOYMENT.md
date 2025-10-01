# Deployment Guide for Railway

This guide will walk you through deploying the SMT Production Scheduler to Railway.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. Git repository with your code pushed to GitHub/GitLab
3. Basic familiarity with environment variables

## Deployment Steps

### 1. Create a New Project on Railway

1. Log in to Railway (https://railway.app)
2. Click "New Project"
3. Select "Empty Project"
4. Give it a name (e.g., "SMT Scheduler")

### 2. Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically provision a PostgreSQL database
4. The `DATABASE_URL` variable will be automatically available to other services

### 3. Deploy Backend Service

**Important**: You need to deploy backend and frontend as **separate services** pointing to different subdirectories.

#### Add Backend Service:

1. Click "New" → "GitHub Repo"
2. Select your repository
3. **After the service is created**, go to **Settings**
4. Under "Build & Deploy" → **Root Directory**, enter: `backend`
5. Under "Build & Deploy" → **Watch Paths**, enter: `backend/**`
6. Configure environment variables (see below)

#### Required Environment Variables

```bash
# Database (automatically set by Railway if you add PostgreSQL)
DATABASE_URL=<provided-by-railway>

# Security
SECRET_KEY=<generate-a-secure-random-string>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - Update with your frontend URL
FRONTEND_URL=https://your-frontend-url.railway.app

# Environment
ENVIRONMENT=production
```

#### Generate a Secure SECRET_KEY

```bash
# In terminal:
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Deploy Frontend Service

#### Add Frontend Service:

1. Click "New" in your Railway project
2. Select "GitHub Repo" (same repository again)
3. **After the service is created**, go to **Settings**
4. Under "Build & Deploy" → **Root Directory**, enter: `frontend`
5. Under "Build & Deploy" → **Watch Paths**, enter: `frontend/**`
6. Configure environment variables:

```bash
VITE_API_URL=https://your-backend-url.railway.app
```

**Note**: You'll need to update `VITE_API_URL` after the backend is deployed and has its URL.

### 5. Run Database Migrations

After your backend is deployed:

1. Go to your backend service in Railway
2. Click on "Settings" → "Deploy"
3. Add a custom start command (or use the one-time migration):

```bash
# One-time setup
alembic upgrade head && python seed_data.py

# Then update to normal start command
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Alternatively, you can run migrations from your local machine:

```bash
# Set DATABASE_URL to your Railway PostgreSQL URL
export DATABASE_URL="postgresql://..."

# Run migrations
cd backend
alembic upgrade head
python seed_data.py
```

### 6. Custom Domains (Optional)

Railway provides free `.railway.app` domains, but you can add custom domains:

1. Go to Settings for each service
2. Click "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

## Post-Deployment

### Verify Deployment

1. Visit your frontend URL
2. Check that the dashboard loads
3. Try creating a work order
4. Verify all pages work correctly

### Initial Setup

1. Log in with default credentials:
   - Username: `scheduler`
   - Password: `password123`

2. **IMPORTANT**: Change the default password immediately!

3. Configure your SMT lines in Settings

4. Add your first work orders

## Monitoring

Railway provides built-in monitoring:

1. View logs in real-time
2. Monitor resource usage
3. Set up alerts for downtime

## Troubleshooting

### Database Connection Errors

- Ensure `DATABASE_URL` is set correctly
- Check that PostgreSQL service is running
- Verify database migrations have run

### CORS Errors

- Update `FRONTEND_URL` in backend environment variables
- Ensure frontend is using correct `VITE_API_URL`

### Build Failures

**Backend:**
- Check `requirements.txt` is present
- Verify Python version in `runtime.txt`
- Review build logs for missing dependencies

**Frontend:**
- Ensure `package.json` is present
- Check Node version compatibility
- Verify all dependencies are listed

### Application Crashes

1. Check Railway logs for error messages
2. Verify all environment variables are set
3. Ensure database is accessible
4. Check for any pending migrations

## Environment Variable Reference

### Backend

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SECRET_KEY` | JWT secret key | `your-secret-key-here` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration | `30` |
| `FRONTEND_URL` | Frontend URL for CORS | `https://app.railway.app` |
| `ENVIRONMENT` | Environment name | `production` |

### Frontend

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.railway.app` |

## Scaling

Railway makes it easy to scale:

1. Go to service settings
2. Adjust "Replicas" for horizontal scaling
3. Upgrade plan for more resources

## Backup Strategy

### Database Backups

Railway automatically backs up PostgreSQL databases. For additional safety:

1. Set up periodic exports
2. Download backups locally
3. Use Railway's built-in backup restoration

### Application Data

- Export work orders regularly
- Keep a copy of completed jobs
- Document custom configurations

## Security Best Practices

1. **Change Default Passwords**: Update all default user passwords
2. **Use Strong Secrets**: Generate secure SECRET_KEY
3. **Enable HTTPS**: Railway provides this by default
4. **Limit CORS**: Set specific frontend URLs, not wildcards
5. **Regular Updates**: Keep dependencies up to date

## Support

- Railway Documentation: https://docs.railway.app
- Railway Community: https://discord.gg/railway
- Project Issues: [GitHub Issues](your-repo-url)

## Cost Estimation

Railway offers:
- Free tier: $5 credit/month
- Pro tier: Pay as you go

Typical usage for this app:
- Backend: ~$5-10/month
- Frontend: ~$2-5/month  
- PostgreSQL: ~$5/month

Total: ~$12-20/month for production use

