# Security policy

This project is a static website plus contributor-submitted JSON files. There is
no backend, no database, no accounts and no server-side code, so the realistic
risk is narrower than for most applications — but it is not zero, because the site
renders content written by other people.

## Scope

**In scope**

- Cross-site scripting or script execution through profile content, including
  `story`, `name`, `memories`, `work` entries, image fields and the `?slug=`
  query parameter.
- Bypasses of the URL rules in `assets/js/profile-schema.js` — for example getting
  a `javascript:`, `data:` or other non-allowed scheme into a rendered link or
  image.
- Path traversal or fetching files outside the repository through a crafted slug
  or image path.
- Weaknesses in the GitHub Actions workflows, such as privilege escalation,
  deployment of untrusted pull request code, or secret exposure.
- A flaw in `scripts/validate-profiles.js` that lets unsafe content pass
  validation and reach the published site.

**Out of scope**

- The fact that the archive is public. Everything merged here is intended to be
  readable by anyone; see [docs/PRIVACY.md](docs/PRIVACY.md).
- Content that is merely unwanted, inaccurate or disputed. That is a moderation or
  removal matter — see [docs/MODERATION.md](docs/MODERATION.md) and
  [docs/PRIVACY.md](docs/PRIVACY.md), not this policy.
- Missing security headers that GitHub Pages does not let this project set.
- Denial of service against GitHub's own infrastructure.
- Links that point to third-party sites which later become unsafe. Report those as
  normal issues so a maintainer can remove the link.

## Reporting a vulnerability

Please **do not open a public issue for an unfixed vulnerability**, and do not
include a working exploit payload in a public pull request.

Use GitHub's private vulnerability reporting for this repository:
**Security → Advisories → Report a vulnerability**.

> **Maintainer configuration needed.** Private vulnerability reporting must be
> enabled by a maintainer under **Settings → Advanced Security → Private
> vulnerability reporting** before that form appears. This repository does not
> publish a security contact email address, and none is claimed to exist. If
> private reporting is not yet enabled and you have found something serious, open
> an issue that says only that you have a security concern and are waiting for a
> private channel — no details, no proof-of-concept — and ask a maintainer to
> enable private reporting.

A useful report includes what you did, what happened, why it matters, and which
file or page is involved. Maintainers are volunteers: there is no guaranteed
response time, no bug bounty, and no service level commitment of any kind.

## Supported versions

Only the current state of the default branch is supported. There are no releases,
tags or backports. Fixes land on the default branch and reach the published site
the next time it is deployed.

## What this project does to reduce risk

- Contributor text is inserted with `textContent` and never parsed as HTML, so
  submitted markup and scripts do not execute.
- Links are restricted to `https:`, `http:` and `mailto:`. Image sources are
  restricted further, to `https:`/`http:` or files committed under
  `assets/images/`, with traversal rejected.
- The `?slug=` parameter is matched against a strict slug pattern before any file
  is fetched.
- Every profile is validated in CI, and unknown fields are rejected, so unexpected
  data cannot reach the site through the profile format.
- CI runs with `permissions: contents: read`. The Pages workflow runs only on
  default-branch pushes and manual dispatch, so pull request code is never
  deployed.
- The project has no runtime dependencies to keep patched.

These measures protect readers from injected code. They do **not** make the
archive private, and they are not a guarantee that no flaw exists.

## Please never submit credentials

Legacy is **not a credential vault**. Do not put passwords, recovery codes, API
keys, tokens or account access instructions into profiles, issues or pull
requests. Anything committed to a public repository should be treated as
compromised — rotate it immediately, and note that removing it later does not
remove it from forks, clones or Git history.
