# Card image fields belong to local image import, not to projection

The image columns on a Magic print are owned by the local image import modules. When projection re-runs, a print whose image information was already written by the Scryfall import, the Gatherer import, or the manual import keeps its image status and image information; projection writes defaults only for prints that have no locally imported image. Manual replacement therefore outranks every automated source without any explicit priority check.

**Why:** Letting projection always write authoritative Scryfall draft values would keep re-projection uniform and simple, but it silently destroys manual replacements and previously imported images, and it orphans the image bytes already in the bucket once the row's pointer is rewritten. The import side already applies the general rule that a manual edit outranks an imported value; this ADR is that rule applied to local projection.
