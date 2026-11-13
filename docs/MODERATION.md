# Moderation

## Lifecycle

1. `draft`: private owner content.
2. `pending`: owner explicitly consented and requested review.
3. `approved`: the reviewed draft revision becomes the public revision.
4. `rejected`: draft remains private with owner-visible feedback.

Approved and draft revision IDs are separate. Later edits return to `draft`;
the earlier approved revision remains public until the owner unpublishes it or a
new submitted revision is approved. Pending and rejected text is never served
by public list, search, ID or slug endpoints.

A decision names the revision the moderator reviewed: its `revisionId` and its
`contentHash` (a SHA-256 hash of the revision's content), both returned by the
queue for each profile. It is refused with HTTP 409 when the profile is no
longer awaiting review, or when its draft no longer matches both. This happens,
for example, when the owner saved and resubmitted while the moderator was
reading, or deleted the profile and created a new one that was given the same
IDs. The moderator then reloads and reviews the latest revision, so text they
have not seen cannot be approved.

## Review screen

For a profile that already has a published version, each card starts with
**Changes since the published version**: a line-by-line comparison of every
field that changed. Added and removed lines are marked with + and −, and
screen readers hear "Added" and "Removed". For a new profile, review the whole
preview instead.

**Links and image sources to check** shows the full address behind every work
link, general link and image, so you are not relying on link text. The preview
uses the same renderer as the public page. It loads an outside image only when
you choose **Load image**, so opening the queue does not contact image hosts.
The exact submitted JSON is available under **Submitted data (JSON)**.

## Review checklist

- Confirm the consent checkbox was recorded for the pending revision.
- Check for private contact information, credentials, identifiers or sensitive
  details that should not be public.
- Check impersonation, harassment, threats and unlawful content.
- Check that the contributor represents having rights to stories, photos and
  linked work. Do not ask them to post private evidence publicly.
- Confirm fictional examples are unmistakably labelled.
- Check image and work links, remembering the server does not fetch them.
- Use private, actionable rejection feedback. Never put sensitive notes in
  public profile text.

Every decision records the moderator, revision, decision, timestamp and
optional feedback.

## Audit log

The audit log is moderator-only. It is the **Audit log** page (`audit.html`),
backed by `GET /api/moderation/audit?page=&limit=`, which returns 50 events per
page by default and at most 100. Each event has a time, an action, the acting
account's number and role, the profile it concerns (if any) and small details
such as a revision number. A profile's address is shown while it is awaiting
review or rejected, and once it has been published; otherwise the profile
appears by number. Audit events are intentionally minimal and contain no
profile text or email addresses. When a profile is deleted, its events go with
it, and a single "Profile deleted by owner" event remains.

## Moderator accounts

Pay particular attention to long `autobiography` text and `family` entries,
where private details about the owner or third parties can be easy to miss.
Family entries require permission and must remain limited to a public name,
supported relationship, optional approved-profile slug and short neutral note.

Moderators are created only with `npm run moderator:create` using explicit
environment variables. There are no default credentials, public registration
route or client-controlled role fields. Restrict production shell and database
access and remove moderator access promptly when no longer needed.
