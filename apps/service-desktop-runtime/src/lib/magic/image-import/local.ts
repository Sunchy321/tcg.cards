import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isTwoImageLayout } from '@tcg-cards/shared/magic/print-image';

/** Source image extensions the local import accepts, best match first. */
const EXTENSIONS = ['.webp', '.jpg', '.jpeg'] as const;

/** Extensions mapped to the data-URL mime a preview needs. */
const PREVIEW_MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/**
 * Candidate file names for one print face in the asset directory, best match
 * first. Face 0 prefers the legacy `-0` form over the unmarked stem, face 1
 * the legacy `-1` form; webp beats jpg everywhere.
 *
 * The canonical output names (`9.webp` / `9⁑.webp`) are deliberately NOT
 * candidates: they are what this import writes, and treating them as sources
 * would let an old canonical file shadow freshly dropped material (or be
 * re-stamped with a different provenance).
 */
export function localAssetCandidates(number: string, faceIndex: number): string[] {
  const safe = number.replaceAll('/', '_');
  const legacy = EXTENSIONS.map(ext => `${safe}-${faceIndex}${ext}`);
  if (faceIndex === 0) {
    return [...legacy, `${safe}.jpg`, `${safe}.jpeg`];
  }
  return legacy;
}

/** One local asset file resolved for import. */
export interface LocalAssetFile {
  path:     string;
  fileName: string;
}

/**
 * Finds the best-matching local asset file for one print face, or null when
 * the asset directory holds no candidate.
 */
export function findLocalAssetFile(dir: string, number: string, faceIndex: number): LocalAssetFile | null {
  for (const candidate of localAssetCandidates(number, faceIndex)) {
    const path = join(dir, candidate);
    if (existsSync(path)) return { path, fileName: candidate };
  }
  return null;
}

/** One face's local asset preview: the found file (as a data URL) or a miss. */
export interface LocalAssetPreviewFace {
  faceIndex: number;
  fileName:  string | null;
  found:     boolean;
  dataUrl:   string | null;
}

/** Preview state of one print's local assets: layout plus one entry per face. */
export interface LocalAssetPreview {
  layout: string | null;
  faces:  LocalAssetPreviewFace[];
}

/**
 * Resolves the local asset preview of one print: the faces follow the print's
 * layout (two-image layouts preview front and back), and each found file is
 * read whole as a data URL — preview surfaces need the actual bytes the
 * import would ingest.
 */
export function loadLocalAssetPreview(dir: string, layout: string | null, number: string): LocalAssetPreview {
  const faces = layout != null && isTwoImageLayout(layout) ? [0, 1] : [0];
  return {
    layout,
    faces: faces.map(faceIndex => {
      const file = findLocalAssetFile(dir, number, faceIndex);
      let dataUrl: string | null = null;
      if (file != null) {
        const ext = file.fileName.slice(file.fileName.lastIndexOf('.') + 1).toLowerCase();
        const mime = PREVIEW_MIME[ext];
        dataUrl = mime != null ? `data:${mime};base64,${readFileSync(file.path).toString('base64')}` : null;
      }
      return { faceIndex, fileName: file?.fileName ?? null, found: file != null, dataUrl };
    }),
  };
}
