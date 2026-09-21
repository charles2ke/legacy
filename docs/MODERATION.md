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
optional feedback. The audit endpoint is moderator-only and intentionally
minimal.

## Moderator accounts

Pay particular attention to long `autobiography` text and `family` entries,
where private details about the owner or third parties can be easy to miss.
Family entries require permission and must remain limited to a public name,
supported relationship, optional approved-profile slug and short neutral note.

Moderators are created only with `npm run moderator:create` using explicit
environment variables. There are no default credentials, public registration
route or client-controlled role fields. Restrict production shell and database
access and remove moderator access promptly when no longer needed.
