# SSMS — Silkworm Smart Management System

A full-stack web application for managing silkworm farming operations — tracking farms, batches, lifecycle stages, sensor readings, disease detections, and automated alerts.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Django 5 · Django REST Framework |
| Auth | djangorestframework-simplejwt |
| Database | PostgreSQL |
| Frontend | React 18 · TypeScript · Vite |
| HTTP Client | Axios |
| Routing | React Router v6 |

## Project Structure

```
ssms_django/
├── manage.py
├── requirements.txt
├── .env.example
├── ssms_django/          # Django config package (settings, urls, wsgi)
├── core/                 # Shared utilities: response helpers, auth backend
├── users/                # Custom user model, JWT auth endpoints
├── farms/                # Farm CRUD with role-based access
├── batches/              # Silkworm batch lifecycle management
├── sensors/              # Sensor readings and disease detection records
├── alerts/               # Alert logging and read-state tracking
└── frontend/             # React + Vite SPA
    └── src/
        ├── pages/        # auth/, farmer/, admin/, supervisor/
        ├── components/ui/
        ├── services/     # Axios API service functions
        ├── context/      # AuthContext (JWT session management)
        └── hooks/        # useFarms, useBatches
```

## Quick Start

### Backend

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # then fill in your values
python manage.py migrate
python manage.py runserver 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173
```

## API Reference

Base URL: `http://localhost:8000/api`

All responses follow the envelope: `{ "success": bool, "message": str, "data": any }`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Register new user |
| POST | `/auth/login` | — | Login, receive JWT |
| GET | `/auth/me` | JWT | Current user profile |
| GET | `/farms/` | JWT | List farms (role-filtered) |
| POST | `/farms/` | JWT FARMER/ADMIN | Create farm |
| GET | `/farms/<id>` | JWT | Farm detail + batches |
| PATCH | `/farms/<id>` | JWT FARMER/ADMIN | Update farm |
| DELETE | `/farms/<id>` | JWT FARMER/ADMIN | Soft delete farm |
| POST | `/batches/` | JWT FARMER/ADMIN | Create batch |
| GET | `/batches/farm/<farmId>` | JWT | Batches for a farm |
| GET | `/batches/<id>` | JWT | Batch detail |
| PATCH | `/batches/<id>/stage` | JWT FARMER/ADMIN | Advance lifecycle stage |
| DELETE | `/batches/<id>` | JWT FARMER/ADMIN | Archive batch |
| POST | `/sensors/` | JWT | Record sensor reading |
| GET | `/sensors/batch/<batchId>` | JWT | Last 100 readings |
| GET | `/alerts/batch/<batchId>` | JWT | Alerts for batch |
| PATCH | `/alerts/<id>/read` | JWT | Mark alert as read |
| GET | `/health/` | — | Health check |

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ssms.rw | Admin@1234 |
| Supervisor | supervisor@ssms.rw | Farmer@1234 |
| Farmer | farmer@ssms.rw | Farmer@1234 |

## Roles & Permissions

| Action | FARMER | SUPERVISOR | ADMIN |
|--------|--------|-----------|-------|
| View own farms | ✅ | ✅ (all) | ✅ (all) |
| Create/edit farm | ✅ | ❌ | ✅ |
| Manage batches | ✅ | ❌ | ✅ |
| Record sensor data | ✅ | ✅ | ✅ |
| View all data | ❌ | ✅ | ✅ |
