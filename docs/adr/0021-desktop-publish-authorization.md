# 0021: Desktop publish authorization through admission checks and a least-privilege database role

**Status:** Accepted; implementation pending (console-electron tickets 13–15).

The desktop console keeps its direct-database publish channel as the remote write path: remote content is maintained by editing the local build authority and publishing. The existing Magic rule page also keeps one authenticated, read-only `site-console` call for listing cloud rule files. This narrow compatibility read does not expose a general remote API client or remote editing surface. Authorization for publishing is layered.

1. Admission check. Before a publish task starts, the desktop asks the deployed web console backend whether the logged-in account may publish to the target; the backend answers from the existing better-auth account system, reusing the per-game `data` permission (owner holds all games, `admin/<game>` holds one). No new permission type is introduced. When the backend is unreachable the publish is refused with an explicit error (fail closed), so the account system stays authoritative.

2. Database role enforcement. Publish connection strings use a dedicated role on the remote database, granted only the schemas and tables publishing writes. The role is the real execution boundary; the admission check provides correctness and audit rather than hard enforcement.

Short-lived server-issued credentials were assessed and deferred: feasible (a server-set password with `VALID UNTIL`) but not worth the issuance machinery for a personal application. The seam — resolving a publish target's connection string — stays swappable so credential issuance can replace stored strings later without touching the publish flow.

Login reuses the web console account system through the deployed `/auth` endpoints, entered in the desktop settings page, persisted encrypted across restarts, and never gating local capability; a remote operation attempted without a session guides the user to the settings page and back. Publishing shows a confirmation of target and scope before starting, and the remote `publish_ledgers` ledger gains an operator column recording the publishing account's user ID — the single approved exception to this migration's no-schema-change posture, because the ledger is the audit authority for publish streams.

The cloud rule file catalog uses the stored session only in the Electron main process and invokes the fixed `magic.rule.listFiles` procedure. The renderer cannot select an endpoint or send an arbitrary authenticated request. Rule imports and publication continue to use the local build database and the direct-database publish flow.

**Why:** The publish path bypasses every application server by design (bulk writes at a scale an API hop would not serve), so an API-side permission check alone would be advisory — the stored connection string would remain a key with no boundary. Reusing the account system's per-game data permission avoids a second permission model, fail-closed keeps the check meaningful whenever it cannot run, and the least-privilege role gives the database itself the final word on what publishing may touch. Attribution belongs in the remote ledger rather than local task records because the ledger survives machine changes and is already the reconciliation authority (ADR-0008).

This resolves ADR-0019's remote-access design checkpoint. It does not change ADR-0008's single-writer or baseline-diffing rules.
