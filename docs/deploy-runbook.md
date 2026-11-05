# Deploy runbook: Vercel, Render, Supabase, GitHub

Where each part lives:

| Part | Host | Defined in |
|---|---|---|
| Website | Vercel | `frontend/vercel.json` |
| API (`ssms-api`) | Render | `render.yaml` |
| Disease check (`ssms-ai`) | Render | `render.yaml`, `ai_service/build.sh` |
| Database | Supabase Postgres | the `DATABASE_URL` secret |
| Scheduled jobs | GitHub Actions | `.github/workflows/jobs-frequent.yml`, `jobs-nightly.yml` |
| Photos | Cloudinary | already set up |

The browser only talks to the Vercel address. Vercel forwards `/api/...` to Render, so the sign in cookie stays on one site.

Secrets (database address, passwords, keys) are typed into the Render, GitHub and Vercel dashboards by the owner. They are never put in a file, a commit or a chat.

## 1. Supabase (the database)

1. Create a project. Pick a European region. Render runs in Frankfurt, so keep the database in Europe too: an ocean between them slows every page.
2. Choose a database password made of letters and digits only. Special characters must be URL encoded inside the address and cause confusing failures. Save it in a password manager.
3. Press **Connect** and copy the **Session pooler** string. Use the pooler, not the "Direct connection": the direct address is IPv6 only on the free plan and Render cannot reach it. Do not use Transaction mode (port 6543): Django needs persistent connections.
4. It looks like `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. Put your password in and add `?sslmode=require` at the end. This one string is `DATABASE_URL` everywhere.

Free plan limits to know: 500 MB of data, and the project pauses after a week without activity. The five minute job from GitHub is activity, so it keeps the project awake. A paused project is not deleted, you restore it from the Supabase dashboard.

## 2. The model file (disease check)

`sericulture_resnet50_model.keras` is 107 MB and sits in Git LFS, which Render does not fetch. The build downloads it from a link you give it and refuses it if its fingerprint does not match.

1. Compute the fingerprint (on Windows PowerShell): `Get-FileHash sericulture_resnet50_model.keras -Algorithm SHA256`
2. Put the file where Render can download it. The simplest place is a GitHub Release on this repository (attach the file as an asset). The repository is public, so the model will be public too.
3. Keep the asset link (`MODEL_URL`) and the fingerprint (`MODEL_SHA256`) for step 4.

## 3. GitHub secrets (for the scheduled jobs)

Repository, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Create these names:

`DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `HEALTH_API_URL`, `AI_SERVICE_URL`, `AI_SERVICE_SECRET`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, `SENTRY_DSN` (optional).

`SECRET_KEY` and `JWT_SECRET` must match the ones on Render, so generate them once, put them in both places, and keep them in the password manager.

After saving, run **Frequent jobs** by hand from the Actions tab (**Run workflow**) and read the log. It should end green.

## 4. Render (the two services)

1. Merge the deploy branch to `master` first, because Render reads `render.yaml` from the branch you pick.
2. Render dashboard, **New**, **Blueprint**, pick this repository. Render lists `ssms-api` and `ssms-ai` and asks for the values marked "sync: false".
3. For `ssms-api`: `DATABASE_URL`, `SECRET_KEY` and `JWT_SECRET` (the same values as the GitHub secrets), `EMAIL_HOST_PASSWORD`, `AI_SERVICE_SECRET`, and `SENTRY_DSN` if you have one.
4. For `ssms-ai`: the same `AI_SERVICE_SECRET`, `MODEL_URL`, `MODEL_SHA256`.
5. Check the real address of each service on its page. If it is not exactly `ssms-api.onrender.com` and `ssms-ai.onrender.com`, change these together: `ALLOWED_HOSTS`, `HEALTH_API_URL` and `AI_SERVICE_URL` in `render.yaml`, the `/api` rewrite and `connect-src` in `frontend/vercel.json`, and the GitHub secrets.
6. Watch the `ssms-api` log. It runs `migrate` against Supabase, then starts.

## 5. Vercel (the website)

1. Do not set `VITE_API_BASE_URL` in Vercel. When it is missing the site calls `/api`, which Vercel forwards.
2. Redeploy after the merge so the `/api` rewrite is live.
3. Check that `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` on Render are the real Vercel address.

## 6. Check it works

- `https://<vercel address>/api/health` answers. The first call after idle takes about a minute.
- Create the first admin account: `python manage.py createsuperuser` against Supabase from your laptop (type the `DATABASE_URL` into your own terminal for that one command, then close it). Test sites get demo data with `seed_demo`. Real farmer data never goes on a test site.
- Sign in, stay on a page 16 minutes, reload: still signed in. That proves the cookie works through the proxy.
- Admin, System, Health tab: ten cards. Press each test button once.
- The alert bell still receives a live alert (the live stream goes through the Vercel forward).
- Audit log shows your real address, not a Vercel or Render address. If every visitor shows the same address, `TRUSTED_PROXY_COUNT` is wrong: try `1` or `3` and reload.
- `python scripts/smoke_deploy.py https://<vercel address> --site https://<vercel address>` with `SMOKE_EMAIL` and `SMOKE_PASSWORD` set to a throwaway account.

## 7. Outside monitor

Point UptimeRobot (free) at `https://<vercel address>/api/health` every 5 minutes, email to the owner. It also stops the API from sleeping, and its time-outs show whether Render is down.

## 8. If something fails

| What you see | Likely cause | Fix |
|---|---|---|
| Build fails on `pip install` | wrong Python on Render | check `PYTHON_VERSION` in the service's environment |
| `could not translate host name` or `Network is unreachable` | the direct Supabase address (IPv6) | use the Session pooler string |
| `password authentication failed` | wrong password or an unencoded symbol | reset the database password, use letters and digits |
| `prepared statement ... does not exist` | transaction mode (port 6543) | use port 5432, Session mode |
| API log: `DisallowedHost` or 400 on every call | `ALLOWED_HOSTS` does not name the service | set it to the real Render host |
| Sign in works but you are signed out after 15 minutes | the browser talks to Render directly | remove `VITE_API_BASE_URL` in Vercel, redeploy |
| `CSRF` or CORS errors | `CORS_ALLOWED_ORIGINS` is not the Vercel address | fix it on Render |
| `ssms-ai` build stops at the fingerprint | file at `MODEL_URL` is not the model you hashed | hash the uploaded file again |
| `ssms-ai` restarts, log says killed | out of memory on the 512 MB free plan | move `ssms-ai` to a paid plan, or convert the model to a smaller format |
| Health tab: disease check "unreachable" | the free service is asleep | open `/health` of `ssms-ai` once, it wakes in about a minute |
| GitHub job red | a missing secret | the log names the setting; add the secret and run it again |
| Render says the month's free hours are used up | two always-awake services exceed 750 hours | let `ssms-ai` sleep (it does when idle) and keep only the API awake |
