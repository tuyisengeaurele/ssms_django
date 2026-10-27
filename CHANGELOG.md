# Changelog

## Disease photo: camera, smaller photos and a framing guide (Plan 9, item B5)

Taking a photo for the disease check is easier on a phone, and a large photo no longer gets turned away.

### Checked
- Frontend: 783 tests pass and `tsc` is clean. No backend change.
- Not yet looked at in the browser by me. Please open a batch's Disease check on a phone once and take a photo.

### Added
- **Use the camera.** On a device with a camera, a button opens the camera in the page, using the back camera. A square shows what will be sent, and "Take photo" sends the middle square of the picture. The camera is switched off when the photo is taken, when the person cancels or presses Escape, and when they leave the page. If the camera is blocked or missing, the page says so in plain words and offers the normal file picker.
- **Smaller photos.** A photo is made into a JPEG of at most 1,280 pixels on the long side before it is sent, with a note such as "It was 5.0 MB, and was made smaller to send faster." The server refuses anything over 5 MB and phone photos often are, so before this the check could fail on a good photo. A small photo is sent as it is. If the browser cannot do it, the original is sent.
- **Framing advice**, folded away under "How to take a photo the check can read": get close, use daylight without flash, hold still. The disease model squeezes every photo into a square, which is why the camera frames a square.

### Changed
- The page said photos could be up to 10 MB. The server limit is 5 MB, and the page now says large photos are made smaller for you.

### Known limits
- Photos chosen from the gallery are made smaller but not cropped. Only camera photos are cut to the square.
- The French and Kinyarwanda words are drafts for a native speaker.

## Rwanda places for farms (Plan 9, item L2)

A farm's location is now chosen the way Irembo asks for it: province, district, sector, cell and village as linked lists, with an optional street. "Use my location" fills in what a map can tell.

### Checked
- Backend: 942 tests pass. Frontend: 745 tests pass and `tsc` is clean.
- Your local database is migrated through `farms/0003`. Your existing farms keep their old text and have no place chosen yet.
- Not yet looked at in the browser by me, because the sign-in step was blocked. Please open New farm and Edit farm once.

### Added
- **The places of Rwanda**, in `locations/`: 5 provinces, 30 districts, 416 sectors, 2,148 cells and 14,842 villages, with their government codes. Where it comes from, what was checked and what is not perfect is in `locations/README.md`.
- **Linked lists on the farm form.** Choosing a province loads its districts, and so on down. Changing a place empties the ones below it. The street is optional. All five choices are needed, and the server refuses a set that does not belong together.
- **Use my location.** The browser's position is turned into a province, district and sector by the World Bank's sector boundaries. The person then chooses the cell and village by hand, because no boundaries exist for those. The point travels in a request body and is never stored. Outside Rwanda, or when the person says no, the form says so in plain words and nothing changes.
- **The farm line.** A farm's text location is now made from its choices, smallest place first, for example "KG 9 Ave, Kabeza, Akabare, Kageyo, Gatsibo, Eastern Province". Lists and search keep using it.
- `GET /api/locations?parent=<code>` and `POST /api/locations/locate`, for any signed-in person, both rows in the authorization matrix.
- The demo farms now stand in a real village of their district.

### Changed
- Creating a farm no longer takes free text for the location. The API refuses it. Renaming a farm needs no place.
- A farm from before places keeps its old text, shown as "Address on record" in the editor. Choosing a place replaces it, and then all five choices are needed.

### Known limits
- Village names come as the register has them, a few with obvious typos (for example "Umudugudu WaV"). They are not corrected by guessing.
- The list has 14,842 villages against the 14,837 usually quoted. No copy we found matches every official figure.
- The boundaries date from 2012. The Kinyarwanda and French words on the form are drafts for a native speaker to read.

### Before you run this
- Run `python manage.py migrate`.

## Rearing rooms, step 3: alerts by room (Plan 8)

Temperature, humidity and sensor-outage alerts now belong to a room. A problem in a room with three batches is one alert and one email, not three. This finishes the design in `docs/superpowers/specs/2026-10-27-rearing-rooms-design.md`.

### Checked
- Backend: 860 tests pass. Frontend: 725 tests pass and `tsc` is clean.
- Your local database is migrated through `alerts/0005`. The one open air problem it had was given its room.
- Not yet looked at in the browser by me. Please open Alerts and a batch page once.

### Added
- **One alert per room and problem.** A bad reading opens one temperature or humidity alert for the room. More bad readings add nothing. The first good reading resolves it.
- **One range per room.** The room is judged by the range its running batches share. When they share none, the youngest batch's range is used. Batches at harvest and deleted batches do not count.
- **Alerts end when the room empties.** Moving the last running batch out, deleting it, or moving it to harvest resolves the room's open air and sensor alerts. A room with nothing running is not judged.
- **Alerts name the room and its batches.** Each alert in the list shows the room and a link to every batch in it. The live stream carries `roomId`. The email names the room and its batches, and quotes the range that was really used (it used to print a fixed range).
- **Sensor outages belong to the room.** One alert per quiet device, so hearing from one device ends only its own outage.
- **A batch has the alerts of the rooms it stayed in**, for the time it was there. The alert count and the open-problem count on the batch lists follow the same rule.

### Changed
- `check_sensor_alerts` is gone. A batch that was never placed in a room raises no air alerts (none exist after the migration).
- A quiet sensor in a room with nothing running raises no outage alert. The design said it should. It would only be noise, because nobody is rearing there, and it is one line to change.
- The demo's humid spell is stronger, so it is still open at any hour of the day.

### Before you run this
- Run `python manage.py migrate`. The data migration gives each open air or sensor alert the room of its batch, and it is safe to run twice.

## Rearing rooms, step 2: sensors and readings (Plan 8)

Sensors now belong to a room, and a reading belongs to the room it was taken in. Every batch in a room shares what the room's sensors measure. Alerts still run once per batch and move to the room in step 3.

### Checked
- Backend: 801 tests pass. Frontend: 721 tests pass and `tsc` is clean.
- Your local database: migrated through `sensors/0004`, so 3971 readings and 17 devices were placed in rooms, and the demo data was rebuilt with `seed_demo --reset`.
- Not yet looked at in the browser by me, because the sign-in step was blocked. Please open the Devices page, a device's details and a farm page once.

### Added
- **A device lives in a room.** Registering a device on a farm with one room puts it there, a farm with several asks which, and a farm with none still registers it, with a hint to add a room. A manager can move it later from its details ("Move to another room"). `PATCH /api/devices/<id>` with `roomId`, admins and supervisors only, and it is audited.
- **Readings belong to a room.** A device reading is stored on its device's room. A batch sees the readings of the rooms it stayed in, only for the time it was there, so a move does not copy or lose any history. A reading typed by hand goes to the batch's room.
- **A device that cannot be placed.** With several rooms and none chosen, a reading is refused with "This device is not in a room yet." A device in a deleted room is refused like an unknown key.
- **Farm page.** Each room lists its sensors with their status and the last reading the room took, or says there is none yet.
- **Devices page.** A Room column, searchable, and the room in the details.
- **Today card.** A room is judged once, however many batches are in it, and the line names the room. When the batches in a room have different safe ranges, the room is judged by the range they share, or by the youngest batch's range when they share none. Harvest lines stay one per batch.
- `simulate_sensors` sends one reading per room that holds a running batch. New options `--room` and `--batch`.

### Changed
- The dashboard chart counts a room once, not once per batch.
- A room with batches in it still cannot be deleted ("Move the batches out of this room first.").

### Before you run this
- Run `python manage.py migrate`. The data migration moves old readings and devices into the room their batch was in, and it is safe to run twice.

## Rearing rooms, step 1 (Plan 8)

A farm now has rooms, and every batch sits in one. This is the first of three steps in `docs/superpowers/specs/2026-10-27-rearing-rooms-design.md`. Sensors, readings and alerts still work as before and move to rooms in the next two steps.

### Checked
- Backend: 741 tests pass. Frontend: 695 tests pass and `tsc` is clean.
- Your local database: all 18 running batches were placed in "Room 1" of their farm, and the one deleted batch has an ended stay and no room.

### Added
- **Rooms.** A farmer adds, renames and deletes the rooms of a farm. A name can be used once per farm, whatever the capitals. Deleting asks first and hides the room. A room that still has batches in it cannot be deleted. Supervisors can read rooms but not change them. `GET` and `POST /api/farms/<id>/rooms`, `PATCH` and `DELETE /api/rooms/<id>`.
- **A new batch always gets a room.** A farm with no rooms gets "Room 1" made for it, a farm with one room uses it, and a farm with several asks which. The new batch form shows this.
- **Moving a batch.** "Move to another room" on the batch page, to another room of the same farm. The old stay ends and a new one starts, so where a batch has been is kept and shown on the page. `POST /api/batches/<id>/room`. A deleted batch leaves its room.
- **`seed_demo`** gives each demo farm two rooms, with the running batch in the first and the finished one in the second.

### Before you run this
- Run `python manage.py migrate`. The data migration puts every existing batch in "Room 1" of its farm, with a stay that starts on its start date, and it is safe to run twice.

## Invitations, the team list and self-applying filters (Plan 7)

Added on 27 October at the owner's request. Each change started with a failing test.

### Checked
- Backend: 692 tests pass. Frontend: 684 tests pass and `tsc` is clean.
- In the real app, as the demo supervisor: the My farmers page lists the cooperative's farmers, a link can be made, and the link page opens for a signed-out visitor.

### Added
- **Invitation links.** A supervisor makes a link for a farmer, with or without an email address. A link works once and lasts 7 days, and only a hash of it is stored, so it is shown once and cannot be read back. With an address, the link is emailed and only that address can use it, and using it also proves the address. An admin can make links for any cooperative. `POST /api/team/invitations`, `GET /api/team/invitations`, `DELETE /api/team/invitations/<id>` (revoke), and the public `GET /api/invitations/<token>` and `POST /api/invitations/<token>/accept`.
- **Joining.** A farmer registers through the link, or accepts it when already registered (with a question first if that means leaving another cooperative). A link that is unknown, expired, revoked or used always gets the same answer, so it says nothing about which links exist. Making the account and using the link are one step.
- **My farmers.** A supervisor sees the farmers of their cooperative, with their farm counts, and can remove one after a confirmation. The farmer keeps their account and farms. `GET /api/team/farmers`, `DELETE /api/team/farmers/<id>`.
- **The page behind a link** (`/join/<token>`), in three languages. Signing in from it brings the person back to it.
- **Filters apply themselves.** On Detection reports and the Audit log, menus and dates apply at once, typing applies a moment after it stops, and only Reset stays, shown when a filter is set.

### Changed
- The Audit log's Clear button is now Reset, like the other filters.

### Before you run this
- Run `python manage.py migrate` for the new invitations table.

## Alerts, devices, demo data and the farmer pages (Plan 6)

Work from 27 October, in the order agreed. Each change started with a failing test.

### Checked
- Backend: 644 tests pass. Frontend: 643 tests pass, `tsc` is clean and the production build succeeds.
- In the real app: the farm and batch detail pages fit at 1100 and 390 pixels wide, the cooperatives tabs and the Undo toast work, and the new batch sections show.

### Added
- **Cooperative restore.** Admins see Active and Deleted tabs and can restore a deleted cooperative. `POST /api/cooperatives/<id>/restore`, and `?deleted=1` on the list. Deleting and restoring are audited.
- **Undo.** Marking one alert read shows an Undo button. `PATCH /api/alerts/<id>/unread`.
- **Safe range per stage.** Each stage of a batch has its own temperature and humidity range, starting at the range the system always used (22 to 28 °C, 70 to 85 %). Everyone signed in can read it, and an admin can change it (`GET /api/alerts/thresholds`, `PUT /api/alerts/thresholds/<stage>`). The batch page and the dashboard use these numbers.
- **One alert per problem.** A bad reading opens one temperature or humidity alert. More bad readings add nothing, and the first good reading resolves it. A later problem opens a new alert. Alerts now carry `resolvedAt`.
- **Devices send readings with their own key.** `POST /api/devices/ingest` with an `X-Device-Key` header, no user account needed. Readings go to the device's batch, or to the only active batch on its farm. A key is limited to 30 readings a minute.
- **Offline devices.** A device quiet for 30 minutes (`DEVICE_OFFLINE_MINUTES`) shows as offline at once. `python manage.py mark_offline_devices` also opens one system alert per outage on the batch, and the next reading resolves it.
- **`seed_demo`.** `python manage.py seed_demo` builds a demo cooperative with a supervisor, three farmers, running and finished batches, a month of hourly readings, disease checks, harvests and alerts that follow the real rules. It touches only its own rows (`@demo.ssms.rw` accounts, "Demo Silk Cooperative", `ssms-demo-` devices), `--reset` rebuilds them, and the password is printed once or set with `--password`.
- **A better simulator.** `simulate_sensors` now goes through the same path as a real device, and `--scenario cold`, `hot`, `humid` or `dry` stages a problem for a live demo. `--rounds N` runs a fixed number of rounds.
- **Needs attention today.** The farmer dashboard has a card that lists rooms out of range, sensors gone quiet for six hours, and harvests due in three days or late.
- **Batch page.** It says which day of the cycle it is ("Day 12 of 21, harvest expected on 6 June") and the safe range of the stage. The charts can show 24 hours, 7 days or 30 days (`GET /api/sensors/batch/<id>/series?hours=N`).
- **Breed, quantity and deaths.** A batch can have a breed and a quantity counted in egg boxes or worms, which a farmer can correct later. A log records the worms that died each day, with a note. Entries are hidden when deleted, never removed, and the batch page shows the total.

### Changed
- The active batches list also carries each batch's latest reading and its open problems, in the same single query.

### Bugs found on the way and fixed
- Databases made by the old Node backend have a native Postgres enum on `alert_logs.type`, and Django's bulk insert cannot write into one. Opening an alert would have failed there, so alerts are now saved one at a time. Two tests guard it, because a fresh test database does not have the enum.

### Before you run this
- Run `python manage.py migrate`. There are new migrations for alerts and batches. They only add things, and old temperature and humidity alerts are marked resolved so they cannot hide a new problem.
- Set `DEVICE_OFFLINE_MINUTES` if 30 minutes is not right for your sensors, and run `mark_offline_devices` every few minutes from a scheduler when you deploy.

### Left for later
- The admin page for editing the safe ranges (the API is ready).
- The disease photo, report and onboarding items on the list.

## UI round 2 (Plan 5)

A calmer look and safer actions, in the order the owner asked for them. Each change started with a failing test.

### Checked
- Backend: 470 tests pass. Frontend: 581 tests pass, `tsc` is clean and the production build succeeds.
- Real browser checks at 1280, 1100 and 390 pixels wide: no page needs a horizontal slider on any list page.

### Changed
- **Menu.** The wide sidebar is now a narrow icon rail with a name on hover or focus. The choice to open it is remembered, and screens 1600 pixels and wider start open. On phones there is a bottom tab bar with a More button. The profile card is gone from the menu, and Sign out is the last item in the list.
- **Plain labels.** Active, Healthy, stages, roles and counts are plain words. There are no dots and no pills anywhere in the product.
- **Sign in pages.** Kept the split layout, with the green panel on one side and the form on the other. A centred card was tried and put back.
- **Forms.** The new farm, batch and photo check forms stand alone, in one narrow column. The side panels are gone.
- **Tables.** Cells use less padding on laptop screens, so tables fit without a slider.
- **Users.** The table shows name, role, cooperative, status and actions. Role and cooperative change in one Edit access dialog that shows what will change and asks again before saving. "Turn off" is now Delete. It is a soft delete: the account is hidden and cannot sign in, the person's farms and records stay, and a Deleted tab has a Restore button. There is still no way to delete a user for good.
- **Confirmations.** The app now asks before moving a batch to the next stage (stages only move forward), before adding or removing a cooperative member, and before marking every alert or message as read. Cooperatives say Delete instead of Turn off.
- **Wording.** The word administrator appears only on admin screens. Help text for farmers and supervisors points to the SSMS team. This covers the landing page, the no access page, the profile and supervisor notes, the privacy and terms pages, API messages and the invitation email.

### Added
- `POST /api/admin/users/<id>/restore` (admin only, audited).

### Left for later
- Restoring a deleted cooperative has no button yet. The backend only switches it off.
- The French and Kinyarwanda text for the new screens is a draft and needs a native review.

## Baseline and security (Plan 1)

This round closes every stop-ship and serious security finding from the audit. Each fix started with a failing test.

### Checked
- Backend: 454 tests pass, 82% coverage. Frontend: 530 tests pass, `tsc` is clean. AI service: 16 tests pass, 1 skipped (see below).
- `pip-audit`: nothing found. `npm audit --omit=dev`: 2 moderate findings (React Router, see "Left for later").
- `manage.py check --deploy --fail-level WARNING` exits 0 with production settings.
- 38 checks against a live uvicorn server and a scratch database, covering the manual checklist: sign in, token lifetimes, refresh and replay, logout, other people's data, live alert tickets, email verification, password change from two devices, admin invitations, photo checks, bad parameters, login lockout and the contact form limits. All pass.
- A real browser check: sign in through the form, corrupt the stored token, and the app refreshes silently and stays signed in.

### Closed
- **SEC-01** Email verification no longer signs anyone in. A verified account used to receive a live session for any token. Links now work once and a password reset token cannot confirm an email.
- **SEC-02** Authorization. One module (`core/access.py`) decides who may see what. Supervisors can no longer open batches outside their cooperative, farmers can no longer read other farmers' readings, detections, alerts or harvests, a supervisor without a cooperative sees nothing, and deleted farms and batches are hidden from everyone. A matrix test runs every endpoint as ten kinds of caller.
- **SEC-03** Access tokens last 15 minutes and refresh tokens a week. A password change or reset, or turning an account off, ends every session of that account.
- **SEC-04** The live alert stream no longer takes the sign in token in its address. It uses a 30 second, single-use ticket on an async view that follows the same access rules.
- **SEC-05** Forwarded addresses are trusted only to a set proxy depth, and throttle counters are shared through the database cache.
- **SEC-06** Admins can create users with the role they choose, with an invitation email when no password is given.
- **SEC-07, SEC-08** One password policy for registration, change and reset. Recovery and resend emails answer the same for every address and survive a mail failure.
- **SEC-09** (backend) The contact form validates its input, refuses header injection, is limited to five messages an hour, has a honeypot, and replies with fixed text.
- **SEC-10, SEC-18** The AI service needs a shared secret, sends no CORS headers, limits uploads to 5 MB and judges files by their contents. Errors say nothing about the inside.
- **SEC-11, SEC-13** Bad query parameters answer 422, and spreadsheet formulas are defused in every CSV export.
- **SEC-12** Record ids and device keys are cryptographically random.
- **SEC-14** Security headers on every response, secure cookies, HTTPS redirect in production.
- **SEC-15, SEC-16, SEC-17, SEC-19** Login lockout after five failures, equal timing for unknown emails, old Node bcrypt hashes replaced on sign in, and failed logins in the audit log.
- **OPS-02, OPS-03, OPS-04** Loose files moved out of the repo, Django 5.2 LTS with patched dependencies, pytest, factories and ruff.
- **QA-01, ADM-03, AI-06 (part)** Green baseline, synchronous audit log, safe model loading with an optional SHA-256 check.

### Bugs found on the way and fixed
- Creating a device through the API always failed (the view read `farmId`, the parser had renamed it).
- Changing and resetting a password always failed for the same reason, so nobody could do either.
- The supervisor dashboard dropped every live alert, because it expected a list and the server sends one alert per message.
- A line break in a contact form subject or email caused an error instead of a refusal.
- A farm page cost three extra database queries for every batch it showed. It now costs a fixed number.

### Before you run this
- **Rotate the database password.** The old one is in public commit history (`SECURITY.md`). This is still to do.
- Add `AI_SERVICE_SECRET` to the API's `.env` and to the AI service's environment. Without it the AI service will not start. For quick local work only, start it with `AI_ALLOW_INSECURE=1`.
- Run the API with `uvicorn`, not `runserver` (`make dev-api`). Live alerts cannot stream through `runserver`.
- Run `python manage.py createcachetable` once. Replace `JWT_EXPIRES_DAYS` in `.env` with `JWT_ACCESS_MINUTES` and `JWT_REFRESH_DAYS`.
- Keep comments in `.env` on their own lines. `python-decouple` does not read comments after a value.
- On the host set `TRUSTED_PROXY_COUNT=1`, a long random `SECRET_KEY`, and `AI_SERVICE_SECRET`.
- Behaviour changes: `?hours=` above 168 is now a 422 instead of being cut to 168, and a supervisor of another cooperative now gets 404 where they used to see the data.

### Left for later
- A CAPTCHA on the contact form, API documentation, and keeping the access token in memory.
- Same-origin deployment so the refresh cookie works across sites, and an async server worker for production.
- React Router 6 has a moderate advisory and its fix is a major upgrade. Vite and Vitest have dev-only advisories that need major upgrades.
- The AI preprocessing is checked against TensorFlow by a test that is skipped here, because TensorFlow is not installed. Run it where TensorFlow exists.
- The test run ends with a harmless warning that one database session is still open, left by the async tests.
