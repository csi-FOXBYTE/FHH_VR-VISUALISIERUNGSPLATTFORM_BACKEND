# Owner lifecycle rollout

The backend is the sole owner of versioned database migrations. Migrations are
run once by the release job with `pnpm prisma migrate deploy`; application
startup must never run schema migrations.

## Existing databases

The baseline migration describes the schema that existed before owner lifecycle
hardening. Register it once on an existing installation before deploying
Release A:

```sh
pnpm prisma migrate resolve --applied 20260821000000_baseline
pnpm prisma migrate deploy
```

Do not mark the baseline as applied on a newly created database. A new database
must apply the baseline normally through `prisma migrate deploy`.

## Release A

Release A adds the deletion-impact, successor, atomic transfer-and-delete,
orphan-repair and preflight APIs. Owner columns intentionally remain nullable.
Deploy the application and migration
`20260821000100_owner_lifecycle_release_a`, then use the administrative repair
dialog until the preflight reports no null owners and no invalid references.

Audit rows contain internal IDs, entity type/count, timestamp and correlation
ID only. They are inaccessible through ZenStack client policies and are removed
after 365 days by the scheduled cleanup worker.

## Release B gate

Release B must not be deployed until the preflight exits successfully:

```sh
pnpm owner:preflight
```

Release B changes all four owner relations to `NOT NULL` and `ON DELETE
RESTRICT`. Its migration repeats the preflight under a database lock and aborts
without changing the schema if an orphan remains.
