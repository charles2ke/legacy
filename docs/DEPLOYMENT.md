# Deployment (GitHub Pages)

The site is static files with no build step, so "building" is just uploading the
repository contents as a Pages artifact.

**Nothing in this repository enables Pages or changes any account or repository
setting, and no claim is made that a site is currently live.** A maintainer must
perform the steps below manually before any deployment can succeed.

## Maintainer setup (manual, one time)

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Leave the default `github.io` domain, or configure a custom domain there if you
   prefer. With the default domain the site is served from a project path:
   `https://<owner>.github.io/legacy/`. All links and data paths in this project
   are relative, so both the project path and a domain root work without changes.
4. Optionally, under **Settings → Environments → github-pages**, restrict
   deployments to the default branch.

## How deployment runs

`.github/workflows/pages.yml` runs only on:

- pushes to the default branch, and
- manual runs (**Actions → Deploy site to GitHub Pages → Run workflow**).

It never runs on `pull_request`, so code from untrusted pull requests is never
deployed. It uses the official `actions/upload-pages-artifact` and
`actions/deploy-pages` flow, with `permissions: contents: read, pages: write,
id-token: write` — the minimum that flow requires — and a single concurrency group
so deployments do not overlap.

Validation and tests (`.github/workflows/ci.yml`) run separately with
`permissions: contents: read` and do run on pull requests.

## If a deployment fails

- "Pages is not enabled" or a 404 from the deploy step: Source is not yet set to
  **GitHub Actions** (step 2 above).
- A blank profile list on the published site: check that `profiles/index.json` is
  present in the artifact and that browser devtools show the JSON requests
  resolving under the project path.

## Alternative hosting

Because the site is plain files, it can also be served by any static host, or
previewed locally with `python3 -m http.server`. See the README for local preview
instructions, including how to reproduce the `/legacy/` project path.
