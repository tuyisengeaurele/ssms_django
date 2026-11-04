# Working on SSMS

Smart Sericulture Management System. A few habits keep the history and the code easy to read.

## One-time setup

```bash
git config core.hooksPath .githooks
```

The hooks check every commit message and every line you add. They also keep Git LFS working.

## Running the API

Use uvicorn, not `manage.py runserver`. The live alert stream is an async response, and runserver
cannot stream it.

```bash
venv/Scripts/python -m uvicorn ssms_django.asgi:application --reload --port 8000
```

or `make dev-api`. After pulling the cache change, run `python manage.py createcachetable` once.

## Running the AI service

The AI service only answers requests that carry the shared secret, and it will not start without one.
Put the same long random text in the API's `.env` and in the service's environment:

```bash
# in .env of the API
AI_SERVICE_SECRET=<long random text>

# when starting the AI service
AI_SERVICE_SECRET=<the same text> uvicorn main:app --port 8001
```

For quick local work only, start the service with `AI_ALLOW_INSECURE=1` instead and leave the secret out of both.
To test the service on its own: `cd ai_service`, create a venv, `pip install -r requirements-dev.txt`, then `pytest`.

## Branches

- Never commit on `master`.
- Name branches by kind: `feature/landing-hero`, `fix/login-lockout`, `chore/dev-rules`.
- Keep a branch to one piece of work. Open a pull request into `master` when it is ready.
- Rebase on `master` before you open the pull request. Merge with "Rebase and merge" so the small commits stay visible.

## Commits

- One idea per commit.
- A short plain sentence in the imperative: `Add floating nav`, `Fix refresh after logout`.
- Subject under 72 characters. Add a body only when the reason is not obvious.
- No trailers, no tool footers, no emoji.
- The author is you. Nothing else goes in the history.

## Writing

- No em dashes or en dashes anywhere: code, comments, docs, UI text, emails. Use a comma, a colon, a full stop, or "to".
- Write like a person. Short sentences. No buzzwords. The checker keeps the list.
- Comments say why, not what. If the code already says it, skip the comment.
- Only true numbers on the site. No made up testimonials or logos.

Check a file or the whole repo:

```bash
python scripts/check_content.py path/to/file
python scripts/check_content.py --all
```

## Tests

- Every fix starts with a test that fails for the right reason.
- Every new behaviour ships with a test.
- Run the backend tests with `python -m pytest -q`. They need a local Postgres (see `.env.example`). The checker tests under `scripts/tests` run in the same command.
- Run `ruff check .` for the Python style checks.
- In `frontend/`, run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` before you push.
- GitHub runs all of these on every pull request (`.github/workflows/ci.yml`), plus `pip-audit`, `npm audit` for the packages that ship to the browser, `manage.py check --deploy` and an 80 percent coverage gate on the backend. A red check means the pull request waits.

## Who may do what

- Every API view names its `resource` and uses `permission_classes = [IsAuthenticated, RolePermission]`. What each role may do on it is one line in `core/permissions_table.py`. Do not check `request.user.role` by hand.
- A view with no entry fails `tests/security/test_permission_walk.py`. A view that is open to anyone has to be added to its `PUBLIC` list by hand.
- Which records a role reaches is `core/access.py`, not the table.
- When an admin changes data a farmer owns, pass `owner=on_behalf_of(request, farm)` to `log_action`, so the audit log says whose it was.

## Logs

- Every answer carries a reference (`X-Request-ID`), and every error body has it as `reference`. Log lines are JSON with `request_id`.
- Four streams, all under System, Logs: audit (who changed what), security (sign ins, refusals), requests (failures and a sample) and jobs (mail, devices, commands).
- Never log a body, a header, a query or a token. The request log keeps the route pattern, never the address that was typed. Pass `changes=` to `log_action` for what a field was and became: `build_changes` hides anything that looks like a secret.
- A new scheduled command extends `logs.jobs.LoggedCommand`, so its runs show up.

## Interface

- Every visible string exists in English, French and Kinyarwanda.
- Everything works with a keyboard. Text contrast meets WCAG AA.
- Motion stops when the user asks for reduced motion.
- Images are compressed, sized and lazy loaded below the fold.

## Secrets

- `.env` files never leave your machine. Add new variables to `.env.example` with a fake value.
- If a secret ever lands in a commit, rotate it. Do not rely on deleting the commit.
