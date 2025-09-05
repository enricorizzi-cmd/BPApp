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

## PostgreSQL configuration

Set `PG_URL` or `DATABASE_URL` to enable PostgreSQL storage, for example:

```
PG_URL=postgres://user:pass@host:5432/dbname
```

Additional environment variables:

- `PG_FORCE_IPV4` (default `1`): resolve only IPv4 addresses; set to `0` to allow IPv6.
- `PG_HOST_IPV4`: explicit IPv4 address to use instead of DNS resolution.
- `PG_SSL_REJECT_UNAUTHORIZED` (default `true`): set to `false` to accept self-signed certificates.
- `PG_CONN_RETRIES` (default `3`): number of connection attempts before failing.
- `PG_CONN_RETRY_DELAY_MS` (default `1000`): delay between retry attempts in milliseconds.

Test connectivity before starting the backend:

```
psql -h <host> -p <port> -U <user> <db>
```

Notes
- JWT secret is required in production; the server will exit if it uses the default.
- Static assets are served with long-lived cache; `index.html` is no-store.
- SQLite is configured with WAL and a busy timeout for concurrency.

## Import KPIs from CSV

The backend includes a helper script to load KPI values from a CSV file and create/update BP periods.

```
cd backend
node jobs/import-bp-csv.js path/to/file.csv [--dry-run]
```

The CSV must have the header:

```
kpi,Data,settimana,mese,anno,CONSULENTE,VALORE
```

For each consultant and period the script authenticates using credentials in `backend/data/users.json` and calls `POST /api/periods`. Use `--dry-run` to inspect the derived periods without performing any write.

## Grafici: Granularità e Etichette

- Settimanale: 53 settimane ISO (lun–dom) fino alla settimana corrente; etichette `W<numero> <anno>` (es. `W37 2024 … W36 2025`).
- Mensile: ultimi 24 mesi fino al mese corrente; etichette `MM/YYYY` (es. `10/2023 … 09/2025`).
- YTD (Anno corrente): solo BP mensili da gennaio all’attuale; numero di punti = mese corrente.
- LTM (Ultimi 12 mesi): solo BP mensili, ultimi 12 mesi (es. se mese corrente è 09/2025 → `10/2024 … 09/2025`).
- Trimestrale: ultimi 12 trimestri; etichette `Qn YYYY`.
- Semestrale: ultimi 6 semestri; etichette `S1 YYYY`/`S2 YYYY`.
- Annuale: ultimi 3 anni; etichetta `YYYY`.

Dashboard e Squadra usano gli stessi bucket e formati etichetta; le serie non mostrano più indici 1..N ma etichette reali dei periodi.

### Smoke test locale etichette

Esegui la stampa di esempio delle etichette per ogni granularità:

```
node scripts/print-buckets.js
```
