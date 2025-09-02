# BPApp

## Build frontend

Install dependencies and build the frontend bundle:

```bash
cd frontend
npm install
npm run build
```

The compiled files are output to `frontend/dist` and served by the backend in production.

## Production

Two supported paths: PM2 on a host, or Docker.

- Prerequisites
  - Node 20/22 LTS
  - Set env vars: copy `backend/.env.example` to `backend/.env` and fill values (BP_JWT_SECRET, CORS_ORIGIN, VAPID_*, SMTP_* as needed)

- Build frontend
  - `cd frontend && npm ci && npm run build`

- Migrate data to SQLite
  - `cd backend && npm ci && npm run migrate`

- Run with PM2
  - `pm2 start ecosystem.config.js --cwd backend && pm2 save`
  - Health: `GET /api/health` – Readiness: `GET /api/ready`

- Or run with Docker
  - Edit `docker-compose.yml` environment or create `.env`
  - `docker compose up -d --build`
  - Data persists in volume `bp-data`

- Reverse proxy (optional)
  - See `deploy/nginx.conf` or `deploy/Caddyfile`

Notes
- JWT secret is required in production; the server will exit if it uses the default.
- Static assets are served with long-lived cache; `index.html` is no-store.
- SQLite is configured with WAL and a busy timeout for concurrency.
