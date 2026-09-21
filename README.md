# Legacy

Legacy is a runnable, moderated digital legacy platform. People create private
accounts and drafts, explicitly consent to publication, and submit profiles for
moderator review. Only an approved revision can appear in the public directory.

It cannot promise permanent hosting, prevent all copies, verify identity, or
ensure that anyone is never forgotten. Keep independent copies of important
material.

## Architecture

- Node.js 24 and Express serve the site and JSON API.
- SQLite stores accounts, sessions, drafts, approved revisions, private
  feedback, recovery tokens and a minimal audit trail.
- `express-session` uses an application SQLite store. Cookies are HTTP-only,
  SameSite=Lax, and Secure in production.
- Argon2id hashes passwords. `csrf-sync` protects state-changing API requests.
- `assets/js/profile-schema.js` remains the shared profile validator used by
  the browser-era JSON checks and the backend.
- Nodemailer sends password recovery mail only when SMTP is configured.

The application does not upload files or fetch submitted URLs server-side.
Profile content is rendered as text, and links are restricted to validated
schemes.

## Run locally

Requirements: Node.js 24 or later.

```bash
npm ci
cp .env.example .env
export SESSION_SECRET="$(openssl rand -hex 32)"
export DATABASE_PATH=data/legacy.sqlite
export APP_BASE_URL=http://localhost:3000
export DEV_RECOVERY_LOG=true
npm run migrate
npm start
```

Open <http://localhost:3000>. `.env` is an example/reference; export variables
in your shell or use your process manager's environment support. Never commit
the real values.

`DEV_RECOVERY_LOG=true` prints reset links to the server console and is rejected
in production. It is explicitly local-only. Without SMTP or that development
flag, the recovery page truthfully reports that delivery is not configured.

## Moderator bootstrap

There are no default credentials and users cannot promote themselves:

```bash
MODERATOR_EMAIL=moderator@example.org \
MODERATOR_PASSWORD='use-a-unique-password-manager-value' \
npm run moderator:create
```

Run this through a trusted production shell with the same `DATABASE_PATH` and
`SESSION_SECRET` configuration as the application. The command creates or
promotes only the named account and hashes its password with Argon2id.

## Commands

```bash
npm run migrate       # apply the idempotent SQLite schema
npm start             # start the application
npm test              # run all Node tests
npm run validate      # validate retained JSON archive files
npm run build         # validation and production source checks
npm run test:e2e      # browser lifecycle test (requires its documented env)
npm audit --omit=dev  # check runtime dependencies
```

## Validation status

On 2026-09-21 the implementation was checked locally with:

- `npm run build` — profile validation and source checks passed.
- `npm test` — all 50 tests passed.
- `npm audit --omit=dev` — 0 known runtime vulnerabilities.
- a migration smoke test and JSON import smoke test — passed; the imported
  profile remained unowned and unpublished.
- `npm run test:e2e` — owner editing/submission, moderator approval, public
  directory and public detail passed in Chromium; four screenshots were
  generated.

These results do not verify external SMTP delivery, production TLS, persistent
hosting, backups, monitoring or a real private removal contact. Those remain
unconfigured deployment responsibilities.

## Configuration

See `.env.example`.

- `SESSION_SECRET`: required, at least 32 characters; use a random secret.
- `DATABASE_PATH`: persistent SQLite path.
- `APP_BASE_URL`: public origin; HTTPS is required in production.
- `TRUST_PROXY=1`: only when one trusted reverse proxy terminates HTTPS.
- `PUBLIC_REMOVAL_URL`: optional `https://` contact form or `mailto:` link. If
  absent, the UI clearly says the private route is unconfigured.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM`: configure all required SMTP fields together.
- `DEV_RECOVERY_LOG`: local development only.

No email provider, hosting provider, contact address, or production deployment
is included or implied.

CI runs the same Playwright lifecycle and uploads `browser-screenshots` as a
workflow artifact on every run. The test requires `BROWSER_OWNER_EMAIL`,
`BROWSER_OWNER_PASSWORD`, `MODERATOR_EMAIL` and `MODERATOR_PASSWORD`; CI uses
non-secret, isolated test-only values.

## Data and moderation

Profile states are `draft`, `pending`, `approved`, and `rejected`. An approved
revision remains separate from later edits, so a pending or rejected edit never
leaks publicly. Owners can unpublish or delete their profiles. Public list,
search, slug, and ID endpoints query only `approved_revision_id`.

Profiles retain the original required fields (`slug`, `name`, `introduction`,
`story`, and `carryForward`) plus optional values, work, memories, image and
fictional label. The latest `main` additions are also supported: a longer
`autobiography`, general `links`, and consent-sensitive `family` relationships.
The shared schema validates their sizes, relationship vocabulary, related
profile slugs and URL schemes before any draft can be saved.

### Profile length limits

| Field | Maximum characters |
| --- | --- |
| `slug` | 60 |
| `name` | 80 |
| `introduction` | 280 |
| `story` | 8000 |
| `autobiography` | 20000 |
| `carryForward` | 1000 |
| each `values` line | 160 |
| `work[].title` | 120 |
| `work[].description` | 600 |
| `links[].label` | 80 |
| each `memories` entry | 1000 |
| `family[].name` | 80 |
| `family[].note` | 200 |
| `image.alt` | 300 |
| committed `image.src` path | 500 |
| each `admins` entry | 39 |
| each `allowedViewers` entry | 254 |
| any URL | 500 |

The retained `profiles/example-river-okonkwo.json` is explicitly fictional. It
is not inserted into the database automatically. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the provenance-aware import command and consent cautions.

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Privacy, consent, deletion and removal](docs/PRIVACY.md)
- [Moderation](docs/MODERATION.md)
- [Security](SECURITY.md)
- [Backups and restore](docs/BACKUPS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Content rights](docs/CONTENT-LICENSE.md)

The MIT [LICENSE](LICENSE) covers repository code, not contributor stories,
photos or other profile content.
