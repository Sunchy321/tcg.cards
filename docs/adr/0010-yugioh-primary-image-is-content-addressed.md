# A Yu-Gi-Oh! primary image is a content-addressed bucket object

A card has at most one primary image — the vendor-provided WebP — whose bytes exist only as a bucket object addressed by its SHA-256 content hash. The database stores image facts and never bytes. Those facts sit on the card row rather than in a separate image table, so the existing card publisher and manifest already carry them, and a source-deleted image only soft-deletes the fact while the object stays in place.

**Why:** Several alternatives were rejected: a one-to-many image / alt-art entity in the first version (deferred until an alt-art requirement exists), storing image binaries in PostgreSQL, hot-linking the vendor CDN, reusing the Hearthstone PNG-render pipeline instead of storing the vendor's WebP, and giving the desktop R2 credentials. Content addressing dedupes identical content and guarantees that a changed source never overwrites an existing object.
