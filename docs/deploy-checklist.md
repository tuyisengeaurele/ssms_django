# Deploy checklist

The step by step setup for Vercel, Render, Supabase and GitHub is in [deploy-runbook.md](deploy-runbook.md). This list is what to confirm on every deploy.

Work through this top to bottom for every deploy, including a rehearsal on a test site. Tick nothing you have not seen with your own eyes.

## 1. Decide before you start

- **One site or two?** The refresh cookie is `SameSite=Lax`. A browser only sends it when the website and the API are the same site. `app.example.rw` and `api.example.rw` are one site. `ssms-django.vercel.app` and your Render API address are two, and everyone would be signed out every 15 minutes. The site answers this with the `/api` forward in `frontend/vercel.json`: the browser only talks to the Vercel address.
- **Real data or demo data?** A test site gets demo data only (`seed_demo`). Real farmer data never goes to a test site.

## 2. Settings on the API host

| Setting | Value |
|---|---|
| `DEBUG` | `False` |
| `SECRET_KEY`, `JWT_SECRET` | long random values, different from each other and from local |
| `DATABASE_URL` | the host's database, password rotated |
| `ALLOWED_HOSTS` | the API's own address |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` | the website address, https |
| `TRUSTED_PROXY_COUNT` | `2` with the Vercel forward and Render in front (one proxy, `1`). Cloudflare and private hops are skipped before counting. Wrong values make every visitor share one address, so read the address in the audit log |
| `EDGE_SECRET` | The same value as the website's `EDGE_SECRET` (Vercel, Production and Preview). Made with `python -c "import secrets; print(secrets.token_urlsafe(32))"`, at least 32 characters, never written in a file. Without it a visitor can choose the address they are counted as (`check --deploy` warns). Runbook section 23 |
| `AI_SERVICE_URL`, `AI_SERVICE_SECRET` | same secret on both services |
| `MFA_ENCRYPTION_KEY` | a Fernet key made by hand and kept in a password manager (runbook section 9). Without it `start.sh` stops the deploy before the running copy is replaced |
| `SENTRY_DSN` | set, so errors reach someone |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | set, or switch the backend to console on purpose |
| `HEALTH_API_URL` | the API's own public address, so the health check can ask it from outside. Set it on the web service and as a GitHub secret |
| `LOG_LEVEL` | `INFO` (default). Logs are one JSON line each, with the request reference |
| `REQUEST_LOG_SAMPLE_RATE` | `0.05` (default): every failed request is logged, and this share of the good ones |

Scheduled jobs run from GitHub Actions, not Render: `jobs-frequent.yml` every 5 minutes (`run_health_checks --skip aiService`, `check_log_bursts`, `mark_offline_devices`) and `jobs-nightly.yml` at 02:00 UTC (`rollup_readings`, `cleanup_sensor_readings`, `prune_sessions`, `prune_logs`). GitHub may start a run a few minutes late, and emails the repository owner when a run fails. A scheduler that stopped shows in the System page, Logs, Jobs and devices: each command writes when it starts and ends.

`build.sh` runs the deploy check, the migrations, the cache table for the sign in lockout and the static files once per deploy, and leaves `.setup_done`. `start.sh` then only starts the API under ASGI, so a wake from sleep is fast. Without the marker (a host whose build cannot reach the database) `start.sh` does those steps itself. Read the build log for the setup and the start log for uvicorn.

## 3. Rehearse against the running site

- **Outside monitor.** The API cannot report its own downtime, and neither can the health cron if the platform is down. Point a free outside monitor (UptimeRobot or similar) at `https://<api>/api/health` every 5 minutes, with an email to the owner. The System page shows the uptime the cron measured, and this monitor is the second opinion.
- On the System page, Health tab, press every test button once: email, photo storage, disease check, database write, device intake. Each says in plain words what happened.

```bash
python manage.py check --deploy
python -m pip_audit -r requirements.txt
cd frontend && npm audit --omit=dev
python scripts/smoke_deploy.py https://api.example.rw --site https://app.example.rw --probe-limits
```

The smoke script needs `SMOKE_EMAIL` and `SMOKE_PASSWORD` in the environment for the sign in checks. Use a throwaway farmer account on a test site (an admin account also needs a code, which the script cannot type). It rotates and revokes that account's sign in.

Sign in as an admin by hand once: password, then the code (or set-up the first time). Check Settings, Security shows the app as On, and that the Logs tab shows the sign in as "Signed in with a code".

Then, from outside:

- securityheaders.com and SSL Labs on both addresses.
- OWASP ZAP baseline scan against the test site only.
- Lighthouse on the landing page and one signed in page, on a phone profile.

## 4. By hand, on a phone and a laptop

- Sign in, wait 16 minutes, reload: still signed in.
- Sign in on a second device: the first stays signed in.
- Wrong password six times: the account is locked for 15 minutes and the message says so.
- A farmer cannot open another farmer's farm, batch or lot by changing the address.
- Open a lot's QR page signed out. Stop sharing it: the old link stops working.
- Two supervisors keep the dashboard open, then use the rest of the site: nothing stalls.
- Switch language on every role's dashboard. Keyboard only: reach every main action.
- Language addresses (the host rules in `frontend/vercel.json` cannot be run on a laptop, so check them on the deployed site or the Vercel preview):
  - `/fr` and `/rw` answer with 200 and the page is already in that language (view the source: `<html lang="fr">`, a French description, `hreflang` links, the canonical link naming itself).
  - `/en` goes to `/`.
  - Choose French on the landing page: the address becomes `/fr`. Close the tab, open `/`: you land on `/fr` with no flash of English. Choose English: `/` stays English.
  - In a private window with no cookie, `/` stays English whatever the browser language, and `/fr/` does not loop.
  - `/sitemap.xml` lists `/`, `/fr` and `/rw` with their alternates.
  - `/locale-boot.js` answers with 200, names both language files, and is not cached for a year (it changes with every build). Choose French, open `/login` on a throttled connection: the headline is French from the first draw, with no English first.
- Motion and fonts (task 2.3 and 2.4), on the deployed site with the browser's network tab open:
  - `/`, `/fr` and `/rw` download exactly three font files (`fraunces-latin-normal`, `fraunces-latin-italic`, `geist-latin-normal`, about 54 KB in all) and no `-wght-` file. The hero entrance plays once, in about a second, and does not play a second time when the page finishes loading. With the system's "reduce motion" on, nothing moves.
  - Signed in as a farmer: moving between pages is a quick fade, a dialog fades and rises in, a toast fades in and out, and none of them blocks a click.
  - A name with an unusual letter (for example `Ñ`) still shows in the same font: the network tab fetches one `-wght-` file then, and only then.
- The cooperative report (task 2.5): as a supervisor open it, change the period and go back. The second open is instant. A change you make shows up in it within a minute. A CSV or PDF download is always current.
- Stop the AI service: the disease check says so plainly and the rest of the site works.
- Take a database backup and restore it somewhere else.

## Before a demonstration

The free plans sleep, and a cold start of the API was measured at about a minute. A demonstration must not start with a minute of waiting.

1. Ten minutes before, wake both services and watch the numbers: `python scripts/warm_up.py https://ssms-api-cmqa.onrender.com https://ssms-ai.onrender.com`. Each line should say `ready`. If one says `NOT ANSWERING` after three minutes, look at the host dashboard before going on.
2. Sign in once as each role you will show (farmer, supervisor, admin). The admin needs the authenticator code, so have the phone at hand.
3. Run one disease check with a real photo, so the model is loaded. The first check after a wake is the slowest.
4. Keep one tab open on the farmer dashboard. It asks the API every 30 seconds while the tab is visible, which keeps the server awake until you start.
5. Have screenshots of the main screens ready in case the network fails.
6. Do not run the five minute pinger all night to avoid this: it would use the free hours of every service (see section 7 of the runbook).

## 5. Known gaps on 2026-11-20

These are written down so nobody is surprised. Each is on the backlog.

- Farmers have no idle limit unless they tick "This is a shared computer" at sign in (30 minutes). Admins have 15 minutes and supervisors 30. `SESSION_IDLE_FARMER_MINUTES` sets a limit for every farmer.
- The admin's active batches list is one answer for every active batch (538 KB for 1,000). It takes 200 to 500 ms at that size and wants paging. See `docs/load-profile.md`.
- The cooperative report on screen is kept for a minute per cooperative, period and kind of reader, in each API process's memory. A change can take up to a minute to show.
- Migration `sensors/0006` builds a plain index on the readings table. It is quick while the table is small. A table of millions of rows would want the index built concurrently first.
- The Content Security Policy in `frontend/vercel.json` has been enforced since 2026-11-20 (it was report only from 2026-11-12, and the Security log showed only our own probes). It still reports to `/api/csp-report`, so a violation appears in the Security log as "Browser blocked something the page tried to load". If a legitimate resource is ever blocked, the fast way back is to rename the header key to `Content-Security-Policy-Report-Only`, then add the host to the right directive. The API address in `connect-src` is the `ALLOWED_HOSTS` value in `render.yaml`: change both together, or drop it if the host proxies `/api` so the site only talks to itself. Not yet seen enforced on the live site: the farm map with real farms, the location picker, photo upload and the bot check. After the deploy, walk those pages and read the console for "Refused to".
- The sensor simulation workflow in `.github/workflows` writes simulated readings into whatever database its secrets point at. It runs only when someone presses the button. Never press it on a database with real farm data.

## 6. If it goes wrong

1. Say so on the site's notice and tell the test users.
2. Roll the API back to the previous deploy on the host. Migrations only go forward: never roll back past one without a database backup taken first.
3. Read the error reporter and the host log with the time of the first report. A person who saw an error quotes its reference: search it on the System page, Logs, in every stream, and in the host log (`request_id`).
4. Write down what happened and add a test that would have caught it.
