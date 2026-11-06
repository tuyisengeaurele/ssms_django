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
5. Read the real address of each service on its page. Render adds a random suffix when a name is taken (for example `ssms-api-cmqa.onrender.com`), and the bare name then belongs to someone else. Put the real addresses in `ALLOWED_HOSTS`, `HEALTH_API_URL` and `AI_SERVICE_URL` in `render.yaml`, in the `/api` rewrite and `connect-src` in `frontend/vercel.json`, and in the GitHub secrets. The API also trusts the host Render reports (`RENDER_EXTERNAL_HOSTNAME`) by itself, which is what lets it start before those files are fixed.
6. Watch the `ssms-api` log. It runs `migrate` against Supabase, then starts.

## 5. Vercel (the website)

1. Do not set `VITE_API_BASE_URL` in Vercel. When it is missing the site calls `/api`, which Vercel forwards.
2. Redeploy after the merge so the `/api` rewrite is live.
3. Check that `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` on Render are the real Vercel address, as the project's **Domains** page shows it. A short name such as `ssms.vercel.app` is probably another account's site: ours is `ssms-django.vercel.app`.

## 6. Check it works

- `https://<vercel address>/api/health` answers. The first call after idle takes about a minute.
- Create the first admin account: `python manage.py createsuperuser` against Supabase from your laptop (type the `DATABASE_URL` into your own terminal for that one command, then close it). Test sites get demo data with `seed_demo`. Real farmer data never goes on a test site.
- Sign in, stay on a page 16 minutes, reload: still signed in. That proves the cookie works through the proxy.
- Admin, System, Health tab: ten cards. Press each test button once.
- The alert bell still receives a live alert (the live stream goes through the Vercel forward).
- Audit log shows your real address, not a Vercel or Render address. If every visitor shows the same address, `TRUSTED_PROXY_COUNT` is wrong: try `1` or `3` and reload.
- `python scripts/smoke_deploy.py https://<vercel address> --site https://<vercel address>` with `SMOKE_EMAIL` and `SMOKE_PASSWORD` set to a throwaway account.

## 7. Outside monitor

On the free plan, do not point a 24 hour monitor at the API. It would keep the API awake all night and use about 720 of Render's 750 free hours a month, shared by every free service in the workspace. The GitHub job already pings the API during working hours (section 8) and its failures show on the Health tab. A monitor that can only run in a time window, or a paid plan, is fine.

## 8. Working hours, the database pool and the load test

Meant for about 50 people at once on the free plans, between 06:00 and 20:00 in Rwanda.

- **Working hours.** `.github/workflows/jobs-frequent.yml` runs `run_health_checks --awake-hours-utc 4-18`. That is 04:00 to 18:00 UTC, or 06:00 to 20:00 in Rwanda (UTC+2, no daylight saving). Inside it the job pings the API, which keeps it awake. Outside it the API is left alone and sleeps after 15 minutes, which keeps Render's 750 free hours for the month. To change the hours, change the two numbers in that file. The Health tab shows no Web API rows at night. That is expected.
- **The first visit after the API slept** takes about a minute. The website shows "The server is waking up" and tries again by itself for up to 90 seconds. Only reads and sign in are repeated, never a save.
- **Database pool.** The API shares 1 to 4 database connections (`DB_POOL_MAX`, default 4). Supabase's session pooler allows 15 at once, and a deploy briefly runs two copies of the API, so 4 each stays under the limit with room for the GitHub jobs and your own terminal. If you raise `DB_POOL_MAX`, keep twice its value plus 4 under 15.
- **Fewer restarts.** `render.yaml` has a build filter, so a change that only touches `frontend/`, `docs/`, `tests/`, `scripts/`, `.github/`, `ai_service/` or a markdown file does not redeploy the API. If a docs only merge still starts a deploy, the filter patterns need adjusting for Render.
- **Rate limits count in memory.** Each API process keeps its own counts (`core/throttles.py`), because counting in the database cost six round trips to Supabase on every request. With one process (`WEB_CONCURRENCY=1`) the limits are exact. With more, each process allows the full rate, and a restart starts the counts again. Sign in lockout and code challenges stay in the database.
- **Load test.** It proves the site holds about 50 people reading at once. Run it with the API awake, in working hours, and nobody else using the site.
  1. In your own terminal set `DATABASE_URL` as for `createsuperuser`, and set `JWT_SECRET` to the same value as on Render (the tokens are signed with it, and the API refuses any other signature). Then run `python manage.py prepare_load_test --users 50 --tokens-file load_tokens.json`.
  2. Right away (the tokens last 15 minutes): `python scripts/load_test.py https://<vercel address> --tokens-file load_tokens.json --minutes 3`.
  3. Pass means no failed request (a 429 counts as one) and a 95th percentile under 2 seconds. It prints each page's numbers.
  4. Clean up: delete `load_tokens.json`, then `python manage.py prepare_load_test --remove`, then close the terminal.
  
  The script only reads, but the 50 throwaway accounts exist in the live database until you remove them. The script stops at once with the reason if the site refuses the tokens (401, a wrong `JWT_SECRET`) or the address is rate limited (429). It also prints how many requests got each answer. If many requests fail, send the printed summary. If there are no failures and the 95th percentile is high, the free CPU is the limit, which is the signal to look at a paid plan or another host.

## 9. Admin second factor

Every admin signs in with a password and then a 6 digit code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar). The first sign in after this ships goes through set-up: install the app, scan the QR code, type a code, and keep the 8 recovery codes. Supervisors and farmers sign in as before.

**Before the first deploy that has it**

1. Make a key and keep a copy in a password manager. Losing it makes every stored secret unreadable, and the way out is the reset command below.

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. In Render, `ssms-api`, Environment, add `MFA_ENCRYPTION_KEY` with that value and save. Do not put it in GitHub: the scheduled jobs do not need it.
3. Then merge. If the key is missing, the deploy stops at `check --deploy` (`ssms.E001`) before the running copy is replaced, so the site stays up. Set the key and deploy again.

**After the deploy**

- Any admin who was signed in is signed out once. Sign in, set up the app, and save the recovery codes somewhere that is not the phone.
- Settings, Security shows whether the app is on and how many recovery codes are left, and makes new ones (it asks for a current code, and the old codes stop working).
- A code that is refused for a person who typed it right usually means the phone clock is off. Turn on automatic date and time.

**Losing the phone**

1. Use a recovery code at the code step ("Use a recovery code"). Each works once.
2. No recovery codes? Another admin opens Users and presses "Reset authenticator" on your row. It asks them for their own code, signs you out everywhere, and sends you an email. You set up the app again at your next sign in. An admin cannot reset themselves.
3. No other admin? The last resort is from your own terminal, as for `createsuperuser`. Type the database address at the prompt, run the command with your email, clear the address and close the terminal:

   ```powershell
   $env:DATABASE_URL = Read-Host "DATABASE_URL"
   venv\Scripts\python manage.py reset_admin_mfa you@example.rw
   Remove-Item Env:DATABASE_URL
   ```

Never paste the key, a recovery code or the database address into a chat or a screenshot.

## 10. If something fails

| What you see | Likely cause | Fix |
|---|---|---|
| Build fails on `pip install` | wrong Python on Render | check `PYTHON_VERSION` in the service's environment |
| `could not translate host name` or `Network is unreachable` | the direct Supabase address (IPv6) | use the Session pooler string |
| `password authentication failed` | wrong password or an unencoded symbol | reset the database password, use letters and digits |
| `EMAXCONNSESSION max clients reached` | database connections left open, the session pooler allows 15 | connections now close after each request. If a deploy still fails, suspend `ssms-api` in Render for a minute so the old ones drop, then resume |
| `prepared statement ... does not exist` | transaction mode (port 6543) | use port 5432, Session mode |
| API log: `DisallowedHost` or 400 on every call | `ALLOWED_HOSTS` does not name the service | set it to the real Render host |
| Sign in works but you are signed out after 15 minutes | the browser talks to Render directly | remove `VITE_API_BASE_URL` in Vercel, redeploy |
| `CSRF` or CORS errors | `CORS_ALLOWED_ORIGINS` is not the Vercel address | fix it on Render |
| `ssms-ai` build stops at the fingerprint | file at `MODEL_URL` is not the model you hashed | hash the uploaded file again |
| `ssms-ai` restarts, log says killed | out of memory on the 512 MB free plan | move `ssms-ai` to a paid plan, or convert the model to a smaller format |
| Health tab: disease check "unreachable" | the free service is asleep | open `/health` of `ssms-ai` once, it wakes in about a minute |
| GitHub job red | a missing secret | the log names the setting; add the secret and run it again |
| Deploy stops at `ssms.E001` | `MFA_ENCRYPTION_KEY` is missing or is not a valid key | make a key (section 9), set it on `ssms-api`, deploy again. The running site stays up meanwhile |
| An admin is sent back to sign in and asked for a code | the session never passed a code (signed in before this shipped, or just promoted to admin) | sign in again. It asks for the code, or for set-up |
| An admin's code is always refused | the phone clock is off, or the key was changed after the app was set up | turn on automatic time. After a key change, run `reset_admin_mfa` and set up again |
| Render says the month's free hours are used up | two always-awake services exceed 750 hours | let `ssms-ai` sleep (it does when idle) and keep only the API awake |
