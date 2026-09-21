# Deployment

No provider is selected, provisioned or authorized by this repository. GitHub
Pages cannot run Express, SQLite, sessions, migrations or recovery email, so the
former Pages deployment workflow has been removed. Static Pages hosting is not
a deployment of the full platform.

## Production requirements

- Node.js 24 or later
- an HTTPS reverse proxy or platform ingress
- a persistent, access-controlled volume for `DATABASE_PATH`
- durable encrypted database backups
- a random `SESSION_SECRET` of at least 32 characters
- `APP_BASE_URL` using the real HTTPS origin
- SMTP credentials if password recovery email is expected to work
- an optional real `PUBLIC_REMOVAL_URL`

Install reproducibly and initialize the schema:

```bash
npm ci --omit=dev
NODE_ENV=production npm run migrate
NODE_ENV=production npm start
```

Create the first moderator through a trusted shell as documented in the README.
Never expose moderator bootstrap variables to client code or CI logs.

If HTTPS terminates at exactly one trusted proxy, set `TRUST_PROXY=1`; otherwise
leave it off. Use one application instance with SQLite unless the chosen
platform provides a carefully tested shared-database design. Run migrations
before starting new code and back up before upgrades.

## Email

Configure every required SMTP field in `.env.example`. A successful local test
with `DEV_RECOVERY_LOG` does not verify SMTP delivery. Test the selected
provider, sender authorization, bounce behavior and abuse controls before
claiming recovery email works.

## CI and external blockers

CI installs locked dependencies, audits runtime packages, validates JSON,
checks production source and runs tests with read-only repository permission.
It uses no pull-request secrets and does not deploy. Actual hosting, TLS,
persistent storage, SMTP delivery, monitoring and a private removal route remain
external configuration work.
