# Security

## Reporting a vulnerability

Please do not open a public issue. Email tuyisengeauris@gmail.com with what you found, how to reproduce it, and which version or commit you tested. You will get a reply within a few days.

## Known exposure

An early default database password for the local development database was committed to this repository (commits `b94b78f` and `9f7d6ed`; the content of those commits is still in the public history). Treat that password as public. Never reuse it for any account or service.

Secrets now live only in `.env`, which is git-ignored. Copy `.env.example` and fill in your own values.

## Support access

An admin can look at a farmer's or supervisor's account only with that person's consent, for at most 60 minutes, and the person can end it at any moment. The design is in `docs/deploy-runbook.md`, section 10.

- **Consent.** The request waits 5 minutes for a signed in person to answer. The email about it has no link that approves, so a copied or forwarded email cannot give access. An admin needs a fresh code from their authenticator app to ask and to start. Never an admin account, and never yourself.
- **Reach.** The support session acts as the person, so every role check and record scope applies unchanged. The admin can never reach more than the person can.
- **Writes.** View only refuses every write. Edit mode allows 19 listed writes and nothing else, and never a delete. The rule list is checked before any view runs and refuses what it does not know, so a new endpoint is blocked until it is added by hand. A test walks every route.
- **Ending.** Each side can end it at once. It also ends when the time is up, when the person signs out everywhere or changes their password, and when the admin signs out, is deactivated or is demoted. Authority is read from the database on every request, never from the token alone.
- **Records.** Security events, audit entries under the real admin's name "on behalf of" the person, and every request of the visit in the request log. The person has a list of every request about their account, including the ones they refused.
- **Not built.** An emergency path that skips consent, recording the screen, and approving from an email.

## Rotation log

- Database password rotation: pending, to be done by the repository owner. Update this line when it is done.
