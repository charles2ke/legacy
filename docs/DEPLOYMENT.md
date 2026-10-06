# Deployment

No provider is selected, provisioned or authorized by this repository for the
full platform. GitHub Pages cannot run Express, SQLite, sessions, migrations or
recovery email, so it only hosts a read-only copy of the public directory (see
below). Static Pages hosting is not a deployment of the full platform.

## Read-only copy on GitHub Pages

`.github/workflows/pages.yml` runs `npm run build:pages` on every push to `main`
(or a manual run on `main`) and deploys `_site/` to GitHub Pages. Pull request
code is never deployed. The copy contains:

- `index.html`, `profiles.html`, `profile.html` and `contribute.html`, marked
  with `data-legacy-static` so they read `data/profiles.json` and
  `data/config.json` instead of `/api/*`, using relative paths that work under
  a project path such as `/legacy/`;
- the browser code those pages need (not `assets/js/app.js`);
- the profiles committed to `profiles/` that pass `npm run validate` as a
  **public** instance. The build always validates as public, whatever
  `LEGACY_INSTANCE` says, because a Pages site is public even when its
  repository is private. Profiles in the database — accounts, drafts, pending
  or approved revisions — are never published there.

Sign-in and sign-up links are hidden on that copy, and the contribution page
says accounts need the full platform. Search, filters and pagination run in the
browser with the same rules as `/api/profiles`.

To turn it on, a maintainer sets **Settings → Pages → Source** to
**GitHub Actions**. To show a private removal contact, set the repository
variable `PUBLIC_REMOVAL_URL` to an `https://` or `mailto:` address; anything
else fails the build. Removing a profile from `profiles/` removes it from the
next deployment, but earlier copies, forks and Git history may persist.

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
It also builds the GitHub Pages copy and checks it in Chromium. It uses no
pull-request secrets and does not deploy. Actual hosting, TLS,
persistent storage, SMTP delivery, monitoring and a private removal route remain
external configuration work.
