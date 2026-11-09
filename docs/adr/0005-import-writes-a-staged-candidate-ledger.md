# Import writes only a staged candidate ledger; actionable status is derived

Import candidates live in their own `magic_data` ledger (sources, rule sets, field rules, runs, raw records, change sets, field changes), while human review actions live in `magic_app`. The status columns on change rows are derived caches recomputed from those authoritative tables, never the source of truth. The domain tables are mutated only by an explicit apply step, and every candidate is recorded before any decision is made, so `overwrite` is a recommendation rather than a direct write.

**Why:** Extending the in-domain pending-update mechanism and driving whole-record overwrite from per-source trust was rejected: candidates could not then be isolated by source, rule set, or run, batch approval and rollback would have no stable fact to stand on, and source rules, field rules, and approval facts would have no shared home.
