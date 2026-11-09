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
6. Watch the `ssms-api` build log. `build.sh` installs the packages, then runs `check --deploy`, `migrate`, `createcachetable` and `collectstatic` against Supabase. A failure there stops the deploy and leaves the running copy alone. The start log then shows only uvicorn.

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

- **Working hours.** Render puts a free service to sleep after 15 minutes without a request, so something must ask for `/api/health` more often than that from 06:00 to 20:00 in Rwanda (04:00 to 18:00 UTC, UTC+2 with no daylight saving). GitHub's schedule cannot be that something: on 5 to 6 November 2026 the `*/5` schedule started only 4 runs in 20 hours, and GitHub says scheduled runs can be delayed when it is busy. `jobs-frequent.yml` still runs `run_health_checks --awake-hours-utc 4-18` for the Health tab history, but treat any ping it sends as a bonus. Use an outside pinger instead (section 3, "Outside monitor"): a free account on cron-job.org or UptimeRobot, a GET of `https://<api>/api/health` every 5 minutes. Limit it to 06:00 to 20:00 Rwanda time if the service lets you. Render's 750 free hours are shared by the whole workspace: 14 hours a day for a month is about 420, and a pinger that runs all night would use about 720 and starve the other service.
- **The first visit after the API slept.** The website shows "The server is waking up" and tries again by itself for up to 90 seconds. Only reads and sign in are repeated, never a save. A wake runs the start command again, so `start.sh` only starts the server (the build already ran `check`, `migrate`, `createcachetable` and `collectstatic` and left `.setup_done`). To confirm, wake the API and read its log: there must be no `migrate` lines before uvicorn starts. If there are, the marker did not survive the spin-down and the old, slower wake is back.
- **Database pool.** The API shares 1 to 4 database connections (`DB_POOL_MAX`, default 4). Supabase's session pooler allows 15 at once, and a deploy briefly runs two copies of the API, so 4 each stays under the limit with room for the GitHub jobs and your own terminal. If you raise `DB_POOL_MAX`, keep twice its value plus 4 under 15.
- **Fewer restarts.** `render.yaml` has a build filter, so a change that only touches `frontend/`, `docs/`, `tests/`, `scripts/`, `.github/`, `ai_service/` or a markdown file does not redeploy the API. If a docs only merge still starts a deploy, the filter patterns need adjusting for Render.
- **Rate limits count in memory.** Each API process keeps its own counts (`core/throttles.py`), because counting in the database cost six round trips to Supabase on every request. With one process (`WEB_CONCURRENCY=1`) the limits are exact. With more, each process allows the full rate, and a restart starts the counts again. Sign in lockout and code challenges stay in the database.
- **One worker, no restart after 1000 requests.** `start.sh` only tells uvicorn to replace a worker after 1000 requests when there are several workers. With one there is no supervisor, so the exit stopped the whole service until Render restarted it, a minute of "The server is waking up" after every 1000 requests.
- **Load test.** It proves the site holds about 50 people reading at once, each loading a page (three requests) and reading for 8 to 20 seconds, about 11 requests a second in all. Add `--stress` to make each person ask every half second to two seconds (about 40 a second) and find the ceiling. Free Render has a fraction of a laptop's CPU, so expect the stress run to fail there. That is information, not the verdict. Run it with the API awake, in working hours, and nobody else using the site.
  1. In your own terminal set `DATABASE_URL` as for `createsuperuser`, and set `JWT_SECRET` to the same value as on Render (the tokens are signed with it, and the API refuses any other signature). Then run `python manage.py prepare_load_test --users 50 --tokens-file load_tokens.json`.
  2. Right away (the tokens last 15 minutes): `python scripts/load_test.py https://<vercel address> --tokens-file load_tokens.json --minutes 3`.
  3. Pass means no failed request (a 429 counts as one) and a 95th percentile under 2 seconds. It prints each page's numbers.
  4. Clean up: delete `load_tokens.json`, then `python manage.py prepare_load_test --remove`, then close the terminal.
  
  The script only reads, but the 50 throwaway accounts exist in the live database until you remove them. The script stops at once with the reason if the site refuses the tokens (401, a wrong `JWT_SECRET`) or the address is rate limited (429). It also prints how many requests got each answer, and one example of each refusal with the headers that show who answered (`server`, `x-vercel-id`, `x-render-routing`) and the start of the body. Our API answers a refusal in JSON with a `reference`. A host in front answers in its own words. If many requests fail, send the printed summary. If there are no failures and the 95th percentile is high, the free CPU is the limit, which is the signal to look at a paid plan or another host.

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

## 10. Support access with consent

An admin can look at a farmer's or supervisor's account to help, but only after that person says yes, only for 15, 30 or 60 minutes, and the person can end it at any moment. Nothing here needs a setting or a key.

**How an admin asks**

1. Users page, the row of the farmer or supervisor, "Support access".
2. Write the reason (10 to 300 characters) and choose the length. Choose "Ask to make changes as well" only if you need to change something. **The person reads the reason.**
3. Give a code from your authenticator app when it asks. Starting a visit asks for a fresh code again if the first is older than 10 minutes.
4. Wait. The person has 5 minutes. The window shows when they allow or refuse. Press Start within 10 minutes of the answer.
5. While you are in, a bar at the top says whose account you are looking at, in which mode and how long is left. "End" stops it at once. If the page reloads, the bar offers "Continue" or "End".

**What the person sees**

- A question on their screen ("SSMS support wants to view your account") with your name, the reason and the length, and one email at the moment you ask (with no button that approves). Allow or Reject. Changes are allowed only if you asked for them and they tick the box.
- A bar for the whole visit with "End now".
- Settings, Security, "SSMS support visits": every request about their account, with its outcome and the reason, including the ones they refused or that ran out of time.
- The page of a farmer or supervisor asks every 30 seconds, and only while the tab is visible. A tab left open and hidden overnight does not keep the free server awake.

**What you can and cannot do**

- You act as the person, so you see and reach only what they can.
- View only: everything is read, nothing is changed.
- With changes allowed: create and edit farms, rooms, batches, mortality records, harvest records, devices, sensor readings, photo checks and alerts. **Nothing can be deleted**, and a harvest lot link cannot be shared.
- Never, in either mode: the password, email, role or account, signed in devices, invitations, second factor, the live alert stream, and every admin page.
- A new endpoint is refused until someone adds it to `core/support_rules.py`. `tests/test_support_rules.py` keeps the reviewed list of 19 allowed writes and fails when the code list changes.

**It ends when**

The time is up; either side ends it; the person signs out everywhere or changes their password; the person is deactivated or becomes an admin; or you sign out, are deactivated or are demoted.

**Where it is recorded**

- Logs, Security: `support_requested`, `support_allowed`, `support_rejected`, `support_started`, `support_ended`, `support_expired` and `support_refused` (an action that was blocked).
- Audit log: the change is under **your** name, "on behalf of" the person, with "(support access <id>)".
- Logs, Requests: every request of a visit is kept (the usual 5 percent sampling does not apply) and carries the support access id.
- Never a token or a code.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| "The support session has ended" in the middle of work | time is up, the person ended it, or your own sign in ended | ask again if you still need it |
| "Support access can only look, not change" | view only was allowed | ask again with "make changes" |
| "Support access cannot do that" | the action is not on the reviewed list | not a bug, see `core/support_rules.py` |
| Asking says you already have an open request | an earlier request is still waiting, allowed or running | withdraw or end it |
| The person never sees the question | the tab is hidden, or they have not opened the app | the email went to them at once. The question waits 5 minutes |

## 11. Room approval

A farmer's new room, and a change to the size of an approved room, waits for a supervisor to approve it. Only an approved room can hold a batch or a sensor. Nothing here needs a setting or a key.

**Who is asked**

- The active supervisors of the farmer's cooperative. Each gets an email of their own, with the farmer, the farm, the room and the size, and one button.
- A farmer whose cooperative has no active supervisor, or who is in no cooperative, goes to every active admin. The email says so.
- A room added by an admin is approved at once and tells nobody. A supervisor reaches only the rooms of their own cooperative. A room outside it is "not found".

**What each state can and cannot do**

| State | Batches | Sensors | What the farmer can do |
|---|---|---|---|
| Waiting | no | no | change the size (it stays waiting), rename |
| Approved | yes | yes | ask for a new size |
| Approved, size change waiting | yes, with the old size | yes | withdraw by entering the old size again |
| Not approved | no | no | enter a new size, which sends the room again |

- A new batch needs an approved room. A farm with none is told "Add a room and wait for your supervisor to approve it before you add a batch." The room "Room 1" is no longer made for a first batch.
- Rooms that existed before this change stay approved. Their size is empty until someone enters it, and a farmer's first size for such a room waits for a decision like any other.
- A rejection needs a reason, and the farmer reads it. A decision is final once made. Two reviewers deciding the same room at the same moment cannot both win; the second gets "Nothing waits for a decision on that room."
- The size is 1 to 5000 square metres, up to two decimals.

**Where the reviewer decides**

On the Decisions page (section 13), under the menu item "Decisions". The same actions are also in the API (`POST /api/rooms/<id>/review`, `GET /api/team/rooms?status=pending`). The email to a reviewer opens that page.

**Where it is recorded**

Audit log: the room added, a size asked for, and each decision with its reason.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| A farmer cannot add a batch | no approved room | a reviewer approves one |
| Nobody got the email | the mail server was down (the request still worked) | see Logs, Jobs, `email_failed`; the room shows in the API list |
| A supervisor sees nothing | the farmer is in another cooperative | an admin reviews it |

## 12. Allowance

Every farmer has a fixed number of egg boxes they may take per round. It is the base for the egg supply (rounds and requests come in the next steps). Nothing here needs a key. Two numbers need your attention (see "Numbers to confirm").

**Who sets what**

- **The cooperative default.** New farmers start with it unless the invitation says another amount. It starts at 2 boxes. An admin changes it on the cooperative's page, Details tab, "Egg supply settings". Changing it never moves an allowance that was already written.
- **The starter amount of one farmer.** The supervisor types it in the invite dialog ("Boxes per round", 0 to 100, filled with the default). Leave it empty to use the cooperative default. It is written when the farmer joins, with the supervisor as the one who set it.
- **A farmer who joined before this feature** has no row. They have the cooperative default, and the Farmers tab says "Cooperative default" under their amount. The first change writes the default into their history first, so the history always starts with what they really had.

**How an allowance changes**

- A farmer asks for a different amount with a reason (10 to 500 characters), from the Dashboard, "Your allowance" card. One request waits at a time, and the farmer can withdraw it.
- A supervisor of the farmer's cooperative (or an admin, when there is none) approves the amount asked, approves another amount, or declines with a reason. The farmer is emailed each time, and the mail names the amount granted.
- A supervisor can also **lower** an amount directly, with a reason, from the Farmers tab ("Lower"). A supervisor can never raise one. An admin may set any amount through the API.
- Every change is a line in the farmer's history (start, amendment, reduction) with who made it and why. The card shows the last change in words.
- An allowance counts only in the cooperative it was set in. A farmer taken out of one cooperative and invited to another starts again with the new cooperative's amount.

**What a supervisor can and cannot do today**

A request is decided on the Decisions page (section 13): approve the amount asked, approve another amount, or decline with a reason, with the farmer's history and rooms beside it. Lowering an amount and inviting with an amount are on the Farmers tab. The same actions are also in the API (`GET /api/supply/allowance/requests`, `POST /api/supply/allowance/requests/<id>/decision`).

**Numbers to confirm**

- The cooperative default of 2 boxes is a first guess taken from the design example. Confirm it, or change it per cooperative.
- "Space one box needs (m²)" is empty on purpose. It stays empty until a sericulture officer gives the number. While it is empty, the amount-request dialog does not say what the farmer's rooms can hold, and nothing is worked out from room sizes.

**Where it is recorded**

Audit log: each request, withdrawal, decision (with the reason or note), each direct change, and each settings change. The history of one farmer is on their own card.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| A farmer has no "Your allowance" card | they are in no cooperative, or the page could not load it | add them to a cooperative (invitation) |
| "You already have a request waiting" | an earlier request is still open | withdraw it, or decide it |
| A supervisor cannot raise an amount | by design | the farmer asks, or an admin sets it |
| "Nothing waits for a decision on that request" | another supervisor decided it first | refresh the list |
| The capacity line is missing in the ask dialog | the space per box is not set | an admin sets it once known |

## 13. Decisions

One page where a supervisor, or an admin, decides what waits for them: new rooms, room size changes and allowance requests. Nothing here needs a setting or a key. It is in the menu as "Decisions", right under the dashboard, with the number that wait. The dashboards show "{n} decisions wait for you" and link to it. The emails to reviewers (a room waits, an allowance request waits) open this page.

**Who sees what**

- A supervisor sees the items of their own cooperative. An admin sees every cooperative's. A farmer has no such page and gets "no permission" from its endpoints.
- A farmer with no supervisor in their cooperative, or in none, goes to every active admin, as before.

**The page**

- One list, the item waiting longest first. Filters: All, Rooms, Allowance, each with its count.
- **A room** (new, or a new size): the farmer, the farm, the room and the size. "Approve" acts at once and tells the farmer. "Reject" asks for a reason, which the farmer reads, and the button stays off until one is typed.
- **An allowance request**: the farmer, "Asks for 4 boxes, has 2 boxes" and their reason. "See details" shows the evidence: the farmer's history of amounts and their rooms with each size and what it can hold ("not known yet" until the space per box is set, "not approved yet" for a room that waits). Buttons: approve the amount asked, "Approve another amount" (0 to 100, with an optional note), and "Decline" (reason required).
- After each decision the item leaves, a toast says what happened, and the menu count drops.
- When another supervisor decided the same item first, the page says "Someone decided this already." and refreshes the list. Nothing is decided twice and no second email goes out.
- Everything a farmer typed (names, reasons, notes) is shown as plain text.

**Endpoints it uses**

`GET /api/team/decisions` (the count: rooms, allowance, total), `GET /api/team/rooms?status=pending`, `POST /api/rooms/<id>/review`, `GET /api/supply/allowance/requests`, `POST /api/supply/allowance/requests/<id>/decision` and `GET /api/supply/allowance/farmers/<id>` (the evidence).

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| "We could not load your decisions." | the API was asleep or one of the two lists failed | press "Try again" |
| The count in the menu and the list differ | the count is taken as the page changes | open another page, or decide something, and it recounts |
| An admin sees items of every cooperative | by design | the farmer's name and email tell whose they are |
| No Decisions item in the menu | the person is a farmer | only supervisors and admins have it |

## 14. Supply rounds

The cooperative hands eggs to its farmers in scheduled rounds. A farmer asks inside what their allowance and rooms allow, the supervisor confirms a fair split, and a batch is made, with a lot code, when the eggs arrive. Nothing here needs a key. Two numbers still need a sericulture officer (see "Numbers to confirm").

**The flow**

1. **Make a round** (Supply, "New round"): a name, the boxes in the round, the day and hour requests close, the delivery day and place, and the expected harvest date. The expected harvest is typed by the supervisor and given to every batch the round makes, because a cycle length is not ours to guess. A new round is a draft and nobody sees it.
2. **Open it.** Every active farmer of the cooperative gets one email, and the round gets its lot code (for example `L2611-4E42`). While it is open it can still be changed.
3. **Farmers ask** on their dashboard ("Egg supply", "Request eggs"). One request per farmer per round, in one of their approved rooms, with a note if they wish. The dialog says what they can ask for and why before they send.
4. **The requests close**, by the deadline or when the supervisor presses "Close requests". The round then shows in the Decisions inbox as a round to split.
5. **The split.** The page proposes a split and the supervisor may change any number. "Confirm split" tells every farmer who asked: approved, partly approved, on the waiting list, or not approved with the reason.
6. **Eggs are handed out.** The farmer, on their dashboard, or the supervisor for them (on the round's page, "Record receipt"), says how many boxes arrived and whether they were good or damaged. That makes the batch: in the room the farmer asked for, at the egg stage, in boxes, with the round's lot code and expected harvest date. A farmer who never collects is marked "Not collected" by hand.
7. **Done.** When every promise is received or marked not collected, the round is done.

**What a farmer may ask for**

The smallest of three numbers: their allowance, the free space of the room, and the boxes in the round.
- The room's space is its approved size divided by the space one box needs, minus the boxes already in it (batches still running, counted in boxes, and eggs promised and not yet received). A room that waits, was rejected or was deleted has none. With "one open batch per room" on (the default), a room with a batch that is not harvested has none either, so a farmer asks again only when the batch in that room is harvested.
- While the space one box needs is not set, no room cap is applied and the dialog says "The size of your room is not counted yet."
- When no room has space the card says so and offers no button.

**How the split is worked out**

Nobody gets more than they asked for, their allowance or their room can take. If there is enough stock everyone gets what they can take. If not, the stock is shared in proportion to what each can take, in whole boxes: the boxes left over go to the largest remainders, and ties go to the earlier request. The same input always gives the same split. The total can never pass the stock. Whoever gets nothing is on the waiting list, in request order, or declined if the supervisor writes a reason.

**Pausing and cancelling**

- **Pause** (for an outbreak): requests stay, and nothing is handed out until the round is resumed.
- **Cancel** needs a reason the farmers read. Requests that were still waiting for eggs are cancelled and their farmers are emailed. Eggs already received stay, and their batches stay.
- A farmer may cancel their own request until the eggs are received. A request made while the round was paused still counts.

**Who sees what**

A supervisor manages the rounds of their cooperative, and an admin may read and manage any. A farmer sees the round of their own cooperative and only their own request. Everything outside is "not found". An admin makes a round through the API (the Supply page names no cooperative); supervisors have the button.

**Numbers to confirm**

- The space one box needs (cooperative page, Details tab, "Egg supply settings") is empty until a sericulture officer says. It is also the first thing to check when a farmer asks why a room "has no space".
- "One open batch per room" is on for every cooperative. It has no screen yet, so turning it off is a change in the database (`supply_settings.oneOpenBatchPerRoom`).

**Where it is recorded**

Audit log: each round made, changed, opened, closed, paused, resumed and cancelled (with the reason), each request and cancellation, the confirmed split (the total), each receipt (with "for {farmer}" when a supervisor recorded it), and each not collected.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| A farmer sees no round | it is still a draft, or it belongs to another cooperative | open it |
| "None of your rooms has space for eggs now." | the room is not approved, or holds a batch, or is full | approve the room, or wait for the batch to be harvested |
| "The deadline for this round has passed." | the request came after the deadline | change the deadline of an open round, or open a new round |
| "This round was already confirmed." | another supervisor confirmed first | refresh the page |
| "This round is paused, so nothing is handed out now." | the round is paused | resume it |
| "These eggs were already recorded as received." | the farmer and the supervisor both tapped | nothing to do, one batch was made |
| A confirmed round never becomes done | a promise is neither received nor marked not collected | mark it, or record the receipt |

## 15. Getting started

A new farmer sees a "Getting started" list on their dashboard, with four steps in order: join a cooperative, add a farm, add a room and get it approved, get eggs. The first step that is not done is marked "Next" (or "Waiting" when only someone else can move it), the ones after it "Later". It tells the farmer what is next and who they are waiting for. Nothing here needs a key and nothing is emailed.

**How each step is decided**

| Step | Done when | Otherwise the farmer sees |
|---|---|---|
| Join your cooperative | the farmer belongs to a cooperative | "Ask your supervisor for an invitation link." |
| Add your farm | the farmer has a farm | a link to the farm form |
| Add a room and get it approved | a room of theirs is approved | a link to the farm page, or "Waiting for {names} to approve it." (the supervisors and admins who can decide), or the reason it was not approved and what to change |
| Get your eggs | the farmer has received eggs, or has a running batch | the state of the round: none open, open and ready to request, open but no approved room, request waiting, approved (boxes, day and place), or not given this time with the reason |

The list goes away by itself once the eggs step is done or the farmer has an active batch. If it cannot be loaded the dashboard shows without it.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| "Waiting for ... to approve it." for days | the room waits in the Decisions inbox | ask the supervisor to open Decisions |
| The list never goes away | the farmer has no received eggs and no active batch | it is correct, they are not past every step yet |
| "No eggs this time" | the request was on the waiting list or declined | the farmer asks again in the next round |

## 16. Earned allowances

When a farmer finishes a lot made from a supply round in good order, the system may suggest one more box. The suggestion waits in the supervisor's Decisions inbox, under Allowance, with two buttons: "Approve" and "Not now". The supervisor decides, the system never raises an allowance by itself.

**The rule**

A suggestion is made when a harvest is recorded, for a batch that came from a supply round, if all of these hold:

1. The farmer is in the cooperative that ran the round, today.
2. Their allowance is at least 1 box, and they received at least that many boxes (they used all of what they were allowed).
3. The batch has no open disease alert.
4. The farmer has no allowance request waiting.
5. The batch has no suggestion yet (one per lot).
6. One more box is still under the highest allowance (100), and, when the space one box needs is known, still within what their rooms can hold.

The suggested amount is the current allowance plus one box. A larger step is for a supervisor to give with an amendment on the farmer's allowance card. Mortality is not used, because it needs the worms per box that a sericulture officer has to give.

**What the supervisor can do**

- **Approve** raises the allowance by one box, writes a line in the farmer's allowance history ("Finished lot {code} in good order"), and sends the farmer one friendly email. If the allowance changed since the suggestion was made, or the farmer left the cooperative, it is closed as no longer applicable and nothing changes.
- **Not now** closes the suggestion and tells nobody. The same lot is not suggested again.
- Two supervisors acting at once: one wins, the other sees "Someone decided this already."

**Who sees what**

A supervisor sees the suggestions of their cooperative, an admin sees all. Support access is read only.

**Where it is recorded**

Audit log: each approval and each "Not now", with the farmer and the lot. The allowance history holds the raised amount.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| No suggestion after a good lot | one of the six conditions above is not met, often because the farmer took fewer boxes than their allowance | nothing, or amend the allowance by hand |
| "This farmer's allowance changed since, so this no longer applies." | the allowance was changed after the suggestion | nothing, the suggestion is closed |
| The harvest worked but no suggestion was made | the check failed and was logged, the harvest is never blocked | read the API log for "earned allowance" |

## 17. Lot tracing

Every batch made from a supply round carries the round's lot code (for example `L2611-4E42`). When a disease shows up on one farm, a supervisor or admin can see every farm that got the same lot of eggs and how each of those batches is doing. Nothing here changes data and nothing needs a key.

**How to get to it**

- From **Disease checks**: a row whose batch came from a round shows "Egg lot {code}". Farmers do not see this link.
- From a **batch page**: the lot code is in the batch facts, and it is a link for supervisors and admins. A farmer sees their own lot code as plain text, with no way to other farmers.
- Or open `/supply/lots/<code>` directly.

**What the page shows**

The round the lot came from (a link), five counts (batches, farms, with disease, healthy, not checked), and one row per batch: the farmer and farm, the room, the batch (a link) with its stage and quantity, how it is doing, and the last check with its date.

**How "how it is doing" is decided**

From the latest disease check of that batch only. A batch recovers when its newest check says Healthy.
- **Disease found**: the latest check says Grasserie.
- **Healthy**: the latest check says Healthy.
- **Not checked**: no check yet. A batch nobody has checked is never shown as healthy.

A batch with a disease alert that nobody has closed also carries an "Open alert" mark. The rows are in the order to look at them: disease first, then not checked, then healthy, the oldest batch first.

**Who sees what**

A supervisor sees the batches of their own cooperative's farmers, an admin sees all. A lot of another cooperative, and a lot that does not exist, give the same "We could not find that lot." Archived batches are left out, as everywhere else. A batch the farmer started by hand has no lot code, so it is in no lot.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| "We could not find that lot." for a code you were given | it belongs to another cooperative, or every batch of it was archived | sign in as that cooperative's supervisor, or an admin |
| A disease check row has no lot link | the batch was started by hand, or you are signed in as a farmer | nothing, there is no lot to follow |
| A batch shows "Not checked" although the farmer says they checked | the photo was not a clear silkworm, so the check was not kept | ask for a new photo |
| The page says "We could not load this lot." | the API was asleep or unreachable | press Try again |

## 18. API documentation

The API describes itself in OpenAPI, and a Swagger page shows it. Nothing here needs a key and nothing is stored.

**Where**

- `/api/docs/` is the Swagger page. On the live site it is `https://ssms-django.vercel.app/api/docs/` (Vercel passes `/api` to Render).
- `/api/schema/` is the OpenAPI JSON, for Postman, Insomnia or a client generator.
- `python manage.py spectacular --file openapi.yaml` writes a YAML file.

**What each route shows**

What it does (from the view's own docstring), whether it needs a sign in (a lock), **who may call it** (Farmer, Supervisor, Admin, read from `core/permissions_table.py`, the table the server enforces), and the answers it can give. An error answer is listed only when it can happen: 401 on a signed in route, 403 when some role is refused, 404 when the path names a record, 422 on a write, 429 always. Every answer uses the same envelope, described once.

The request and response bodies of individual routes are not listed, because the views build them as plain dictionaries. The description of a route holds the field names where the code says them.

**To try a route**

Press Authorize, paste the access token from `POST /api/auth/login` (the answer's `data.token`) and use "Try it out". An admin's token needs the second factor first. The page does not store the token.

**Safety**

- The page loads Swagger from files served by the API itself, so it needs no outside host. It has its own security policy with a script nonce that changes on every response, and the rest of the API keeps the strict `default-src 'none'`.
- The schema holds no example values, so no credentials. A test checks that.
- Only two files can be fetched under `/api/docs/assets/` (a fixed list). Anything else is 404.
- The docs are open to anyone, like the route list in the README. To switch them off, set `API_DOCS_ENABLED=false` on Render. All three addresses then answer 404.

**If something looks wrong**

| What you see | Likely cause | What to do |
|---|---|---|
| `/api/docs/` is a blank page | the browser blocked the script, or a proxy removed the policy header | open the console. The page needs `script-src` with its nonce |
| 404 on `/api/docs/` | `API_DOCS_ENABLED=false` | set it to true and redeploy |
| "Try it out" answers 401 | no token, or it ended after 15 minutes | sign in again and paste a new token |
| A new route is missing from the page | the page keeps the schema for the life of the process | restart or redeploy. A test fails if a route is not described |
| `manage.py spectacular` prints warnings | a new view the generator cannot read | `tests/test_api_schema.py` fails on any warning. Fix the view |

## 19. If something fails

| What you see | Likely cause | Fix |
|---|---|---|
| Build fails on `pip install` | wrong Python on Render | check `PYTHON_VERSION` in the service's environment |
| `could not translate host name` or `Network is unreachable` | the direct Supabase address (IPv6) | use the Session pooler string |
| `password authentication failed` | wrong password or an unencoded symbol | reset the database password, use letters and digits |
| `EMAXCONNSESSION max clients reached` | database connections left open, the session pooler allows 15 | connections now close after each request. If a deploy still fails, suspend `ssms-api` in Render for a minute so the old ones drop, then resume |
| The Render wake page stays on "application loading" for minutes, or a terminal using the database says `PoolTimeout` | the Supabase session pooler is out of client slots (Postgres itself looks idle in `pg_stat_activity`, because the limit is on the pooler) | suspend `ssms-api` for 2 minutes, then resume. Read the service Logs tab: the last line before it stops names the step |
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
