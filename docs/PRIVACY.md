# Privacy, consent, deletion and removal

## What is public

Only a moderator-approved profile revision is public. Public list, search,
direct ID and slug responses contain profile fields only. Authentication email,
password hashes, account IDs, sessions, drafts, reset tokens, moderation
feedback and audit records are not public API fields.

Approved profiles may include a public name, introduction, story, values, work
links, memories, image URL/description, carry-forward message and a fictional
label. Public identity is not independently verified.

## What is private

SQLite stores normalized authentication email, Argon2id password hash, session
records, private drafts, moderation feedback, consent timestamp, recovery token
hashes and a minimal action audit trail. Reset tokens expire after 30 minutes
and are single-use. Raw passwords and raw reset tokens are not stored.

Operators with database or backup access can access private data and must limit
that access. Do not submit sensitive evidence of consent, identity, death,
relationship or authority through public issues.

## Your copy of your data

Signed-in owners can download a JSON file from the Account page
(`GET /api/me/export`). It contains:

- the account email, role and creation date;
- every saved revision of each profile they own, with its draft and approved
  versions and consent time;
- the moderation decisions and feedback about those profiles;
- the audit events the account performed.

It does not identify which moderator made a decision, and it never includes
password hashes, sessions or reset tokens.

Changing a password from the Account page requires the current password. It
signs out every other session and cancels unused reset links.

## Consent and review

Submitting requires an explicit publication-consent checkbox. A moderator must
approve that exact revision before it is public. Editing approved content
creates a separate draft; unapproved edits never replace the public revision.
The platform cannot determine whether a submitter is truthful or legally
authorized, so moderation remains necessary.

## Removal and deletion

Owners can unpublish immediately or delete their profile and revisions from the
live database. Deleting a profile also deletes its moderation decisions,
feedback and audit events. One audit event remains, recording that profile
number N was deleted and whether it had been published.

Owners can also delete their whole account from the Account page after
re-entering their password and confirming. This deletes, from the live
database:

- the account and its sessions and reset tokens;
- every profile it owns, published or not, with the revisions, decisions,
  feedback and audit events that belong to those profiles.

What remains in the audit log:

- one event saying that an account was deleted and how many profiles it owned,
  with no email address or account link;
- earlier events not about one of its profiles, such as password changes and
  earlier profile deletions, with their link to the account removed.

Moderator accounts cannot delete themselves, because their decisions must stay
attributable. An operator handles those under the applicable policy.

`PUBLIC_REMOVAL_URL` may expose a public email link or contact form. No real
contact route is supplied by this repository. When it is not configured, the
site says so and points people to the repository's public issue guidance:
describe the request without posting sensitive evidence.

Deletion removes data from the live database, but not necessarily from retained
backups, browser/search caches, screenshots, exports, or third-party copies.
Backup retention is an operator policy; deleted records disappear only as old
backups expire. Profiles previously committed to the old public JSON archive
can remain in Git history, forks and clones even after the live application
deletes them. Never promise that publication is permanent or that all copies
can be erased.
