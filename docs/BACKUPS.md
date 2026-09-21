# Database backups and restore

The SQLite database contains both public profiles and private account data.
Backups therefore require encryption, access control, retention limits and
secure deletion. Do not commit database files to Git.

## Backup

Use SQLite's online backup command against the persistent production volume:

```bash
mkdir -p backups
sqlite3 data/legacy.sqlite ".backup 'backups/legacy-$(date +%F).sqlite'"
```

Copy the backup to an encrypted location controlled by the operator. Record a
retention period appropriate to applicable law and operational needs. The
application does not enforce backup retention automatically.

## Restore test

Stop writes, keep the current database as a rollback copy, and validate a
restored copy before switching paths:

```bash
sqlite3 backups/legacy-YYYY-MM-DD.sqlite "PRAGMA integrity_check;"
DATABASE_PATH=/tmp/legacy-restore.sqlite npm run migrate
```

For an actual restore, copy the chosen backup to a new persistent path, set
`DATABASE_PATH` to it, run `npm run migrate`, start the application, and verify
sign-in plus approved-only public access. Do not test with production reset
emails enabled.

Deleted live records can remain in backups until those backups expire. The old
static archive may also remain in Git history, forks and clones. Backups improve
recoverability; they do not guarantee permanence.
