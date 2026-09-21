# Contributing

## Creating a profile

1. Create an account in the running application. Authentication email remains
   private.
2. Save and preview a private draft in the guided editor.
3. Include only material you have the right and consent to publish.
4. Explicitly consent and submit the draft for review.
5. Respond to private moderator feedback if the submission is rejected.

Approval publishes exactly the reviewed revision. Editing an approved profile
creates a separate draft and requires another review. Owners can unpublish or
delete from the dashboard.

Do not include passwords, private addresses, government identifiers, private
contact details, or evidence containing sensitive information. Identity is not
verified by the platform.

Optional `autobiography`, `links`, and `family` fields follow the shared schema.
Only link to public pages you are comfortable publishing. Family entries must
have the named person's permission, use a supported relationship, and contain
no birth dates, addresses, health details or other sensitive notes. A related
profile slug is optional and must name an existing archive profile.

## Importing the old JSON archive

The import command validates every indexed JSON file and requires a provenance
note:

```bash
npm run import:profiles -- \
  --source=profiles \
  --provenance="Repository archive; consent and ownership require manual review"
```

Imports are deliberately **unowned, unpublished drafts**. They are never
assigned to whichever user happens to run the command and are not published
automatically. Before any migration-specific ownership or publication action,
an operator must separately verify provenance, authority, content rights and
consent. Do not put private consent evidence into the database or repository.

The included River Okonkwo file is labelled fictional in its name, introduction
and `fictional` field. It is demonstration content, not a real biography.

## Code changes

```bash
npm ci
npm run build
npm test
npm audit --omit=dev
```

Keep profile validation centralized in `assets/js/profile-schema.js`. Add tests
for authorization and public-data boundaries when changing API behavior. Never
weaken owner checks, moderator checks, CSRF protection, URL validation, or the
approved-revision public query.

Pull requests must not contain production secrets, real account databases,
private profile drafts or sensitive consent evidence.
