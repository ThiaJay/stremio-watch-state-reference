# Native Core ownership analysis

Upstream issue: `Stremio/stremio-features#1305`.

This note records the current `stremio-core` `development` branch boundary relevant to manual watched/unwatched -> native Trakt convergence. It is implementation evidence, not a substitute for maintainer ownership guidance.

## Current transition

Both manual item actions converge on a generic LibraryItem update:

`ActionCtx::LibraryItemMarkAsWatched`
or
`ActionCtx::MetaItemMarkAsWatched`

→ `LibraryItem::mark_as_watched()`

→ `Internal::UpdateLibraryItem`

→ concurrent account datastore persistence + local storage persistence.

Once the update reaches `Internal::UpdateLibraryItem`, the generic update path no longer carries the fact that the transition originated from an explicit manual watched/unwatched action.

## Existing Trakt events are not an equivalent primitive

Core currently exposes `Event::TraktPlaying` and `Event::TraktPaused` from the Player model. They carry `PlayerAnalyticsContext`: item/video identity, playback offset/duration and player state.

Reusing those events for manual watched actions would be semantically unsafe:

- manual unwatch cannot be represented by a pause/scrobble event;
- a LibraryItem action may have no active player or selected video;
- synthesising 100% playback would conflate explicit user intent with actual playback;
- emitting before datastore acceptance can diverge if persistence fails;
- emitting from the generic persistence path cannot currently distinguish a manual action from another LibraryItem update.

## Safe ownership choices

### Backend/account transition

The Stremio account/backend derives Trakt intent from an accepted persisted manual watched transition.

Advantages:
- authoritative persistence boundary;
- naturally cross-device;
- can make duplicate desired transitions idempotent;
- Core does not need a pending-intent state machine.

Requirement: the backend must be able to distinguish/derive the relevant transition safely.

### Explicit Core intent with persistence acknowledgement

Core retains an explicit manual watched intent until account persistence is confirmed, then emits a dedicated Stremio-owned watched-history intent/event.

Advantages:
- explicit action provenance;
- supports watched and unwatched;
- testable in Core.

Cost:
- requires a new internal/event boundary or pending-intent state; it is not a one-line reuse of `TraktPaused`.

## Rejected shortcut

Do **not** make `LibraryItemMarkAsWatched` emit `TraktPlaying`/`TraktPaused` immediately. That would solve the visible symptom by introducing ambiguous persistence ordering and incorrect unwatch semantics.

## Proposed first upstream change

Keep issue #1305 narrow:

1. confirm whether the native authority is backend persistence or an acknowledged Core intent;
2. implement manual item watched/unwatched convergence through that boundary;
3. make duplicate same-state intent harmless;
4. add Core/upstream tests for watched, unwatched, persistence failure and duplicate intent;
5. keep whole-season/show bulk UX as a follow-on using the same native primitive rather than widening the first PR.

The executable state-safety rules remain in this repository. Once Stremio owns the production transition natively, this project becomes reference/regression evidence rather than a runtime implementation.
