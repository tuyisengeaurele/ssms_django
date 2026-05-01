# SSMS API Reference

**Base URL:** `http://localhost:8000/api`  
**Version:** 1.0.0  
**Auth:** Bearer JWT (include in every protected request as `Authorization: Bearer <token>`)  
**Content-Type:** `application/json`  
**Response format:** All keys are **camelCase**. All responses share the same envelope:

```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { }
}
```

---

## Table of Contents

1. [Health](#1-health)
2. [Auth](#2-auth)
3. [Farms](#3-farms)
4. [Batches](#4-batches)
5. [Sensors](#5-sensors)
6. [Alerts](#6-alerts)
7. [Error Codes](#7-error-codes)
8. [Roles & Permissions](#8-roles--permissions)

---

## 1. Health

### `GET /api/health/`

No auth required. Use to verify the server is running.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": null
}
```

---

## 2. Auth

### `POST /api/auth/register`

Create a new user account. Returns a JWT token on success.

**Request Body**
| Field    | Type   | Required | Rules                                           |
|----------|--------|----------|-------------------------------------------------|
| name     | string | Yes      | max 100 chars                                   |
| email    | string | Yes      | unique, lowercased                              |
| password | string | Yes      | min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit |
| role     | string | No       | `ADMIN` \| `SUPERVISOR` \| `FARMER` (default: `FARMER`) |

**Example Request**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Secret123",
  "role": "FARMER"
}
```

**Response 201**
```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "user": {
      "id": "c196a3f2e4b0000abcd1234567890abc",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "FARMER",
      "createdAt": "2026-05-01T10:00:00Z",
      "updatedAt": "2026-05-01T10:00:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 422    | Validation failed (weak password, duplicate email, missing fields) |

---

### `POST /api/auth/login`

Authenticate an existing user. Returns a JWT token.

**Request Body**
| Field    | Type   | Required |
|----------|--------|----------|
| email    | string | Yes      |
| password | string | Yes      |

**Example Request**
```json
{
  "email": "jane@example.com",
  "password": "Secret123"
}
```

**Response 200**
```json
{
  "success": true,
  "message": "Logged in successfully.",
  "data": {
    "user": {
      "id": "c196a3f2e4b0000abcd1234567890abc",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "FARMER",
      "createdAt": "2026-05-01T10:00:00Z",
      "updatedAt": "2026-05-01T10:00:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 401    | Invalid email or password |
| 422    | Missing/malformed fields |

---

### `GET /api/auth/me`

🔒 **Auth required.** Returns the currently authenticated user's profile.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "c196a3f2e4b0000abcd1234567890abc",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "FARMER",
    "createdAt": "2026-05-01T10:00:00Z",
    "updatedAt": "2026-05-01T10:00:00Z"
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 401    | Missing or invalid token |

---

## 3. Farms

All farm endpoints require authentication.

**Farm object shape:**
```json
{
  "id": "c196a3f2e4b0000abcd1234567890abc",
  "name": "Green Valley Farm",
  "location": "Kigali, Rwanda",
  "ownerId": "c196a3f2e4b0000abcd1234567890abc",
  "isActive": true,
  "createdAt": "2026-05-01T10:00:00Z",
  "updatedAt": "2026-05-01T10:00:00Z",
  "owner": { "id": "...", "name": "Jane Doe", "email": "jane@example.com" },
  "_count": { "batches": 3 }
}
```

---

### `GET /api/farms/`

🔒 **Auth required.** List farms. FARMERs see only their own farms; ADMIN/SUPERVISOR see all active farms.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": [ { ...farm }, { ...farm } ]
}
```

---

### `POST /api/farms/`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`.

**Request Body**
| Field    | Type   | Required |
|----------|--------|----------|
| name     | string | Yes      |
| location | string | Yes      |

**Example Request**
```json
{
  "name": "Green Valley Farm",
  "location": "Kigali, Rwanda"
}
```

**Response 201**
```json
{
  "success": true,
  "message": "Farm created.",
  "data": { ...farm }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 422    | Missing name or location |

---

### `GET /api/farms/<id>`

🔒 **Auth required.** Returns detailed farm info including active batches.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "...",
    "name": "Green Valley Farm",
    "location": "Kigali, Rwanda",
    "ownerId": "...",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "...",
    "owner": { "id": "...", "name": "Jane Doe", "email": "jane@example.com" },
    "_count": { "batches": 2 },
    "batches": [ { ...batch }, { ...batch } ]
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Farm not found or not owned by FARMER |

---

### `PATCH /api/farms/<id>`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`. Partial update — send only fields you want to change.

**Request Body** (all optional)
| Field    | Type   |
|----------|--------|
| name     | string |
| location | string |

**Response 200**
```json
{
  "success": true,
  "message": "Farm updated.",
  "data": { ...farm }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 404    | Farm not found |
| 422    | Validation failed |

---

### `DELETE /api/farms/<id>`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`. Soft-deletes the farm (sets `isActive = false`).

**Response 200**
```json
{
  "success": true,
  "message": "Farm deleted.",
  "data": null
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 404    | Farm not found |

---

## 4. Batches

All batch endpoints require authentication.

**Batch object shape (list):**
```json
{
  "id": "c196a3f2e4b0000abcd1234567890abc",
  "farmId": "...",
  "stage": "HATCHING",
  "startDate": "2026-05-01T10:00:00Z",
  "expectedHarvestDate": "2026-06-01T10:00:00Z",
  "notes": "First batch of the season",
  "isActive": true,
  "createdAt": "2026-05-01T10:00:00Z",
  "updatedAt": "2026-05-01T10:00:00Z",
  "_count": {
    "diseaseDetections": 0,
    "sensorReadings": 12,
    "alertLogs": 3
  }
}
```

**Batch stages (in order):**
`HATCHING` → `FIRST_INSTAR` → `SECOND_INSTAR` → `THIRD_INSTAR` → `FOURTH_INSTAR` → `FIFTH_INSTAR` → `COCOONING` → `HARVESTED`

---

### `POST /api/batches/`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`.

**Request Body**
| Field               | Type     | Required |
|---------------------|----------|----------|
| farmId              | string   | Yes      |
| expectedHarvestDate | datetime | Yes      |
| notes               | string   | No       |

**Example Request**
```json
{
  "farmId": "c196a3f2e4b0000abcd1234567890abc",
  "expectedHarvestDate": "2026-06-01T00:00:00Z",
  "notes": "First batch of the season"
}
```

**Response 201**
```json
{
  "success": true,
  "message": "Batch created.",
  "data": { ...batch }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 404    | Farm not found |
| 422    | Missing required fields |

---

### `GET /api/batches/farm/<farmId>`

🔒 **Auth required.** Returns all active batches for a given farm.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": [ { ...batch }, { ...batch } ]
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Farm not found |

---

### `GET /api/batches/<id>`

🔒 **Auth required.** Returns detailed batch info including latest sensor readings, disease detections, and unread alerts.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": "...",
    "farmId": "...",
    "stage": "HATCHING",
    "startDate": "...",
    "expectedHarvestDate": "...",
    "notes": "...",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "...",
    "farm": { "id": "...", "name": "Green Valley Farm", "location": "Kigali" },
    "diseaseDetections": [ { ...detection } ],
    "sensorReadings": [ { ...reading } ],
    "alertLogs": [ { ...alert } ]
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Batch not found |

---

### `DELETE /api/batches/<id>`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`. Soft-deletes the batch.

**Response 200**
```json
{
  "success": true,
  "message": "Batch deleted.",
  "data": null
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 404    | Batch not found |

---

### `PATCH /api/batches/<id>/stage`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`. Updates batch stage and automatically creates a `STAGE_CHANGE` alert log.

**Request Body**
| Field | Type   | Required | Values |
|-------|--------|----------|--------|
| stage | string | Yes      | Any valid `BatchStage` value |

**Example Request**
```json
{
  "stage": "FIRST_INSTAR"
}
```

**Response 200**
```json
{
  "success": true,
  "message": "Stage updated.",
  "data": { ...batch }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 403    | SUPERVISOR role |
| 404    | Batch not found |
| 422    | Invalid stage value |

---

## 5. Sensors

All sensor endpoints require authentication.

**SensorReading object shape:**
```json
{
  "id": "c196a3f2e4b0000abcd1234567890abc",
  "batchId": "...",
  "temperature": 26.5,
  "humidity": 72.3,
  "timestamp": "2026-05-01T10:00:00Z"
}
```

---

### `POST /api/sensors/`

🔒 **Auth required.** Roles: `FARMER`, `ADMIN`, `SUPERVISOR`. Record a new sensor reading.

**Request Body**
| Field       | Type  | Required | Rules            |
|-------------|-------|----------|------------------|
| batchId     | string| Yes      |                  |
| temperature | float | Yes      | -10 to 60 (°C)  |
| humidity    | float | Yes      | 0 to 100 (%)    |

**Example Request**
```json
{
  "batchId": "c196a3f2e4b0000abcd1234567890abc",
  "temperature": 26.5,
  "humidity": 72.3
}
```

**Response 201**
```json
{
  "success": true,
  "message": "Sensor reading recorded.",
  "data": {
    "id": "...",
    "batchId": "...",
    "temperature": 26.5,
    "humidity": 72.3,
    "timestamp": "2026-05-01T10:00:00Z"
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Batch not found |
| 422    | Temperature or humidity out of range |

---

### `GET /api/sensors/batch/<batchId>`

🔒 **Auth required.** Returns the latest 100 sensor readings for a batch, newest first.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": [ { ...reading }, { ...reading } ]
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Batch not found |

---

## 6. Alerts

All alert endpoints require authentication.

**AlertLog object shape:**
```json
{
  "id": "c196a3f2e4b0000abcd1234567890abc",
  "batchId": "...",
  "type": "STAGE_CHANGE",
  "message": "Batch stage updated to FIRST_INSTAR.",
  "isRead": false,
  "createdAt": "2026-05-01T10:00:00Z"
}
```

**Alert types:** `STAGE_CHANGE` | `DISEASE_DETECTED` | `SENSOR_ALERT` | `SYSTEM`

---

### `GET /api/alerts/batch/<batchId>`

🔒 **Auth required.** Returns all alert logs for a batch, newest first.

**Response 200**
```json
{
  "success": true,
  "message": "OK",
  "data": [ { ...alert }, { ...alert } ]
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Batch not found |

---

### `PATCH /api/alerts/<id>/read`

🔒 **Auth required.** Marks an alert as read.

**Request Body:** None required.

**Response 200**
```json
{
  "success": true,
  "message": "Alert marked as read.",
  "data": {
    "id": "...",
    "batchId": "...",
    "type": "STAGE_CHANGE",
    "message": "Batch stage updated to FIRST_INSTAR.",
    "isRead": true,
    "createdAt": "2026-05-01T10:00:00Z"
  }
}
```

**Error Responses**
| Status | Condition |
|--------|-----------|
| 404    | Alert not found |

---

## 7. Error Codes

| HTTP Status | Meaning                        | Example                              |
|-------------|--------------------------------|--------------------------------------|
| 200         | Success                        | Resource fetched / updated           |
| 201         | Created                        | Resource created                     |
| 401         | Unauthorized                   | Missing/invalid token or credentials |
| 403         | Forbidden                      | Insufficient role permissions        |
| 404         | Not Found                      | Resource does not exist              |
| 422         | Unprocessable Entity           | Validation failed                    |
| 500         | Internal Server Error          | Unexpected server error              |

**Error response envelope:**
```json
{
  "success": false,
  "message": "Farm not found.",
  "data": null
}
```

**Validation error (422) includes field-level details:**
```json
{
  "success": false,
  "message": "Validation failed.",
  "data": {
    "email": ["An account with this email already exists."],
    "password": ["Password must contain at least one uppercase letter."]
  }
}
```

---

## 8. Roles & Permissions

| Endpoint                          | ADMIN | SUPERVISOR | FARMER |
|-----------------------------------|:-----:|:----------:|:------:|
| POST /api/auth/register           | ✅    | ✅         | ✅     |
| POST /api/auth/login              | ✅    | ✅         | ✅     |
| GET  /api/auth/me                 | ✅    | ✅         | ✅     |
| GET  /api/farms/                  | All   | All        | Own    |
| POST /api/farms/                  | ✅    | ❌         | ✅     |
| GET  /api/farms/:id               | All   | All        | Own    |
| PATCH /api/farms/:id              | ✅    | ❌         | Own    |
| DELETE /api/farms/:id             | ✅    | ❌         | Own    |
| POST /api/batches/                | ✅    | ❌         | Own    |
| GET  /api/batches/farm/:farmId    | ✅    | ✅         | Own    |
| GET  /api/batches/:id             | ✅    | ✅         | Own    |
| DELETE /api/batches/:id           | ✅    | ❌         | Own    |
| PATCH /api/batches/:id/stage      | ✅    | ❌         | Own    |
| POST /api/sensors/                | ✅    | ✅         | ✅     |
| GET  /api/sensors/batch/:batchId  | ✅    | ✅         | ✅     |
| GET  /api/alerts/batch/:batchId   | ✅    | ✅         | ✅     |
| PATCH /api/alerts/:id/read        | ✅    | ✅         | ✅     |

> **Own** = FARMER can only access resources where they are the farm owner.
