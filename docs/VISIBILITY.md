# Visibility: public, private and restricted

A profile says how widely it wants to be published. **The declaration lives in the
profile; the enforcement does not.** Nothing in a browser can keep a reader away
from a file the browser was already given, so each mode is enforced by something
that can actually enforce it.

| Mode | Meaning | Enforced by |
| --- | --- | --- |
| `public` | Anyone can read it | Nothing needed — this is how the archive works |
| `private` | Only people with access to the repository | A **private** repository; never published |
| `restricted` | Only the people named in `allowedViewers` | An **authenticating host** in front of a private deployment |

`visibility` defaults to `public`, so a profile that does not mention it behaves
exactly as it did before.

## Why this repository only accepts `public`

`charles2ke/legacy` is a public repository and its site is public. Everything
committed here is readable by anyone, immediately, whatever a field inside the
file says about itself. A profile marked `private` in a public repository is not
private — it is a public profile with a misleading label.

So validation refuses it. `npm run validate` fails if any profile here asks to be
`private` or `restricted`:

```text
Profile validation failed:
  - someone: visibility "private" is not allowed on a "public" instance, because
    everything committed here is published. Remove profiles/someone.json and its
    entry in profiles/index.json, and keep the profile in a private instance
    instead (see docs/VISIBILITY.md).
```

This runs in CI on every pull request, so a non-public profile cannot be merged
here by accident.

### Instances

A deployment declares what kind it is **in its own environment**, not in its
content. `npm run validate` reads `LEGACY_INSTANCE`:

- unset or `public` — only `public` profiles may exist. This repository.
- `private` — every mode may exist, because the repository's permissions and the
  host in front of the site decide who reads anything at all.

Anything else is refused outright, so a typo can never widen what gets published.

The instance is deliberately *not* taken from `profiles/index.json`, because every
profile pull request edits that file: if it chose the instance, one line in the
same pull request could switch the guard off. `index.json` carries a copy for the
browser, which cannot read environment variables, and the validator fails if the
two disagree:

```json
{ "instance": "public", "profiles": ["example-river-okonkwo"] }
```

The site reads that copy and lists only the profiles the instance is allowed to
publish — defence in depth, and the correct behaviour for a private instance.
**On the public site that filter is not a security control**: the JSON was already
downloaded before it ran.

## Admins

`admins` lists the GitHub usernames of the people who own a profile and may change
it, including changing its visibility.

```json
{ "admins": ["charles2ke"] }
```

`npm run codeowners` turns those lists into `.github/CODEOWNERS`, one line per
profile, and CI fails if the committed file has drifted from the profiles:

```text
/profiles/example-river-okonkwo.json @charles2ke
```

> **Maintainer configuration needed.** CODEOWNERS has no effect on its own. Until
> a maintainer enables branch protection on the default branch with **Require a
> pull request before merging** and **Require review from Code Owners**, the file
> is only documentation. Nothing in this repository changes that setting.

Repository maintainers can still merge anything and still remove content for
moderation or on a removal request; see [MODERATION.md](MODERATION.md) and
[PRIVACY.md](PRIVACY.md).

## Setting up a private instance

This repository cannot host `private` or `restricted` profiles. A separate
**private** repository can, and it needs no new code: the schema, the validator
and the site are dependency-free and work unchanged.

1. Create a private repository and copy this project's files into it.
2. Set `"instance": "private"` in `profiles/index.json`, and set
   `LEGACY_INSTANCE=private` in that repository's workflows — both, because they
   must agree.
3. Give repository read access to the people who may see `private` profiles.
4. Run `npm run validate` and `npm test` there as usual.

If you stop at step 4 you already have working `private` profiles: GitHub's own
permissions are the enforcement, and nothing is published anywhere.

## Setting up `restricted`

`restricted` needs a host that authenticates a visitor **before** it serves any
bytes. Do not use GitHub Pages: on Free, Pro and Team plans a Pages site is public
even when its repository is private, and per-site access control is a GitHub
Enterprise Cloud feature.

Suitable hosts include Cloudflare Access (Zero Trust), whose free tier covers a
small number of users, and the password or SSO protection offered by hosts such as
Netlify and Vercel.

### Where the gate goes

Access policies match on **path**, and query strings are ignored, so
`profile.html?slug=river-song` cannot carry a per-profile policy. The file that
actually holds the content can:

- `/profiles/<slug>.json` — one policy per profile that is not public. A
  `restricted` profile allows exactly its own `allowedViewers`; a `private`
  profile needs an include naming the people with repository access.
- Everything else — one site-wide policy requiring any recognised viewer.
  **Without this the rest of the private instance is served to anyone.**

A `private` profile needs a policy of its own even though its allowlist is the
repository's member list. The site-wide policy has to admit the outside viewers
named by `restricted` profiles — they need `profile.html`, the scripts and
`profiles/index.json` to read anything at all — and once it admits them, they
could ask for any ungated profile's JSON directly. Leaving `private` profiles to
the catch-all would therefore hand them to every restricted viewer on the
instance.

This layering relies on two documented Cloudflare Access behaviours, worth
confirming on any other host before trusting it:

- **The most specific path wins, and inherits nothing.** A policy on
  `/profiles/few.json` replaces the site-wide one for that file rather than
  adding to it, which is what lets each profile carry its own allowlist.
- **Access is deny by default, and an allow policy with no include rules matches
  nobody.** That is why the generated policy for a profile with no allowlist of
  its own is safe to apply as it stands: it refuses everyone until you fill it
  in, rather than falling back to the catch-all.

This works with the site as it is. When a viewer is refused a profile's JSON, the
list page simply leaves that profile out, and the profile page reports that it
could not be found.

### Generating the policies

`allowedViewers` stays the single source of truth:

```bash
npm run access-policies -- --site https://legacy.example.com
```

That prints a manifest — one application per profile that is not public, with the
allowlist split into the shapes a host matches on:

```json
{
  "applications": [
    {
      "slug": "few",
      "name": "Legacy profile: few",
      "path": "/profiles/few.json",
      "visibility": "restricted",
      "decision": "allow",
      "include": {
        "emails": ["someone@example.com"],
        "emailDomains": ["example.org"],
        "groups": ["Close family"]
      },
      "needsInclude": false
    }
  ],
  "warnings": []
}
```

An application with `"needsInclude": true` has an empty allowlist, which admits
nobody — the safe way to be incomplete. Every `private` profile starts that way,
because the profile itself does not say which host identities belong to the
repository's members. Each one also produces a line in `warnings`, so a
half-finished configuration is loud rather than quietly open. Fill the include in
before applying the manifest.

**It prints a manifest; it does not configure anything.** A maintainer applies it
in the host's dashboard or through their own infrastructure tooling. For
Cloudflare Access, each application becomes a self-hosted application on that
path, with one allow policy whose include rules are *Emails*, *Emails ending in*
and *Access groups* respectively.

### What `allowedViewers` may contain

| Form | Example | Meaning |
| --- | --- | --- |
| Email address | `someone@example.com` | That one person, once they prove they hold the address |
| Domain | `@example.org` | Anyone with an address at that domain |
| Group | `group:Close family` | A group defined in your identity provider |

Up to 1000 entries, matching the tightest documented per-policy limit among the
hosts above. The list is personal data in itself, which is why it may only appear
on a `restricted` profile and may never be committed here.

## What none of this can do

- **It cannot un-publish anything already committed to a public repository.**
  Marking an existing public profile `private` later does nothing about the copies
  that exist. Git history, forks, clones, search engines and archives keep what
  they took. Read [PRIVACY.md](PRIVACY.md) before you publish, not after.
- **It does not hide slugs on a private instance.** Everyone who can reach the
  site can read `profiles/index.json` and see the slugs of profiles they cannot
  open. Choose a slug that does not give away a name you want kept quiet.
- **It is not encryption.** The host, and whoever administers it, can read
  everything. So can anyone who can read the private repository.
- **It does not verify anyone.** A viewer proves control of an email address or an
  identity-provider account, nothing more.

## Approaches deliberately not taken

- **A client-side allowlist or password on the public site.** The JSON is fetched
  over public HTTP and is readable in the repository, in raw file URLs, in forks
  and in history. It would look like privacy and provide none.
- **Encrypting profile JSON with a shared passphrase.** A shared secret is not a
  per-person allowlist, cannot be revoked once copies exist, and would hide
  content from the maintainers who have to moderate it.
- **"Unlisted" profiles left out of `profiles/index.json` but still deployed.**
  That is obscurity, not privacy, and naming it as a visibility mode would
  misrepresent it.
