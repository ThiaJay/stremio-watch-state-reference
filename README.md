# Stremio Watch State Reference

> **Developer reference/specification — not an installable Stremio addon or background sync service.**

A small, cross-platform **reference harness** for watched/unwatched reconciliation and guarded bulk watched-state intent.

It is deliberately not an addon, daemon or permanent sync service. The production authority belongs in **Stremio Core/account integration**.

## Current release

**v1.1.0** hardens the reference contract so omitted current source state remains unknown/non-actionable and bulk plans require an explicit boolean state for every episode in the frozen target set.

## What “reference harness” means

The harness is executable specification code. It lets maintainers and contributors run deterministic examples of the intended behaviour, prove edge cases with tests and hand an implementation contract upstream.

It does **not autorun**. Nothing installs into startup, nothing polls in the background and no account credentials are required by the harness.

## Scope

- Reconcile complete Stremio and Trakt watched-state snapshots without guessing missing data. Missing current state in either source is held as unknown/non-actionable, never inferred as unwatched.
- Treat Stremio’s existing native Trakt link as the OAuth/scrobbling authority.
- Require repeated complete observations before turning watched into unwatched.
- Hold opposing simultaneous changes as conflicts.
- Model **Mark whole series watched/unwatched** and **Mark season watched/unwatched** as explicit episode operations.
- Require an explicit boolean current state for every episode in a bulk target; incomplete target snapshots cannot produce a plan.
- Make bulk plans stale as soon as the target snapshot changes.
- Require an exact, human-readable confirmation phrase for every bulk action and an additional removal acknowledgement for bulk unwatch.

## Not in scope

Artwork/poster repair, metadata replacement, episode ordering, stream/debrid work, recommendations, direct Trakt OAuth ownership, a hosted sync service or a permanent device process.

Those concerns belong in separate projects.

## Running it

The repository includes complete synthetic fixtures under `examples/`; the commands below can be copied exactly after `npm install`.

```text
npm test
node src/cli.js reconcile examples/reconcile.json
node src/cli.js bulk-plan examples/bulk-plan.json
node src/cli.js bulk-validate examples/bulk-validate.json
```

The CLI consumes JSON fixtures; it does not contact Stremio or Trakt. The `tt12345` IDs and `example-*` source identities in `examples/` are synthetic test values, not values to copy into a production integration.

`bulk-plan.json` demonstrates the input contract. `bulk-validate.json` contains the matching generated plan, current state and exact confirmation phrase so contributors can see the complete apply-time contract without reverse-engineering the source code.

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
