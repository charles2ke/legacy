# Legacy

A community digital legacy archive: people share their stories, memories and links
to their work as small JSON files, published through a simple static website.

**What this project is:** a place to write down who you are, what you value, what you
made, and what you hope others carry forward — in your own words, reviewed by
maintainers, published as a plain web page.

**What this project is not:** it aims to help preserve and share memories, but it
**cannot promise permanent hosting** and **cannot promise that anyone will never be
forgotten**. It is **not a credential vault** (never submit passwords or account
access) and **not an official memorial verification service** — no profile here is
verified as belonging to a particular real person. Keep your own
[independent backups](docs/BACKUPS.md).

This first version has no accounts, no backend and no database. Everything is files
in this repository, contributed through pull requests.

## Contents

- [Project structure](#project-structure)
- [Profile format](#profile-format)
- [Contributing a profile](#contributing-a-profile)
- [Local preview](#local-preview)
- [Validation and tests](#validation-and-tests)
- [Deployment](#deployment)
- [Licensing](#licensing)

## Project structure

```text
index.html               Landing page
profiles.html            Browsable list of profiles
profile.html             Individual profile view (profile.html?slug=example)
contribute.html          Short contribution instructions
assets/css/styles.css    Styles (no frameworks, no build step)
assets/js/profile-schema.js  Profile rules, shared by the site and CI
assets/js/render.js      Pure rendering helpers (paths, safe URLs, paragraphs)
assets/js/site.js        Page behaviour (text-only DOM rendering)
profiles/_template.json  Template to copy when adding a profile
profiles/index.json      List of published slugs
profiles/*.json          One file per profile
scripts/validate-profiles.js  Validation used locally and in CI
test/                    Node test-runner tests
docs/                    Privacy, backups, moderation and deployment notes
```

The site uses only relative links and relative data paths, so it works both at a
domain root and under a project path such as `https://<user>.github.io/legacy/`.

## Profile format

Each profile is one JSON file named after its slug, for example
`profiles/river-song.json`, plus the same slug added to `profiles/index.json`.

| Field | Required | Notes |
| --- | --- | --- |
| `slug` | yes | Unique, lowercase letters/numbers/hyphens, must match the file name |
| `name` | yes | The name you want shown publicly; a chosen name is fine |
| `introduction` | yes | One or two sentences |
| `story` | yes | Blank lines separate paragraphs |
| `carryForward` | yes | What you hope others carry forward |
| `values` | no | Up to 10 short lines |
| `work` | no | Up to 20 entries: `title`, optional `description`, optional `url` |
| `memories` | no | Up to 20 short memories |
| `family` | no | Up to 20 relations: `relation` (`parent`, `child`, `sibling`, `partner`, `grandparent`, `grandchild`, `relative`, `chosen-family`), `name`, optional `slug` of their profile here, optional short `note` |
| `image` | no | `src` (an `https`/`http` URL, or a file committed under `assets/images/`) and required `alt` text |
| `fictional` | no | `true` marks a demonstration profile |

Optional fields stay optional — leave them out entirely if you do not want them.

**Do not include** birth dates, addresses, private phone numbers or emails,
passwords, account access, or anything else sensitive. Fields that are not in the
table above are rejected by validation, so unexpected data never reaches the site.

Links may only use `https:`, `http:` or `mailto:`. All contributor text is rendered
as text: submitted HTML or scripts are never executed.

`profiles/example-river-okonkwo.json` is a clearly labelled **fictional**
demonstration profile. It describes no real person.

## Contributing a profile

Full instructions, including a step-by-step path through GitHub's web interface for
people who do not use Git, are in [CONTRIBUTING.md](CONTRIBUTING.md). In short:

1. Copy [`profiles/_template.json`](profiles/_template.json).
2. Create `profiles/<your-slug>.json` with your content.
3. Add `<your-slug>` to [`profiles/index.json`](profiles/index.json).
4. Open a pull request and complete the checklist.

Before contributing, read [docs/PRIVACY.md](docs/PRIVACY.md): you must have
permission to share everything you submit, including photos, and submissions about
other people need appropriate authorisation. This repository is public, and copies,
forks and Git history may persist even after content is removed here.

## Local preview

There is no build step. Serve the folder with any static server:

```bash
# Python (bundled on most systems)
python3 -m http.server 8000
# then open http://localhost:8000/
```

To preview exactly as it will appear under the `/legacy/` project path:

```bash
mkdir -p /tmp/preview/legacy && cp -r . /tmp/preview/legacy
cd /tmp/preview && python3 -m http.server 8000
# then open http://localhost:8000/legacy/
```

Opening the HTML files directly with `file://` will not work, because browsers block
`fetch` of local JSON files.

## Validation and tests

Node.js 20 or newer, no dependencies to install:

```bash
npm run validate   # checks every profile and profiles/index.json
npm test           # unit tests for the schema, rendering helpers and validator
```

Both run automatically in CI on pull requests and on pushes to the default branch.

## Deployment

The site is plain static files and can be published with GitHub Pages. The optional
workflow in `.github/workflows/pages.yml` builds and deploys from the default branch
and from manual dispatch only — pull request code is never deployed.

A maintainer must enable Pages before any deployment can succeed; the required
settings are listed in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Nothing in this
repository changes account or repository settings, and no claim is made here that a
site is currently live.

## Licensing

Two different things live in this repository, under two different terms:

- **Site code** (HTML, CSS, JavaScript, scripts, workflows, configuration) is
  licensed under the [MIT License](LICENSE).
- **Contributor content** — the stories, memories, images and other personal
  material inside `profiles/` — is **not** placed under that licence and is **not**
  released into the public domain. Authors keep their rights. See
  [docs/CONTENT-LICENSE.md](docs/CONTENT-LICENSE.md) for the limited permission that
  is needed simply to publish a profile here.

## Community documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to submit, and what maintainers check
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — expected behaviour
- [SECURITY.md](SECURITY.md) — what counts as a vulnerability and how to report it
- [docs/PRIVACY.md](docs/PRIVACY.md) — consent, privacy and removal requests
- [docs/MODERATION.md](docs/MODERATION.md) — the review checklist maintainers use
- [docs/BACKUPS.md](docs/BACKUPS.md) — backups and stewardship
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Pages setup a maintainer must do
