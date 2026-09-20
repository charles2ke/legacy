# Moderation checklist

Maintainers work through this list before merging any pull request that adds or
changes a profile. When something is unclear, ask in the pull request — without
requesting private documents in public — or decline.

## Automated checks (must pass)

- [ ] `npm run validate` passes: required fields present, slug valid and unique,
      slug matches the file name, slug listed in `profiles/index.json`.
- [ ] `npm test` passes.
- [ ] Only files under `profiles/` (and any image the profile uses) are changed, or
      site/tooling changes are reviewed separately.

## Consent

- [ ] The profile is about the contributor, or the contributor has stated they have
      appropriate authorisation to publish it about someone else.
- [ ] Nothing in the pull request asks for or exposes private evidence.
- [ ] Media (photos, recordings) appear to be the contributor's to share.

## Private information

- [ ] No birth dates, addresses, private phone numbers or email addresses.
- [ ] No government identifiers, financial or medical details.
- [ ] No passwords, recovery codes, tokens or account access instructions.
- [ ] Third parties mentioned in stories are not identified in ways that expose
      their private information.

## Impersonation

- [ ] No claim to be a public figure, organisation or another contributor.
- [ ] Fictional or demonstration profiles set `"fictional": true` and say so in the
      introduction.
- [ ] The profile does not present itself as an officially verified memorial.

## Harassment and harmful content

- [ ] No content targeting, mocking, threatening or exposing another person.
- [ ] No hateful, sexualised or violent content.
- [ ] Content about death, illness or grief is handled respectfully.
- [ ] No instructions or encouragement for self-harm; no content that reads as a
      crisis message. If a submission suggests someone is in danger, do not merge
      it; respond with care and point to local emergency and support services.

## Rights in submitted material

- [ ] Text does not appear copied from a source the contributor has no right to
      republish (lyrics, poems, articles, book extracts).
- [ ] Images are the contributor's own or clearly licensed for this use.
- [ ] Quotations are short, attributed and plausibly fair use.

## Links and safety

- [ ] Links use `https:`, `http:` or `mailto:` only (validation enforces this).
- [ ] Linked destinations are not spam, malware, phishing or unrelated promotion.
- [ ] Images are hosted in this repository or at a stable, appropriate location.

## Decision

- [ ] Merge, or
- [ ] Request changes with a specific explanation, or
- [ ] Decline, explaining which item above was not met.

Removal requests follow [PRIVACY.md](PRIVACY.md) and are handled promptly relative
to volunteer availability; no response time is guaranteed.
