# The remote Hearthstone domain tables are publish-owned

The remote `hearthstone` domain tables (`entities`, `entity_localizations`, `entity_relations`) have exactly one writer: the desktop publisher. Local PostgreSQL is the build authority for those rows, and the remote keeps a serving copy plus a minimal publish ledger. A publish diffs a locally generated manifest against the last successful publish baseline for a bound publish target — never against the live remote tables — and publish state is never stored together with import or projection state.

**Why:** Reusing the import-side source-version state to carry publish status, and diffing or merging against the live remote tables, was rejected because it turns an out-of-band remote edit into an ordinary merge case instead of drift. Diffing against a recorded baseline is what makes a publish resumable and auditable, and it keeps the set of legitimate writers unambiguous.
