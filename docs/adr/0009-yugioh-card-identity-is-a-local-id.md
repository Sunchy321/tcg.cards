# A Yu-Gi-Oh! card is identified by a locally minted internal id

A card is identified by an internal auto-increment id minted by the local build database. The 8-digit card password and the source `cid` are nullable external facts, unique when present, used only as assisted match keys. Import idempotency is anchored on the `(source, source record)` mapping, and names never take part in matching. Because the local database is the only id authority, the publisher writes ids into the remote explicitly and calibrates the remote sequence after each publish.

**Why:** Using the card password or the `cid` as the identity was rejected because dozens of source records have no usable password, a card may legitimately lack one, and distinct cards can share a code. Letting the remote mint its own ids and translating foreign keys through a published source mapping was also rejected: local and remote rows would no longer be comparable by id, and the sync surface would widen for no gain.
