# Working on SSMS

Smart Sericulture Management System. A few habits keep the history and the code easy to read.

## One-time setup

```bash
git config core.hooksPath .githooks
```

The hooks check every commit message and every line you add. They also keep Git LFS working.

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
- Run the checker tests with `python -m unittest scripts.tests.test_check_content`.
- Run the backend tests with `python manage.py test`.
- In `frontend/`, run `npx tsc --noEmit` and `npm run build` before you push.

## Interface

- Every visible string exists in English, French and Kinyarwanda.
- Everything works with a keyboard. Text contrast meets WCAG AA.
- Motion stops when the user asks for reduced motion.
- Images are compressed, sized and lazy loaded below the fold.

## Secrets

- `.env` files never leave your machine. Add new variables to `.env.example` with a fake value.
- If a secret ever lands in a commit, rotate it. Do not rely on deleting the commit.
