# Changelog

## 1.1.0 — 2026-09-18

- Missing current state from either source is held as unknown/non-actionable rather than behaving like unwatched.
- Bulk plans require explicit boolean current state for every episode in the frozen target set.
- Snapshot, unknown-key, observation, source-identity, season/episode and catalog-key bounds fail closed.
- Adds six adversarial regression cases for incomplete/malformed state.
- Adds Linux, Windows and macOS CI with dependency audit.

## 1.0.1 — 2026-09-18

- Added runnable synthetic fixtures and clarified the developer-reference role.
