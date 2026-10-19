# Hearthstone series symbols

Series symbols are game content served by the existing asset store. The site resolves them through `runtimeConfig.public.assetBaseUrl`, just as the Magic site resolves its series symbols. They are not shipped in the Hearthstone site's public directory.

## Asset keys

- `hearthstone/set/icon/<setId>/default.svg`
- `hearthstone/set/icon/default.svg` (shared Hearthstone spiral fallback)
- `hearthstone/set/icon/core21/odd.svg`
- `hearthstone/set/icon/core21/even.svg`

Resource directories use the project `hearthstone.sets.set_id`, such as `cat`, `att`, and `gdb`. DBF IDs locate original game artwork only; they are not resource keys. The current default preserves the previously selected scarab artwork, which is the game's even-rotation symbol. Both rotation alternatives are retained; there is no calendar-based selection in the site. Changing the current core artwork is an explicit content decision, not a side effect of running extraction on a different date.

Historical sets keep their actual project identities: `classic` (DBF 3) and `van` (DBF 1646) have distinct symbols. The series catalog and localized names come from the database. The URL resolver uses setId directly, without a static allowlist or legacy-key mapping; neither numeric IDs nor `SET_<number>` are used as asset directory names.

Series without available artwork retain their database names and use the game's Hearthstone spiral as their icon. The shared fallback is traced from the original Classic filter symbol with the same extraction settings as the series symbols.

## Reproduce the SVGs

The extraction script reads the installed game's `CARD_SET` records and resolves each filter texture GUID through the base asset catalog. It uses the collection filter icons, not the card-background watermarks or expansion title logos.

Dependencies: Python 3.11+, UnityPy, Pillow, and the Potrace executable. The Python dependencies are declared in the script's PEP 723 header.

Export the authoritative `setId` / `dbfId` mapping from the project series table as a JSON array. For example, the current data contains `[{"setId":"cat","dbfId":1980},{"setId":"att","dbfId":1957}]`. Do not infer setIds from enum names or old page localization keys.

From the repository root, the current site's symbol set can be regenerated with:

```sh
uv run scripts/hearthstone/extract-set-icons.py \
  --output ../asset/hearthstone/set/icon \
  --core-variant even \
  --set-map .scratch/hearthstone-set-icons/icon-set-map.json \
  --manifest .scratch/hearthstone-set-icons/release-manifest.json
```

The game data directory defaults to `/Applications/Hearthstone/Data/OSX` and can be overridden with `--game-data`. `--set-map` is required and contains the project mapping. Optional `--sets` takes comma-separated project setIds; omitting it requests every mapped set with a filter icon. `--core-variant` is required so extraction cannot silently choose new core artwork.

The script preserves the whole atlas cell and adds transparent padding. The core dragon extends two pixels beyond its nominal cell; occupied core boundaries are moved to the nearest transparent separator so the dragon is complete and its tip does not leak into the scarab. Any remaining occupied crop boundary is an error.

SVGs contain real vector paths, not embedded raster images. Potrace traces the original Alpha channel at 50% coverage, with small-component suppression disabled. This preserves small disconnected details while producing scalable curves. Tracing is an approximation of the source silhouette; review both enlarged symbols and their actual display size before publishing a new extraction. The manifest records source references, bundle and object identities, crop rectangles, source-image hashes, and SVG hashes.

## Publish and verify

Use the existing asset copy workflow, scoped to `hearthstone/set/icon`. Copying this prefix does not require syncing or deleting unrelated objects. The deployment host's existing `asset.sh cloud hearthstone/set/icon` command publishes this directory when run from its parent workspace.

Before switching a page to new symbols, verify that the resource service returns `200` with `image/svg+xml`, and that the response body matches the generated file. The local development asset base may be a separate server such as `http://localhost:8889`; verify that server independently from the production asset domain.

The site's existing monochrome CSS continues to handle light and dark themes. No resource names, game IDs, extraction controls, or implementation notes belong in frontend copy.
