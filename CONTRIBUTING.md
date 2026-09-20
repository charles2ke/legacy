# Contributing to Legacy

Thank you for considering adding something here. Profiles are contributed through
pull requests; there are no accounts and no login.

Please read [docs/PRIVACY.md](docs/PRIVACY.md) before you start.

## Before you write anything

- **Permission is required.** You must have the right to share every piece of text
  and media you submit, including photographs.
- **Writing about someone else?** You need appropriate authorisation from that
  person, or from whoever is entitled to act on their behalf. Say so in your pull
  request — but do not attach private evidence to a public pull request or issue.
- **Nothing sensitive.** No birth dates, addresses, private phone numbers or email
  addresses, passwords, recovery codes or account access. This is not a credential
  vault. Anything you submit becomes public.
- **Removal is possible but not complete.** Content can be removed from this
  repository, but copies, forks, caches and Git history may persist elsewhere.
- **No permanence promise.** This project cannot guarantee hosting, maintenance or
  that anyone will be remembered. Keep [your own backups](docs/BACKUPS.md).

## Adding a profile using GitHub's web interface

You do not need Git, a terminal, or any software beyond a browser.

1. Open [`profiles/_template.json`](profiles/_template.json) and copy everything in it.
2. Go to the `profiles/` folder and choose **Add file → Create new file**.
3. Name the file `your-slug.json`, using lowercase letters, numbers and single
   hyphens — for example `river-song.json`. The slug must be unique.
4. Paste the template and replace the example text with your own. Delete any
   optional fields you do not want; make sure the remaining JSON is still valid
   (no trailing commas).
5. Scroll down, choose **Create a new branch for this commit and start a pull
   request**, and click **Propose new file**.
6. In the same pull request, edit [`profiles/index.json`](profiles/index.json) and
   add your slug to the `profiles` list. (Open the file, click the pencil icon,
   choose to commit to the branch you just created.)
7. Complete the checklist in the pull request template and submit.

Automated checks will run. If they fail, the check output says exactly which field
is wrong; edit your file in the pull request and the checks run again.

## Adding a profile with Git

```bash
git clone https://github.com/charles2ke/legacy.git
cd legacy
cp profiles/_template.json profiles/your-slug.json
# edit profiles/your-slug.json and add "your-slug" to profiles/index.json
npm run validate
npm test
```

Then open a pull request from a branch.

## Field rules

The fields, limits and required values are documented in the
[profile format table](README.md#profile-format). In addition:

- `slug` must match the file name and must not already exist.
- Links may only use `https:`, `http:` or `mailto:`. Other schemes are rejected.
- Images need `alt` text describing the picture for people who cannot see it.
- An image `src` must be an `https`/`http` URL, or a file you committed under
  `assets/images/`. Committed images are preferred, because an external host can
  disappear and can see visitors' requests.
- Fields not listed in the format table are rejected, so please do not invent new
  ones. If something important does not fit, open an issue and suggest it.
- Contributor text is always rendered as text; HTML and scripts will not run.

## What maintainers check

Every pull request is reviewed against the
[moderation checklist](docs/MODERATION.md), which covers consent, private
information, impersonation, harassment and unauthorised copyrighted material.
Maintainers may ask for changes, or decline a submission. Maintainers are
volunteers, so review can take a while.

## Changes to the site or tooling

Pull requests that change HTML, CSS, JavaScript, scripts or workflows are welcome.
Please keep dependencies at zero where possible, run `npm test` and `npm run
validate`, and keep the site usable with a keyboard and a screen reader.

## Asking a question

Open an issue or a discussion. Describe the situation **without** including private
details, identity documents or anyone's contact information — these are public.
If a matter genuinely cannot be discussed in public, say only that, and ask the
maintainers for a private contact route. No private reporting channel is published
in this repository today; see [docs/PRIVACY.md](docs/PRIVACY.md).

## Code of conduct

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
