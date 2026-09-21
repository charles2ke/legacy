# Pull request

## Summary

<!-- Describe the behavior changed and why. Do not include private account or profile data. -->

## Validation

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm audit --omit=dev`

## Security and privacy

- [ ] No secrets, production databases, private drafts, consent evidence or account data are included.
- [ ] Server-side authorization and validation cover every new mutation.
- [ ] Public APIs still expose only approved profile revisions.
- [ ] New dependencies, migrations and production configuration are documented.

Profile content is created through the running application's private draft and
moderation workflow, not through a public pull request. The retained JSON files
are archive/import examples only.
