# Audit Trail DBMS (Express + MongoDB + Vanilla JS)

An Audit Trail DBMS that records **who did what, when, from where, and with what result**. It supports secure authentication, role-based access control, append-only audit logs (enforced at the database level), filtering/searching, CSV export, employee CRUD (sample entity), and admin security monitoring (auto-block on suspicious deletion bursts).

## Features

- **MongoDB-backed append-only audit log** (`audit_logs`) (application enforces append-only)
- **Auth**: username/password with **bcrypt** hashing
- **RBAC**: `admin` can view/export/filter logs and manage security alerts; `staff` cannot access the audit logs page/APIs
- **Employee CRUD**: create/update/delete employees with audit logging including `old_values`/`new_values`
- **Admin dashboards**: employee dashboard + audit log viewer + security panel
- **Suspicious activity**
  - Multiple failed logins from same IP+username within 10 minutes → status `SUSPICIOUS`
  - Excess employee deletions (≥3 within 60s) → account auto-block + security alert

## Project Structure

```
audit-trail-system/
  backend/
  frontend/
  database/
  README.md
```

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Seeded credentials (via seed script)

- Admin: `prakhar agarwal` / `admin123`
- Staff: `riya malhotra` / `staff123`
- Staff: `om panwar mantra` / `staff123`
- Staff: `nishika` / `staff123`

## Backend Setup (Node.js + Express)

From `audit-trail-system/backend/`:

```bash
npm install
```

Create environment variables:

```bash
cp .env.example .env
# put your MongoDB Atlas URI in .env (backend reads backend/.env)
```

Seed the database (creates users + sample employees):

```bash
node scripts/seed.js
```

Run the backend:

```bash
npm start
```

Open:

- Login: http://127.0.0.1:<PORT>/
- Dashboard: http://127.0.0.1:<PORT>/dashboard
- Audit logs (admin): http://127.0.0.1:<PORT>/audit-logs

## Frontend

The frontend is static HTML/CSS/JS in `frontend/` and is served by the Express app for convenience.

## API Summary

Authentication:

- `POST /api/login`
- `POST /api/logout`
- `POST /api/register` (admin only)
- `GET /api/me`
- Aliases: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`

Admin logs:

- `GET /api/logs`
- `GET /api/logs/filter?user=&action=&start=&end=`
- `GET /api/logs/search?q=keyword`
- `GET /api/logs/export.csv` (supports `user`, `action`, `start`, `end`, `q`)
- Aliases: `GET /api/audit/logs` (+ `/filter`, `/search`)

Employees:

- `GET /api/employees?search=&department=`
- `POST /api/employees`
- `PUT /api/employees`
- `DELETE /api/employees?id=`

Security (admin):

- `GET /api/admin/security`
- `POST /api/admin/security` with `{ "action": "unblock", "user_id": 123 }` or `{ "action": "mark_read", "alert_id": 456 }`

## Notes on Log Integrity

- Audit logs are **append-only at the application level**: the backend never exposes endpoints to update/delete audit logs.
- For stronger guarantees in production, run MongoDB with restricted roles that disallow deletes/updates on the `auditlogs` collection.

## Local Troubleshooting

- If you see DB connection errors, verify `MONGO_URI` in `backend/.env` and your Atlas IP allowlist.
- If login fails for seeded users, re-run `node scripts/seed.js` from `backend/`.
