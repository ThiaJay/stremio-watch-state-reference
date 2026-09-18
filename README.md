# Stremio Watch State Reference

A small, cross-platform **reference harness** for watched/unwatched reconciliation and guarded bulk watched-state intent.

It is deliberately not an addon, daemon or permanent sync service. The production authority belongs in **Stremio Core/account integration**.

## What “reference harness” means

The harness is executable specification code. It lets maintainers and contributors run deterministic examples of the intended behaviour, prove edge cases with tests and hand an implementation contract upstream.

It does **not autorun**. Nothing installs into startup, nothing polls in the background and no account credentials are required by the harness.

## Scope

- Reconcile complete Stremio and Trakt watched-state snapshots without guessing missing data.
- Treat Stremio’s existing native Trakt link as the OAuth/scrobbling authority.
- Require repeated complete observations before turning watched into unwatched.
- Hold opposing simultaneous changes as conflicts.
- Model **Mark whole series watched/unwatched** and **Mark season watched/unwatched** as explicit episode operations.
- Make bulk plans stale as soon as the target snapshot changes.
- Require an exact, human-readable confirmation phrase for every bulk action and an additional removal acknowledgement for bulk unwatch.

## Not in scope

Artwork/poster repair, metadata replacement, episode ordering, stream/debrid work, recommendations, direct Trakt OAuth ownership, a hosted sync service or a permanent device process.

Those concerns belong in separate projects.

## Running it

```text
npm test
node src/cli.js reconcile example.json
node src/cli.js bulk-plan example.json
node src/cli.js bulk-validate example.json
```

The CLI consumes JSON fixtures; it does not contact Stremio or Trakt.

## Production contract

A native implementation should preserve the same gates:

1. complete and identified source snapshots;
2. explicit per-item operations;
3. fresh-state validation at apply time;
4. no implicit “missing = unwatched” rule;
5. conflict isolation;
6. repeated evidence plus explicit confirmation for watched → unwatched;
7. exact scope summary and confirmation for season/show bulk actions.

This keeps the reference cross-platform because the behaviour is account/core logic, not a Windows-specific helper.
