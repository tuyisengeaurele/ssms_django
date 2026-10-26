# Changelog

## UI round 2 (Plan 5)

A calmer look and safer actions, in the order the owner asked for them. Each change started with a failing test.

### Checked
- Backend: 470 tests pass. Frontend: 581 tests pass, `tsc` is clean and the production build succeeds.
- Real browser checks at 1280, 1100 and 390 pixels wide: no page needs a horizontal slider on any list page.

### Changed
- **Menu.** The wide sidebar is now a narrow icon rail with a name on hover or focus. The choice to open it is remembered, and screens 1600 pixels and wider start open. On phones there is a bottom tab bar with a More button. The profile card is gone from the menu, and Sign out is the last item in the list.
- **Plain labels.** Active, Healthy, stages, roles and counts are plain words. There are no dots and no pills anywhere in the product.
- **Sign in pages.** One centred card with the SSMS mark above it. No marketing panel.
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
