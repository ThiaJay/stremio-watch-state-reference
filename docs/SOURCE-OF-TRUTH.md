# Source of truth

**Authority:** this repository defines watched-state reconciliation semantics only.

Permanent execution target: **Stremio Core/account integration**.

Active upstream ownership discussion: `Stremio/stremio-features#1305`. Do not introduce a hosted sync authority while that native ownership path is being pursued.

The harness is manual/on-demand. It never becomes a startup task, background daemon, browser extension or hosted sync authority.

Bulk watched-state actions are part of the same domain because they mutate the same watched-state model. They therefore belong here rather than in Story Order, Poster Safety or streaming addons.

Missing current state from either current source is unknown and non-actionable. Bulk intent is valid only when every episode in the frozen target set has an explicit current boolean state.
