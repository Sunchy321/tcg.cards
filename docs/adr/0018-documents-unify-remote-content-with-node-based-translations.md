# 0018: Documents unify remote content with node-based translations

**Status:** Accepted; core implementation and generated database migrations are present; database application and deployment are pending.

Static documents and user-authored documents share a content model and remote serving tables, while the local build database contains only user-independent static content. Documents distinguish saved revisions from public releases, represent content as nodes, and attach translations to exact source nodes. This supports ordinary articles and large rulebooks without imposing CR-specific import or comparison workflows on every document.

## Storage and ownership

This design applies within each game. It does not introduce a cross-game document namespace. Common rich-text capabilities do not imply cross-game content storage.

| Data | Local placement | Remote placement |
| --- | --- | --- |
| Document identities, translations, revisions, nodes, releases, and release translations | `{game}`: static, exportable content only | `{game}_app`: unified static and user content |
| Import configuration, execution records, parser versions, source hashes, and build/publication bookkeeping | `{game}_data`, local-only for this workflow | Not required by public document reads |
| User authorship, user operations, permissions, and user review decisions | Absent | `{game}_app`, remote-only |

The same logical content fields can be reused across tracks, but local definitions have no user foreign keys or user-operation records. Publishing explicitly maps local static records into remote application tables. It does not require identically deployed schemas, a second remote static document copy, or a union view.

Remote document identity includes an explicit static/user origin, a stable static publication key when applicable, and nullable user authorship. Static documents have no user author; user documents require one. Publication owns only static-origin content and its content relationships. Remote user content and user-operation records remain outside the publication write set. This ownership is row-scoped, not inferred from the remote table's namespace. Static content never depends on application tables in the local database, and user content never flows back into local builds.

Static content remains read-only to users. Where copying is permitted, it creates an independent user-owned content copy; future source updates neither update that copy nor notify its owner. Article copying is a separate permission, not a universally available action. For decks, copying the card composition does not grant the source's official preconstructed-product identity. Standard classifications may be shared with user decks; user-defined tags do not acquire official game semantics merely by matching a label. The concrete deck attribute schema is outside this document decision.

## Revisions and releases

A revision is an immutable saved content state, created by explicit Save or by import/generation. A release is an intentional public edition referencing a source revision. Ordinary articles can publish successive releases just as CR does. An unpublished working state can coexist with the previous release, and the first revision does not require a release to exist.

For CR file imports, the selected source revision is the public imported content, not an editing revision. A manual reimport of the same retained file reparses and replaces its source nodes in that public revision without creating another revision or release. This exception repairs parsing errors without changing the retained source bytes or revision metadata. Publication can apply the same repair to an existing static CR source. Replacement is transactional and is rejected while saved translations or remote comparison records depend on the old parsing; it must not silently invalidate those references. Authored saves and translation revisions retain their existing immutable-content contract.

Saved revision history is retained by default; its public visibility is configurable. Authors or maintainers can explicitly remove unwanted intermediate history or compact it after release. This clears history entries without destroying content still referenced by a release or translation. With soft deletion, internal reference resolution must still be able to read retained content that public history views omit. There is no separate mandatory snapshot table: the revision itself is the snapshot.

Revision visibility, access to previous public releases, and release comparison are distinct capabilities. The exact controls and reader behavior are implementation requirements to refine separately. Automatic draft recovery before an explicit save is also separate from saved revisions.

## Core logical tables

These names and fields describe responsibilities, not a ready-to-generate migration. Local and remote physical definitions differ according to the ownership rules above.

| Table | Principal fields and responsibility |
| --- | --- |
| `documents` | Stable identity, title, source language, origin, static publication key, document capabilities, and remote-only user authorship. |
| `document_translations` | Stable translation identity, document reference, and target language. One translation per document and target language. No separate translation author is modeled in the current scope. |
| `document_revisions` | Document reference, optional translation reference, exact source revision for translations, saved title, creation time, and history cleanup state. Contains the immutable content state through its nodes. |
| `document_revision_nodes` | Revision reference, stable node key, node kind, original structural order/parentage, anchor or source numbering, `raw_text`, typed `markers`, and, for translated nodes, exact source-node reference and translation provenance/status. |
| `document_releases` | Document reference, version label, source revision, publication time, optional effective date, and typed original-file descriptors. |
| `document_release_translations` | Release, target language, and selected translation revision. Allows a translation correction without inventing an independent translated public release. |

Use fields for values owned by one record: document settings, node markers, and the release's original-file descriptors are typed structures. Original-file descriptors identify format, language, source, storage location, and relevant integrity metadata; file bytes live in file storage. TXT, PDF, DOC, and DOCX are formats rather than fixed URL columns. File descriptors can identify which translation they accompany. Generated PDF export is not currently required and is distinct from supplying original files.

Keep independently referenced relationships as rows: revisions, nodes, releases, and release-to-translation selections need stable references and constraints. A stable node key is initially a field, rather than a separate identity-only table; it is distinct from a changeable displayed rule number. Advanced matching, split/merge relations, and remote review records remain separate optional capabilities, not prerequisites for saving ordinary articles.

## Node text, rendering, and search

Nodes are the storage unit for both ordinary articles and long rulebooks. Directory generation is an optional projection of the structure, not the reason structure exists. Disabling directory parsing does not remove nodes, anchors, or translation references.

`raw_text` is the authoritative readable text. Typed range markers add emphasis, links, card references/avatars, and other supported annotations without duplicating the text. Game symbols such as `{W}` remain literal text: they require neither special storage formatting nor a marker. A game-specific renderer recognizes them; common rendering handles shared formatting. Import adapters recognize supported source conventions and produce the same text-and-markers contract as authored content.

Full-text search uses node `raw_text` and saved titles, with node numbering/anchors available as explicit search fields. Rich-text serialization and internal reference IDs are not indexed as prose. Search indexes are derived data. Public search selects the applicable release and translation revisions and enforces visibility; retaining a draft or intermediate revision does not make it publicly searchable. Chinese segmentation, ranking, symbol queries, index technology, and precise search scope remain implementation choices.

Text and markers are saved together. Marker offsets must follow a single defined counting convention and be validated against their text; the exact convention is not selected here. Text normalization must preserve valid ranges. A translation cannot reuse source character offsets after wording or word order changes; its markers must be generated for its own text while preserving literal symbols and semantic references.

## Translation relation

Translation is a dedicated relationship, not a generic derivation graph or an independently published article. Source nodes establish the structure; each translated node references a specific node in the exact source revision, with at most one translated node per source node in a translation revision. Missing translations are representable without inventing empty translated text.

For CR, public release labels follow the official source. Chinese content can have multiple saved revisions, while the release-to-translation relationship selects the currently served revision. Translation corrections do not create a separate Chinese public version sequence. The current translation-generation workflow is automatic and creates source references itself; a manual alignment workflow is not required. Imported or generated translation provenance must distinguish automatic ingestion from actual machine translation: automatically importing a human translation does not make its text machine-translated. Translation method and review state are separate node-level facts.

Enforce same-document ownership of revisions, same-revision parentage, translation-node membership in the declared source revision, and agreement between a release's source revision and its selected translation revision. Use database constraints where expressible and transactional validation for the remaining checks. Automatic generation does not replace these integrity guarantees.

## Considered options and consequences

- Separate static/user remote tables with a union view were rejected in favor of one serving identity and straightforward content, tag, and interaction references. The cost is explicit local-to-remote publication mapping and strict static-origin write ownership.
- Creating a second dynamic content row for every static row was rejected: it introduces duplicate content lifecycles. Remote contains one serving representation; local remains the static build authority.
- A separate snapshot table was folded into revisions. Cleanup must preserve referenced content, rather than relying on duplicate snapshot identity.
- Independent translated articles and public version sequences were rejected for the current source-following translation scope. A dedicated translation identity remains useful even without its own author.
- Whole-document JSON would weaken node references, selective reads, and translation constraints. Per-node text plus markers avoids maintaining a second full rich-text copy and keeps search text authoritative.

The implementation removes the old shared document/rule tables and their import-state read dependencies. Static import and publication execute locally; remote comparison caches and user review history reference exact new revisions and remain independent of publication. The existing advanced matcher operates on revision nodes, and formal node history resolves lineage chronologically so archive import order does not determine identity. Existing rule URLs use a common CR serving adapter. Full-text search combines a derived PostgreSQL simple index with literal substring matching for Chinese text and symbols; more advanced segmentation remains a separate choice. Database migration files are generated only at commit time; accepting and implementing this model does not apply it to a configured database.
