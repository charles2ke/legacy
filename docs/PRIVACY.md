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

## Consent and review

Submitting requires an explicit publication-consent checkbox. A moderator must
approve that exact revision before it is public. Editing approved content
creates a separate draft; unapproved edits never replace the public revision.
The platform cannot determine whether a submitter is truthful or legally
authorized, so moderation remains necessary.

## Removal and deletion

Owners can unpublish immediately or delete their profile and revisions from the
live database. Account deletion is not yet a self-service feature; an operator
must handle it under the applicable policy after resolving owned profiles.

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
