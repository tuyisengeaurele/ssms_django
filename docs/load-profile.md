# Load profile: what the API does with a real deployment's worth of data

Measured on 2026-11-20 with `scripts/seed_load_data.py` and `scripts/profile_endpoints.py`. This is the baseline to compare every later
change with. Rerun both after a change and put the new table next to this one.

## The data
5 cooperatives, 200 farmers with a farm each, 400 rooms with a sensor each, 1,000 batches (2 running and 3 harvested per farm),
288,400 hourly readings (30 days), 3,651 alerts, 1,400 disease checks, 600 harvest records, 5 open rounds with 54 requests. A farmer
owns 1 farm and 5 batches, a supervisor sees 40 farms and 200 batches, an admin sees all of it.

## How it was measured
In one process, with real access tokens, against PostgreSQL on the same machine. Each page is asked for once to warm up, then 7 times
(2 or 3 when a page takes seconds). The report cache is cleared before each request, so the report itself is timed. A single query
is cancelled after 20 seconds, and the page then answers 500: a 500 below means the page could not finish, not that it broke.

Because the database is on the same machine here, a query costs almost nothing. In production each query is a round trip to a
database in another country (Render in Frankfurt, Supabase in Ireland, about 25 ms). The last column adds 25 ms for each query to the
median, and **an endpoint is called slow when that estimate is over 300 ms.**

## What is slow, and why

### 1. The reading counts (critical)
| Page | Time |
|---|---|
| Farmer, `/api/farms` (their one farm) | 16.3 s |
| Farmer, `/api/farms/{id}` | 15.8 s |
| Farmer, `/api/batches/farm/{id}` | 14.3 s |
| Farmer, `/api/batches/compare` | 5.6 s |
| Supervisor and admin, `/api/farms` | over 20 s, cancelled (a first try ran for 160 s) |
| Supervisor and admin, `/api/batches/active` | over 20 s, cancelled |

All of them spend their time in the database, in a handful of queries. The cause is one query shape: a batch's readings are those of
the rooms it stayed in, written as a test run against every reading (`belongs_to_batch` in `sensors/room_readings.py`, used by
`batches/queries.py` for the count on each batch, and by the newest reading on the active batches list). The database cannot use an
index for that, so each batch costs a pass over all 288,000 readings: **2,428 ms for one batch's count**. The same answer written as a
join from the batch's stays to the readings (`sensor_room_time_idx` already exists) took **22 ms** (0.14 ms in the database).
It grows with the size of the readings table, not with the number of farms a person has, so it gets worse every day the sensors run.
This is the first task, ahead of everything else in phase 2.

### 2. The admin device list: 313 ms in the database
The newest reading of each of 400 devices. Same family as the first one (a subquery per device), much smaller.

### 3. Time spent in Python, not the database
Admin `/api/calendar` (122 ms in Python over 1,000 batches), the farmer's `/api/farms/{id}/summary` (135 ms) and the admin report
(57 ms). Worth a profile of the serializer and the scoping code, after the first task.

### 4. Too many round trips
The cooperative report (11 to 12 queries) and the admin cooperative list (12 queries) are fast here and about 320 to 370 ms with a
database far away. The report is now kept for a minute on screen. The cooperative list makes a few queries for each cooperative.

## Everything else is fast
Sign in, alerts, harvest, disease checks, readings, the series chart, supply, onboarding and the supervisor's team pages all answer in
under 100 ms here and under 300 ms with a far database.

## After task 2.7 (the reading queries), same data, same machine

| Page | Before | After |
|---|---|---|
| Farmer, `/api/farms` | 16,343 ms | 18 ms |
| Farmer, `/api/farms/{id}` | 15,777 ms | 22 ms |
| Farmer, `/api/batches/farm/{id}` | 14,304 ms | 19 ms |
| Farmer, `/api/batches/compare` | 5,554 ms | 32 ms |
| Supervisor, `/api/farms` | did not finish (500 after 20 s) | 46 ms |
| Admin, `/api/farms` | did not finish (500 after 20 s) | 42 ms |
| Supervisor, `/api/batches/active` | did not finish (500 after 20 s) | 168 ms |
| Admin, `/api/batches/active` (1,000 batches) | did not finish (500 after 20 s) | 764 ms |

The fix: a batch's readings and alerts are found by going from its stays to the readings and alerts of that room in those dates
(`sensors/room_readings.py`: `reading_count`, `newest_reading`; `alerts/room_alerts.py`: `alert_count`), not by testing every row
against the batch. `tests/test_reading_queries.py` holds them to the old rule on awkward cases (a move at an exact moment, returning
to a room, old readings with no room, a stay with no readings) and checks the plan never has to read the whole readings table.

Still over 300 ms with a database far away, which is task 2.8:

| Page | Median ms here | Why |
|---|---|---|
| Admin, `/api/batches/active` | 764 | 1,000 batches in one answer of 538 KB, 539 ms in the database: it wants paging more than a faster query |
| Admin, `/api/calendar` | 346 | 43 ms in the database, the rest is Python over 1,000 batches |
| Admin, `/api/devices` | 411 | 337 ms in the database: the newest reading of each of 400 devices |
| Admin and supervisor, `/api/reports/cooperative` | 112 and 49 | 12 queries each, 337 to 412 ms with a far database (kept for a minute on screen) |
| Admin, `/api/cooperatives` | 21 | 12 queries |

## After task 2.8 (the smaller slow pages), same data, same machine

| Page | After 2.7 | After 2.8 |
|---|---|---|
| Admin, `/api/devices` | 411 ms (337 in the database) | 105 ms (24) |
| Admin, `/api/calendar` | 346 ms | 121 ms |
| Supervisor, `/api/calendar` | 103 ms | 67 ms |
| Admin, `/api/cooperatives` | 12 queries | 2 queries, 12 ms |
| Admin, `/api/batches/active` (1,000 batches) | 764 ms (539 in the database) | 205 to 490 ms (62 to 142) |
| Supervisor, `/api/batches/active` | 168 ms (100) | 55 ms (20) |

What changed: the newest reading of each device is found through a new index on the device and the time
(`sensor_device_time_idx`, migration `sensors/0006`), the calendar reads plain values and the time zone once instead of building a
model object for each event, the cooperative list counts members and farms in its own query (it asked 2 questions for each
cooperative), and the newest reading of each batch is found with one search that returns all three values, not three searches.

Three pages are still over 300 ms with a far database, and each is a decision more than a fix:
- **Admin `/api/batches/active`**: 1,000 batches in one answer of 538 KB. Down from 764 ms and it varies from run to run (205 to
  490 ms), mostly the size of the answer. Paging it needs the pages that read it whole (farmer, supervisor, compare) to ask for pages.
- **The cooperative report** (11 to 12 queries; 360 to 430 ms with a far database): kept for a minute on screen since task 2.5, so a
  person pays it once. Most of the queries are the farm ranking that `/api/farms/risk` also uses.
- (`/api/farms/{id}/summary` shows 190 ms in the tables above. It is a PDF download that the server draws, not a page load.)

## All 53 measurements before task 2.7, slowest first
(A farmer asking for `/api/detections/recent` is refused with 403 by design: it is a staff page. It has moved to the supervisor list.)

| Role | Endpoint | Status | Median ms | Worst ms | Queries | Query ms | KB | With a database far away | |
|---|---|---|---|---|---|---|---|---|---|
| SUPERVISOR | `/api/farms` | 500 | 160197.6 | 160201.0 | 14 | 160115.0 | 234.0 | 160547.6 | SLOW |
| ADMIN | `/api/farms` | 500 | 160172.6 | 160175.5 | 15 | 160096.0 | 234.0 | 160547.6 | SLOW |
| ADMIN | `/api/batches/active` | 500 | 21354.7 | 21386.8 | 12 | 21223.0 | 228.5 | 21654.7 | SLOW |
| SUPERVISOR | `/api/batches/active` | 500 | 21116.7 | 21211.3 | 12 | 20926.0 | 231.4 | 21416.7 | SLOW |
| FARMER | `/api/farms` | 200 | 16343.0 | 16350.3 | 4 | 16328.0 | 0.8 | 16443.0 | SLOW |
| FARMER | `/api/farms/{farm}` | 200 | 15776.5 | 16087.4 | 3 | 15440.0 | 3.1 | 15851.5 | SLOW |
| FARMER | `/api/batches/farm/{farm}` | 200 | 14303.8 | 16087.6 | 3 | 12499.0 | 2.4 | 14378.8 | SLOW |
| FARMER | `/api/batches/compare?ids={batch},{other}` | 200 | 5554.1 | 5607.3 | 10 | 5583.0 | 1.2 | 5804.1 | SLOW |
| ADMIN | `/api/calendar` | 200 | 291.8 | 396.0 | 7 | 36.0 | 121.8 | 466.8 | SLOW |
| ADMIN | `/api/devices` | 200 | 366.3 | 394.8 | 3 | 313.0 | 216.4 | 441.3 | SLOW |
| FARMER | `/api/farms/{farm}/summary` | 200 | 280.1 | 413.3 | 6 | 12.0 | 134.9 | 430.1 | SLOW |
| ADMIN | `/api/reports/cooperative?from={start}&to={end}` | 200 | 91.4 | 98.1 | 11 | 36.0 | 56.9 | 366.4 | SLOW |
| SUPERVISOR | `/api/reports/cooperative?from={start}&to={end}` | 200 | 34.6 | 37.7 | 12 | 18.0 | 12.0 | 334.6 | SLOW |
| ADMIN | `/api/cooperatives` | 200 | 16.0 | 20.0 | 12 | 6.0 | 1.3 | 316.0 | SLOW |
| SUPERVISOR | `/api/calendar` | 200 | 83.2 | 103.3 | 7 | 16.0 | 122.2 | 258.2 |  |
| ADMIN | `/api/farms/risk` | 200 | 54.6 | 71.3 | 6 | 17.0 | 63.2 | 204.6 |  |
| FARMER | `/api/batches/{batch}` | 200 | 28.7 | 98.6 | 7 | 11.0 | 4.3 | 203.7 |  |
| FARMER | `/api/calendar` | 200 | 23.1 | 26.1 | 7 | 12.0 | 4.5 | 198.1 |  |
| SUPERVISOR | `/api/farms/risk` | 200 | 18.5 | 21.3 | 6 | 7.0 | 12.7 | 168.5 |  |
| FARMER | `/api/supply/onboarding` | 200 | 13.3 | 16.5 | 6 | 6.0 | 0.3 | 163.3 |  |
| FARMER | `/api/supply/allowance` | 200 | 11.2 | 12.5 | 6 | 5.0 | 0.2 | 161.2 |  |
| FARMER | `/api/farms/{farm}/rooms` | 200 | 20.9 | 21.6 | 5 | 6.0 | 1.1 | 145.9 |  |
| SUPERVISOR | `/api/devices` | 200 | 59.2 | 67.8 | 3 | 42.0 | 43.3 | 134.2 |  |
| SUPERVISOR | `/api/team/decisions` | 200 | 7.7 | 8.5 | 5 | 2.0 | 0.1 | 132.7 |  |
| SUPERVISOR | `/api/team/farmers` | 200 | 7.5 | 8.6 | 5 | 1.0 | 7.6 | 132.5 |  |
| ADMIN | `/api/alerts` | 200 | 43.5 | 51.4 | 3 | 22.0 | 42.2 | 118.5 |  |
| FARMER | `/api/alerts/batch/{batch}` | 200 | 17.6 | 21.9 | 4 | 8.0 | 1.7 | 117.6 |  |
| FARMER | `/api/sensors/batch/{batch}` | 200 | 13.0 | 15.2 | 4 | 2.0 | 11.8 | 113.0 |  |
| ADMIN | `/api/harvest/stats` | 200 | 11.1 | 16.1 | 4 | 7.0 | 0.7 | 111.1 |  |
| SUPERVISOR | `/api/harvest/stats` | 200 | 10.2 | 23.8 | 4 | 6.0 | 0.7 | 110.2 |  |
| FARMER | `/api/sensors/batch/{batch}/series?hours=720` | 200 | 9.5 | 20.9 | 4 | 3.0 | 1.1 | 109.5 |  |
| FARMER | `/api/harvest/stats` | 200 | 8.7 | 11.4 | 4 | 5.0 | 0.3 | 108.7 |  |
| SUPERVISOR | `/api/supply/rounds/{round}` | 200 | 7.6 | 20.9 | 4 | 16.0 | 5.5 | 107.6 |  |
| SUPERVISOR | `/api/alerts` | 200 | 30.3 | 37.3 | 3 | 17.0 | 18.1 | 105.3 |  |
| FARMER | `/api/alerts` | 200 | 28.2 | 42.4 | 3 | 18.0 | 0.9 | 103.2 |  |
| FARMER | `/api/auth/me` | 200 | 10.0 | 21.8 | 3 | 18.0 | 0.4 | 85.0 |  |
| FARMER | `/api/devices` | 200 | 7.5 | 8.8 | 3 | 3.0 | 1.1 | 82.5 |  |
| FARMER | `/api/detections/recent` | 403 | 3.6 | 4.2 | 3 | 2.0 | 0.1 | 78.6 |  |
| SUPERVISOR | `/api/detections/history` | 200 | 23.9 | 26.6 | 2 | 4.0 | 57.7 | 73.9 |  |
| SUPERVISOR | `/api/harvest` | 200 | 22.9 | 26.0 | 2 | 3.0 | 40.7 | 72.9 |  |
| FARMER | `/api/supply/rounds/current` | 200 | 9.4 | 9.7 | 2 | 3.0 | 0.9 | 59.4 |  |
| ADMIN | `/api/detections/stats` | 200 | 5.5 | 6.4 | 2 | 4.0 | 0.1 | 55.5 |  |
| FARMER | `/api/detections/history` | 200 | 5.4 | 6.4 | 2 | 1.0 | 2.1 | 55.4 |  |
| FARMER | `/api/harvest` | 200 | 5.3 | 5.8 | 2 | 1.0 | 1.1 | 55.3 |  |
| SUPERVISOR | `/api/auth/me` | 200 | 4.9 | 7.4 | 2 | 2.0 | 0.4 | 54.9 |  |
| ADMIN | `/api/supply/rounds` | 200 | 4.7 | 5.2 | 2 | 1.0 | 1.8 | 54.7 |  |
| SUPERVISOR | `/api/detections/stats` | 200 | 4.6 | 5.0 | 2 | 2.0 | 0.1 | 54.6 |  |
| SUPERVISOR | `/api/team/rooms` | 200 | 4.1 | 17.8 | 2 | 1.0 | 0.1 | 54.1 |  |
| FARMER | `/api/detections/stats` | 200 | 4.0 | 4.7 | 2 | 1.0 | 0.1 | 54.0 |  |
| SUPERVISOR | `/api/supply/rounds` | 200 | 3.7 | 5.1 | 2 | 1.0 | 0.4 | 53.7 |  |
| SUPERVISOR | `/api/supply/suggestions` | 200 | 3.4 | 4.3 | 2 | 1.0 | 0.1 | 53.4 |  |
| SUPERVISOR | `/api/supply/allowance/requests` | 200 | 3.1 | 5.3 | 2 | 1.0 | 0.1 | 53.1 |  |
| ADMIN | `/api/auth/me` | 200 | 3.0 | 3.4 | 1 | 0.0 | 0.3 | 28.0 |  |
