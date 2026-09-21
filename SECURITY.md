# Security policy

## Reporting

Do not put exploitable details, credentials, private profiles or personal
evidence in a public issue. Repository maintainers must configure a private
security-reporting route before production use; this repository does not
fabricate one. GitHub private vulnerability reporting may be used if enabled.

## Implemented controls

- Argon2id password hashes and generic login/recovery failures.
- Expiring, single-use, SHA-256-hashed reset tokens.
- Server-side SQLite sessions with HTTP-only, SameSite=Lax cookies and Secure
  cookies in production.
- Synchronizer-token CSRF protection on state-changing API requests.
- Rate limiting on sign-up, login and recovery endpoints.
- Server-side validation and owner checks on every profile mutation.
- Server-only roles and ownership; request bodies cannot assign either.
- Moderator-only review and audit endpoints.
- Separate approved and draft revisions; public queries require an approved
  revision.
- Plain-text DOM rendering, allow-listed URL schemes and no server-side URL
  fetching or unrestricted uploads.
- Helmet security headers, bounded JSON bodies, bounded pagination and
  parameterized SQL.
- Production configuration fails closed without HTTPS base URL and a strong
  session secret.

## Operator responsibilities

Use Node.js 24 security updates, run `npm audit --omit=dev`, terminate HTTPS,
restrict database/backups, rotate secrets, configure SMTP securely, monitor
logs without recording tokens, and test restore procedures. Set `TRUST_PROXY=1`
only behind one trusted reverse proxy. Never enable `DEV_RECOVERY_LOG` in
production.
