# Privacy, consent and removal

This repository is **public**. Everything merged here — profile text, images, file
names, commit messages and the discussion in pull requests — can be read, copied,
indexed by search engines and archived by third parties.

## What we ask you to share

Share what you would be comfortable having read by a stranger years from now: your
introduction, story, values, work and what you hope others carry forward.

## What must never be submitted

- Birth dates, home or work addresses, private phone numbers or email addresses.
- Government identifiers, financial details, medical records.
- Passwords, recovery codes, API keys, or any account access. **Legacy is not a
  credential vault.** If you have ever placed a credential in a public repository,
  treat it as compromised and rotate it.
- Other people's personal details, including in memories about them.

Validation rejects fields that are not part of the profile format, but automation
cannot judge the content of your sentences. Read what you wrote once more before
submitting.

## Consent

- You must have permission to share every piece of text and media you submit.
- A profile about someone else requires appropriate authorisation from that person,
  or from whoever is entitled to act on their behalf. Maintainers may ask how you
  are authorised, and may decline if the answer is unclear.
- **Do not attach private evidence — documents, death certificates, medical
  records, private messages — to public issues or pull requests.** Describe the
  situation in general terms instead.
- Legacy performs no verification. A profile being published does **not** mean the
  project has confirmed anyone's identity, death, or authority to speak for them.
  This is not an official memorial verification service.

## Removal requests

Anyone who is the subject of a profile, or who is entitled to act for them, can ask
for it to be removed.

1. Open an issue titled "Removal request: `<slug>`" — or, if you prefer, open a
   pull request that deletes `profiles/<slug>.json` and removes the slug from
   `profiles/index.json`.
2. Say which profile is affected and that you are asking for removal. **Do not
   include private details or documents in the public issue.**
3. If the request cannot be explained without private information, say only that
   and ask a maintainer for a private contact route.

> **Maintainer configuration needed.** No private contact address is published in
> this repository, and none is claimed to exist. A maintainer who wants one should
> add a real, monitored address here and in
> [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md). Until then, requests are handled in
> public issues and pull requests only.

Maintainers are volunteers; there is no response-time guarantee.

## What removal can and cannot do

Removing a profile deletes it from the default branch and from the published site.
It **cannot** undo the fact that the content was public. Specifically:

- Forks and clones made by other people keep their own copies.
- Git history in this repository may still contain the content unless history is
  rewritten, which breaks existing clones and is not done routinely.
- Search engines, the Internet Archive and other mirrors may retain copies.
- Content that was quoted or screenshotted elsewhere is outside our control.

Please take this into account **before** submitting, not after.

## Data the site collects

The site itself has no accounts, no analytics, no cookies and no tracking scripts.
It fetches only JSON files from this repository. If a profile links to an image
hosted somewhere else, that host will see requests from visitors' browsers — which
is one reason to prefer images committed to this repository.

## Safety of published content

Contributor text is rendered as plain text and contributor HTML or scripts are
never executed. Links are restricted to `https:`, `http:` and `mailto:`. This
protects readers from script injection; it does not make the archive private.
