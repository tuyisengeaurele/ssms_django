# SSMS: Smart Sericulture Management System

A full-stack web application for managing silkworm farming operations. It tracks farms, batches, lifecycle stages, sensor readings, disease detections, and automated alerts.

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

The API describes itself. Start the server and open:

- **Swagger page:** `http://localhost:8000/api/docs/` (on the live site, `/api/docs/` on the website address)
- **OpenAPI schema:** `http://localhost:8000/api/schema/` (JSON, for Postman, Insomnia or a client generator)

Every route is listed with what it does, who may call it (Farmer, Supervisor, Admin, read from the same table the server enforces), whether it needs a sign in, and which errors it can answer. Base URL: `http://localhost:8000/api`.

All responses follow one envelope: `{ "success": bool, "message": str, "data": any }`. A refusal is `{ "success": false, "message": str, "reference": str, "errors"?: {}, "code"?: str }`. Field names are camelCase.

To get a YAML file: `python manage.py spectacular --file openapi.yaml`. To switch the docs off: `API_DOCS_ENABLED=false`.

## Demo Accounts

There are no fixed demo logins. Build the demo data with a command and it prints the sign in details once:

```bash
python manage.py seed_demo            # a month of data, a strong random password is printed at the end
python manage.py seed_demo --reset    # throw the demo data away and build it again
```

It makes one supervisor (`supervisor@demo.ssms.rw`) and three farmers (`farmer1@demo.ssms.rw` to `farmer3@demo.ssms.rw`) in a demo cooperative. Only those rows are touched. There is no demo admin: make your own with `python manage.py createsuperuser`.

## Roles & Permissions

| Action | FARMER | SUPERVISOR | ADMIN |
|--------|--------|-----------|-------|
| View own farms | ✅ | ✅ (all) | ✅ (all) |
| Create/edit farm | ✅ | ❌ | ✅ |
| Manage batches | ✅ | ❌ | ✅ |
| Record sensor data | ✅ | ✅ | ✅ |
| View all data | ❌ | ✅ | ✅ |
