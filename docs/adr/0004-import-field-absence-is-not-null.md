# A missing import field is not null

Each import source declares its coverage per field path (`supported`, `conditional`, `unsupported`), and every normalized record carries a state per candidate field (`provided`, `explicit_null`, `not_provided`, `not_applicable`, `parse_failed`). Only `provided`, plus `explicit_null` for a nullable field whose policy allows clearing, may produce a field change; the other states never enter the diff or the approval queue. A `null` therefore means "the source explicitly declared this field empty". It never means "unknown", and it never means "this source does not cover this field".

**Why:** Collapsing every kind of absence into a single `null` sentinel and diffing whatever the incoming payload happens to contain is simpler, but then a source that stops covering a field, or a single record that omits it, produces bulk "clear this field" candidates against data nobody meant to touch.
