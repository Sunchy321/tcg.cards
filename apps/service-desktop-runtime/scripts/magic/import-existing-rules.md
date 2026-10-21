# Import retained Comprehensive Rules

`import-existing-rules.ts` imports retained original files through the existing local document service. It does not download files, replace a release with different source text, or publish remotely. Source TXT produces the document body; PDF, DOC, DOCX and RTF remain optional original downloads.

Set these environment variables before running with Bun:

| Variable | Purpose |
| --- | --- |
| `RULE_ARCHIVE_DIR` | Retained originals root, with `txt/`, `doc/`, `pdf/` and optional `rtf/` folders containing `YYYY-MM-DD` files. |
| `RULE_RESEARCH_DIR` | Optional historical evidence directory. No serving application reads it. |
| `RULE_IMPORT_DATABASE_URL` | Configured local build database connection, required unless `--offline` is selected. |
| `RULE_IMPORT_REPORT` | Output JSON report path; use a new report path outside the original archive and evidence files. |

```sh
# Default: verify using the local database and roll back each version.
bun apps/service-desktop-runtime/scripts/magic/import-existing-rules.ts

# Verify files and parsing in isolated in-memory storage, without a database.
bun apps/service-desktop-runtime/scripts/magic/import-existing-rules.ts --offline

# Apply imports to the local build database.
bun apps/service-desktop-runtime/scripts/magic/import-existing-rules.ts --apply

# Limit any mode to selected dates; this option is repeatable.
bun apps/service-desktop-runtime/scripts/magic/import-existing-rules.ts --offline --version 2025-02-07
```

Database preflight exercises real inserts in transactions that are subsequently rolled back. It requires the existing schema and enough database storage for those temporary writes. It cannot verify a future batch against newly imported earlier versions because each preflight version is rolled back. Offline verification checks file parsing and metadata only; it cannot detect conflicts with persisted translations, comparisons or existing release content. `--offline --apply` is rejected.

Historical evidence is read from `inventory.json`, `requests.json`, `asset-fill-result.json`, `official-overwrite-result.json` and `url-index-data-mapping.json` when present. Extra fields are ignored; corrupt supplied reports are rejected. Candidate files must match the retained file's actual size, SHA-256, format and version. Fill and official overwrite records must agree with the retained bytes; the previous inventory and backups never establish current provenance. A final URL requires a successful, valid request for the same bytes and candidate path. Multiple distinguishable mirror origins remain unresolved rather than choosing one. Previously saved provenance is retained only when it already has a matching measured hash. File size and hash are recalculated, not copied from reports. No file timestamps become download or check timestamps.

The URL index also supplies each version's historical official release address, saved per file as `officialUrl` and exposed through the public metadata API. It is a separate fact from the actual download provenance in `sourceUrl`/`effectiveUrl`: an entry is attached whenever exactly one indexed URL maps to the version and file format, whether that address still resolves or not, and it never requires matching bytes. Entries without a single unambiguous version mapping, an unrecognized file extension, or more than one address for the same version and format stay empty. Local data paths from the index are never saved.

The report includes each version's proposed/adopted file descriptors, unresolved metadata reasons, and `imported`, `skipped` and `failed` counts. `uncertain` counts unresolved reasons, so one file can contribute more than one. In preflight, `imported` means a proposed change that was rolled back. Versions without TXT are skipped. Historical “current as of” headers and date headers without a final period are recognized. Unproven dates or saved release dates that conflict with the retained source are rejected rather than silently changing official chronology. Content or association conflicts reject that version and preserve its previous content. Errors are sanitized; storage exhaustion, unavailable schema or connection failure stop later versions. Successful versions commit independently when applying. Import-attempt recording follows content commit; a recording failure is reported without misreporting adopted content as rolled back.

Imports retain one static document and one release per version. Existing same-file parsing and translation/comparison protection remain in force. TXT captures that differ only in blank-line whitespace keep the saved revision and refresh file metadata; parsed rule content decides whether an existing release conflicts. Source and translation statistics describe their own saved nodes. Repeating an unchanged import reports it as skipped. Original files, research reports and backups are read only. The command does not generate/apply migrations, upload assets, or publish documents; use the existing asset delivery and document publication workflows afterward.
