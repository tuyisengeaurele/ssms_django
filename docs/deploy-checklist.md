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
| `TRUSTED_PROXY_COUNT` | `2` with the Vercel forward and Render in front (one proxy, `1`). Wrong values make every visitor share one address, so read the address in the audit log |
| `AI_SERVICE_URL`, `AI_SERVICE_SECRET` | same secret on both services |
| `MFA_ENCRYPTION_KEY` | a Fernet key made by hand and kept in a password manager (runbook section 9). Without it `start.sh` stops the deploy before the running copy is replaced |
| `SENTRY_DSN` | set, so errors reach someone |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | set, or switch the backend to console on purpose |
| `HEALTH_API_URL` | the API's own public address, so the health check can ask it from outside. Set it on the web service and as a GitHub secret |
| `LOG_LEVEL` | `INFO` (default). Logs are one JSON line each, with the request reference |
| `REQUEST_LOG_SAMPLE_RATE` | `0.05` (default): every failed request is logged, and this share of the good ones |

Scheduled jobs run from GitHub Actions, not Render: `jobs-frequent.yml` every 5 minutes (`run_health_checks --skip aiService`, `check_log_bursts`, `mark_offline_devices`) and `jobs-nightly.yml` at 02:00 UTC (`cleanup_sensor_readings`, `prune_sessions`, `prune_logs`). GitHub may start a run a few minutes late, and emails the repository owner when a run fails. A scheduler that stopped shows in the System page, Logs, Jobs and devices: each command writes when it starts and ends.

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
- Stop the AI service: the disease check says so plainly and the rest of the site works.
- Take a database backup and restore it somewhere else.

## 5. Known gaps on 2026-11-04

These are written down so nobody is surprised. Each is on the backlog.

- Farmers have no idle limit unless they tick "This is a shared computer" at sign in (30 minutes). Admins have 15 minutes and supervisors 30. `SESSION_IDLE_FARMER_MINUTES` sets a limit for every farmer.
- No second factor for admin accounts.
- The Content Security Policy in `frontend/vercel.json` is report only. Switch the header name to `Content-Security-Policy` after the real domain is set and the browser console is clean on the deployed site for every role. The API address in `connect-src` is the `ALLOWED_HOSTS` value in `render.yaml`: change both together, or drop it if the host proxies `/api` so the site only talks to itself. Map tiles, the bot check, error reports and photo uploads were not exercised against the policy.
- The sensor simulation workflow in `.github/workflows` writes simulated readings into whatever database its secrets point at. It runs only when someone presses the button. Never press it on a database with real farm data.

## 6. If it goes wrong

1. Say so on the site's notice and tell the test users.
2. Roll the API back to the previous deploy on the host. Migrations only go forward: never roll back past one without a database backup taken first.
3. Read the error reporter and the host log with the time of the first report. A person who saw an error quotes its reference: search it on the System page, Logs, in every stream, and in the host log (`request_id`).
4. Write down what happened and add a test that would have caught it.
