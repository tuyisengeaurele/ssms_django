# Security

## Reporting a vulnerability

Please do not open a public issue. Email tuyisengeauris@gmail.com with what you found, how to reproduce it, and which version or commit you tested. You will get a reply within a few days.

## Known exposure

An early default database password for the local development database was committed to this repository (commits `b94b78f` and `9f7d6ed`; the content of those commits is still in the public history). Treat that password as public. Never reuse it for any account or service.

Secrets now live only in `.env`, which is git-ignored. Copy `.env.example` and fill in your own values.

## Rotation log

- Database password rotation: pending, to be done by the repository owner. Update this line when it is done.
