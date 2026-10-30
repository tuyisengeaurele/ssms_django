# Deploy checklist

Work through this top to bottom for every deploy, including a rehearsal on a test site. Tick nothing you have not seen with your own eyes.

## 1. Decide before you start

- **One site or two?** The refresh cookie is `SameSite=Lax`. A browser only sends it when the website and the API are the same site. `app.example.rw` and `api.example.rw` are one site. `ssms.vercel.app` and `ssms-api.onrender.com` are two, and everyone would be signed out every 15 minutes. Fix it with a shared domain, or by making the host proxy `/api` so the browser only talks to one address.
- **Real data or demo data?** A test site gets demo data only (`seed_demo`). Real farmer data never goes to a test site.

## 2. Settings on the API host

| Setting | Value |
|---|---|
| `DEBUG` | `False` |
| `SECRET_KEY`, `JWT_SECRET` | long random values, different from each other and from local |
| `DATABASE_URL` | the host's database, password rotated |
| `ALLOWED_HOSTS` | the API's own address |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` | the website address, https |
| `TRUSTED_PROXY_COUNT` | `1` behind one host proxy, otherwise every visitor shares one address |
| `AI_SERVICE_URL`, `AI_SERVICE_SECRET` | same secret on both services |
| `SENTRY_DSN` | set, so errors reach someone |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | set, or switch the backend to console on purpose |

`start.sh` runs migrations, creates the cache table for the rate limits and starts the API under ASGI. Read its first lines of output in the host's log.

## 3. Rehearse against the running site

```bash
python manage.py check --deploy
python -m pip_audit -r requirements.txt
cd frontend && npm audit --omit=dev
python scripts/smoke_deploy.py https://api.example.rw --site https://app.example.rw --probe-limits
```

The smoke script needs `SMOKE_EMAIL` and `SMOKE_PASSWORD` in the environment for the sign in checks. Use a throwaway account on a test site. It rotates and revokes that account's sign in.

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

## 5. Known gaps on 2026-10-30

These are written down so nobody is surprised. Each is on the backlog.

- No idle timeout and no warning before a sign in ends.
- No list of signed in devices, and no way to sign a device out.
- No second factor for admin accounts.
- Frontend host sends no Content-Security-Policy.
- `react-router-dom` 6.30.6 has two moderate advisories. The server rendering one does not apply to a single page app. The open redirect one needs a user controlled address passed to a link or `navigate`, and the app only passes fixed paths. The fix is the 7.x line, a major upgrade.
- The daily sensor simulation workflow in `.github/workflows` writes simulated readings into whatever database its secrets point at. Disable it for a live site.

## 6. If it goes wrong

1. Say so on the site's notice and tell the test users.
2. Roll the API back to the previous deploy on the host. Migrations only go forward: never roll back past one without a database backup taken first.
3. Read the error reporter and the host log with the time of the first report.
4. Write down what happened and add a test that would have caught it.
