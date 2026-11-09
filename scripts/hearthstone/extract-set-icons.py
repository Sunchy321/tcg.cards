# /// script
# requires-python = ">=3.11"
# dependencies = ["unitypy", "pillow"]
# ///
"""Extract Hearthstone set-filter symbols as SVGs for the shared asset store.

Requires the Potrace executable. Example:
  uv run scripts/hearthstone/extract-set-icons.py --output /path/to/asset/hearthstone/set/icon \
    --set-map /path/to/project-sets.json --core-variant even --sets classic,naxx,core21 \
    --manifest /tmp/set-icons.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.etree import ElementTree

import UnityPy
from PIL import Image, ImageOps

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
CORE_REFERENCE = "Filter_Icons_Core.tif:effec2b862f39224bac756f4a498164a"
SVG_NAMESPACE = "http://www.w3.org/2000/svg"


class Textures:
    """Resolve base-game texture GUIDs through the original asset catalog."""

    def __init__(self, game: Path):
        """Read the catalog once and defer loading texture bundles until needed."""
        self.game = game
        self.bundles = {}
        manifest = UnityPy.load(str(game / "asset_manifest.unity3d"))
        catalog = next(
            obj.read_typetree()
            for key, obj in manifest.container.items()
            if key.lower().endswith("/base_assets_catalog.asset")
        )
        self.catalog = {
            asset["guid"]: catalog["m_bundleNames"][asset["bundleId"]]
            for asset in catalog["m_assets"]
        }

    def get(self, reference: str) -> tuple[Image.Image, dict]:
        """Decode a texture while preserving the GUID and bundle provenance."""
        guid = reference.rsplit(":", 1)[1].lower()
        bundle = self.catalog[guid]
        if bundle not in self.bundles:
            self.bundles[bundle] = UnityPy.load(str(self.game / bundle))
        obj = self.bundles[bundle].container[guid]
        assert obj.type.name == "Texture2D", reference
        texture = obj.read()
        image = texture.image.convert("RGBA")
        return image, {
            "reference": reference,
            "guid": guid,
            "bundle": bundle,
            "path_id": obj.path_id,
            "texture_name": texture.m_Name,
            "texture_size": list(image.size),
        }


def crop_symbol(
    atlas: Image.Image, x: float, y: float, recover_core_bleed: bool = False,
) -> tuple[Image.Image, list[int]]:
    """Keep the whole atlas cell rather than truncating artwork to mesh UVs."""
    assert all(abs(value * 4 - round(value * 4)) < 1e-6 for value in (x, y))
    assert 0 <= x <= 0.75 and 0 <= y <= 0.75
    box = [
        round(x * atlas.width), round((0.75 - y) * atlas.height),
        round((x + 0.25) * atlas.width), round((1 - y) * atlas.height),
    ]
    if recover_core_bleed:
        # The core dragon extends two pixels past the nominal 128px cell.
        # Recover its full silhouette and exclude that sliver from the scarab
        # by moving only occupied vertical boundaries to a transparent column.
        alpha = atlas.getchannel("A")
        for edge in (0, 2):
            column = box[edge] if edge == 0 else box[edge] - 1
            if alpha.crop((column, box[1], column + 1, box[3])).getextrema()[1] == 0:
                continue
            boundary = box[edge]
            choices = range(max(0, boundary - 16), min(atlas.width, boundary + 17))
            separators = [candidate for candidate in choices if
                          alpha.crop((candidate, box[1], candidate + 1, box[3])).getextrema()[1] == 0]
            if not separators:
                raise ValueError("Core symbols have no transparent separator.")
            separator = min(separators, key=lambda candidate: abs(candidate - boundary))
            box[edge] = separator if edge == 0 else separator + 1
    cell = atlas.crop(box)
    alpha = cell.getchannel("A")
    borders = [
        alpha.crop((0, 0, cell.width, 1)),
        alpha.crop((0, cell.height - 1, cell.width, cell.height)),
        alpha.crop((0, 0, 1, cell.height)),
        alpha.crop((cell.width - 1, 0, cell.width, cell.height)),
    ]
    if any(edge.getextrema()[1] != 0 for edge in borders):
        raise ValueError(f"Artwork reaches the atlas cell boundary: {box}")
    return ImageOps.expand(cell, border=2, fill=(0, 0, 0, 0)), box


def trace_symbol(image: Image.Image, target: Path, potrace: str) -> dict:
    """Trace original alpha into paths with holes, keeping all small components."""
    mask = image.getchannel("A").point(lambda alpha: 0 if alpha >= 128 else 255, "1")
    with tempfile.TemporaryDirectory(prefix="hearthstone-set-icon-") as directory:
        bitmap = Path(directory) / "symbol.pbm"
        output = Path(directory) / "symbol.svg"
        mask.save(bitmap)
        subprocess.run(
            [potrace, str(bitmap), "--svg", "--turdsize", "0", "--output", str(output)],
            check=True, capture_output=True, text=True,
        )
        traced = ElementTree.fromstring(output.read_text())
    group = traced.find(f"{{{SVG_NAMESPACE}}}g")
    if group is None or not group.findall(f"{{{SVG_NAMESPACE}}}path"):
        raise ValueError(f"Empty traced symbol: {target}")
    # RGB is constant ink in the original filter atlases; alpha contains the
    # silhouette. Preserve the ink, not antialiasing samples from a WebP copy.
    ink = max(
        ((count, color) for count, color in image.getcolors(image.width * image.height)
         if color[3] >= 128),
        key=lambda item: item[0],
    )[1]
    group.set("fill", "#{:02x}{:02x}{:02x}".format(*ink[:3]))
    ElementTree.register_namespace("", SVG_NAMESPACE)
    svg = ElementTree.Element(f"{{{SVG_NAMESPACE}}}svg", {
        "viewBox": f"0 0 {image.width} {image.height}",
    })
    svg.append(group)
    content = ElementTree.tostring(svg, encoding="unicode")
    content = re.sub(r"\s+", " ", content).encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return {
        "svg_bytes": len(content),
        "svg_sha256": hashlib.sha256(content).hexdigest(),
        "source_rgba_sha256": hashlib.sha256(image.tobytes()).hexdigest(),
        "size": list(image.size),
    }


def main() -> None:
    """Export project setId assets using DBF IDs only to locate source artwork."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-data", type=Path, default=Path("/Applications/Hearthstone/Data/OSX"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--set-map", type=Path, required=True, help="JSON array of project sets with setId and dbfId.")
    parser.add_argument("--sets", help="Comma-separated project setIds; defaults to all mapped filter icons.")
    parser.add_argument("--core-variant", choices=["odd", "even"], required=True)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    potrace = shutil.which("potrace")
    if potrace is None:
        parser.error("Potrace is required to generate SVG paths.")
    selected = {value.strip() for value in args.sets.split(",")} if args.sets else None
    project_sets = json.loads(args.set_map.read_text())
    ids = [row["setId"] for row in project_sets]
    if len(ids) != len(set(ids)):
        parser.error("Project setIds must be unique.")
    for set_id in ids:
        if not set_id or set_id in {".", ".."} or "/" in set_id or "\\" in set_id:
            parser.error(f"Unsafe project setId: {set_id!r}")
    dbf = UnityPy.load(str(args.game_data / "dbf.unity3d"))
    records = {
        row["m_ID"]: row
        for row in dbf.container["Assets/Game/DBF-Asset/CARD_SET.asset"].read_typetree()["Records"]
    }
    textures = Textures(args.game_data)
    # The original Classic filter symbol is the game's Hearthstone spiral.
    # Keep it outside setId directories as the shared missing-symbol fallback.
    fallback_record = records[3]
    fallback_atlas, fallback_provenance = textures.get(fallback_record["m_filterIconTexture"])
    fallback_image, fallback_box = crop_symbol(
        fallback_atlas, fallback_record["m_filterIconOffsetX"], fallback_record["m_filterIconOffsetY"]
    )
    fallback_facts = trace_symbol(fallback_image, args.output / "default.svg", potrace)
    exported = []
    for project_set in sorted(project_sets, key=lambda row: row["setId"]):
        set_id = project_set["setId"]
        if selected is not None and set_id not in selected:
            continue
        dbf_id = project_set["dbfId"]
        record = records.get(dbf_id)
        if record is None:
            continue
        core = bool(record.get("m_isCoreCardSet"))
        reference = CORE_REFERENCE if core else record.get("m_filterIconTexture")
        if not reference:
            continue
        atlas, provenance = textures.get(reference)
        if core:
            # CollectionManagerDisplay.AddSetFilter divides the offsets from
            # SetRotationIcon.GetYearIconTextureOffset by two. The caller must
            # choose a default explicitly; the calendar year is not consulted.
            variants = [("odd", 0.0, 0.25), ("even", 0.25, 0.25)]
        else:
            variants = [("default", record["m_filterIconOffsetX"], record["m_filterIconOffsetY"])]
        for variant, x, y in variants:
            image, box = crop_symbol(atlas, x, y, recover_core_bleed=core)
            key = f"{set_id}/{variant}.svg"
            facts = trace_symbol(image, args.output / key, potrace)
            exported.append({"set_id": set_id, "dbf_id": dbf_id, "key": key, "variant": variant,
                             "atlas_box": box, **provenance, **facts})
            if core and variant == args.core_variant:
                default = args.output / str(set_id) / "default.svg"
                shutil.copyfile(args.output / key, default)
                exported.append({**exported[-1], "key": f"{set_id}/default.svg", "variant": "default"})
    if selected is not None:
        missing = selected - {row["set_id"] for row in exported}
        if missing:
            raise ValueError(f"Selected sets have no filter symbol: {sorted(missing)}")
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps({
            "source": str(args.game_data), "core_default": args.core_variant,
            "trace": {"alpha_threshold": 128, "turdsize": 0, "potrace": potrace},
            "icons": exported,
            "fallback": {"key": "default.svg", "dbf_id": 3, "atlas_box": fallback_box,
                         **fallback_provenance, **fallback_facts},
        }, indent=2) + "\n")
    print(f"Exported {len(exported)} SVG files for {len({row['set_id'] for row in exported})} sets.")


if __name__ == "__main__":
    main()
