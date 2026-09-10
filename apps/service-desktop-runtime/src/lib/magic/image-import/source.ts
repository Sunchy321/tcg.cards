import { and, isNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { isTwoImageLayout, twoImageLayouts } from '@tcg-cards/shared/magic/print-image';
import type { ImageInfo } from '#model/magic/schema/print';

import { faceIndexOf } from './common';

/** Image sources fetched over HTTP rather than uploaded from local files. */
export type RemoteImageSource = 'scryfall' | 'gatherer';

/** One downloadable face of a queued print row. */
export interface FaceTarget {
  faceIndex: number;
  url:       string;
}

/** One print row queued for a remote download pass, with its resolvable faces. */
export interface RemoteQueueRow {
  cardId:    string;
  version:   string;
  set:       string;
  number:    string;
  lang:      string;
  source:    string;
  faces:     FaceTarget[];
  imageInfo: ImageInfo;
  /** Printed images this row may store; `image_info` is rebuilt to this length on write. */
  faceCount: 1 | 2;
}

/** Rows or faces the remote source could not supply, counted while the queue is built. */
export interface RemoteSkipped {
  placeholder: number;
  missingId:   number;
  missingUrl:  number;
}

export function emptyRemoteSkipped(): RemoteSkipped {
  return { placeholder: 0, missingId: 0, missingUrl: 0 };
}

/** Preferred download url of one scryfall face uri map (full-resolution png, then large). */
export function scryfallFaceUrl(uris: Record<string, string> | null | undefined): string | null {
  return uris?.['png'] ?? uris?.['large'] ?? null;
}

/** Preferred gatherer-static url of one url map (full-resolution png, then webp). */
export function gathererFaceUrl(urls: Record<string, string> | null | undefined): string | null {
  return urls?.['default'] ?? urls?.['medium'] ?? null;
}

/**
 * Whether a row's images come one per face (front/back layouts, or a row pinned
 * to one face of such a card) instead of one shared image for the whole card.
 */
function perFaceImages(row: { layout: string, scryfallFace: string | null }): boolean {
  return isTwoImageLayout(row.layout) || faceIndexOf(row.scryfallFace) != null;
}

/**
 * Expected number of printed images of one row as a SQL expression, for
 * `importablePrintCondition`. A card only carries a second image when its layout
 * prints one (see `isTwoImageLayout`) and its source actually has it: scryfall
 * puts per-face uris on front/back cards only, and gatherer serves the back
 * through `compositeCard`. Rows pinned to a single face always expect 1.
 */
export function remoteExpectedFaces(source: RemoteImageSource): SQL {
  const singleImage = and(isNull(Print.scryfallFace), notInArray(Print.layout, [...twoImageLayouts]))!;
  return source === 'scryfall'
    ? sql`case when ${singleImage} then 1
        when jsonb_array_length(coalesce(${ScryfallCard.cardFaces}, '[]'::jsonb)) > 1
          and ${ScryfallCard.cardFaces}->0->'image_uris' is not null then 2
        else 1 end`
    : sql`case when ${singleImage} then 1
        when ${Gatherer.data}->'compositeCard'->'imageUrls'->>'default' is not null
          or ${Gatherer.data}->'compositeCard'->'imageUrls'->>'medium' is not null then 2
        else 1 end`;
}

interface QueueRowColumns {
  cardId:       string;
  version:      string;
  set:          string;
  number:       string;
  lang:         string;
  source:       string;
  layout:       string;
  scryfallFace: string | null;
  imageInfo:    ImageInfo | null;
}

/**
 * Turns the face urls of one row into a queue entry. Faces beyond the layout's
 * printed images and faces pinned out by the row's scryfall face are dropped;
 * faces without a url count as `missingUrl`.
 */
function queueRow(row: QueueRowColumns, urls: Array<string | null>, skipped: RemoteSkipped): RemoteQueueRow | null {
  const pinned = faceIndexOf(row.scryfallFace);
  const faceCount: 1 | 2 = perFaceImages(row) ? 2 : 1;
  const faces: FaceTarget[] = [];
  for (let i = 0; i < Math.min(urls.length, faceCount); i++) {
    if (pinned != null && i !== pinned) continue;
    const url = urls[i];
    if (url == null) {
      skipped.missingUrl += 1;
      continue;
    }
    faces.push({ faceIndex: i, url });
  }
  if (faces.length === 0) return null;
  return {
    cardId:    row.cardId,
    version:   row.version,
    set:       row.set,
    number:    row.number,
    lang:      row.lang,
    source:    row.source,
    faces,
    faceCount,
    imageInfo: row.imageInfo ?? [],
  };
}

/** Selected columns of one scryfall-side print row. */
export interface ScryfallImageRow extends QueueRowColumns {
  scryfallImageStatus: string | null;
  scryfallImageUris:   Record<string, string> | null;
  scryfallCardFaces:   unknown;
}

/** Gatherer cache payload of one print row. */
export interface GathererImageData {
  imageUrls?:     Record<string, string> | null;
  compositeCard?: { imageUrls?: Record<string, string> | null } | null;
}

/** Selected columns of one gatherer-side print row. */
export interface GathererImageRow extends QueueRowColumns {
  multiverseId: number[] | null;
  gathererData: GathererImageData | null;
}

/**
 * Scryfall download urls of one row, one per printed image. Scryfall only gives
 * per-face uris when the faces have images of their own — adventure, split,
 * flip and prepare carry a single top-level uri map instead, so their card is
 * reached through it rather than through empty face entries.
 */
export function scryfallRowUrls(row: ScryfallUrlColumns): Array<string | null> {
  const rawFaces = (row.scryfallCardFaces ?? []) as Array<{ image_uris?: Record<string, string> | null }>;
  const perFace = rawFaces.map(face => scryfallFaceUrl(face.image_uris));
  return perFace.some(url => url != null) ? perFace : [scryfallFaceUrl(row.scryfallImageUris)];
}

/**
 * Gatherer download urls of one row, one per printed image. The cache row of
 * the front multiverse id is the only way to reach a back image, but it repeats
 * the front image for cards whose parts share one printed image (adventure,
 * split, flip, meld and even some single-faced cards), so its `compositeCard` is
 * read for front/back layouts only.
 */
export function gathererRowUrls(row: GathererUrlColumns): Array<string | null> {
  const front = gathererFaceUrl(row.gathererData?.imageUrls);
  return perFaceImages(row)
    ? [front, gathererFaceUrl(row.gathererData?.compositeCard?.imageUrls)]
    : [front];
}

/** Columns the scryfall url rule needs. */
interface ScryfallUrlColumns {
  layout:            string;
  scryfallFace:      string | null;
  scryfallImageUris: Record<string, string> | null;
  scryfallCardFaces: unknown;
}

/** Columns the gatherer url rule needs. */
interface GathererUrlColumns {
  layout:       string;
  scryfallFace: string | null;
  gathererData: GathererImageData | null;
}

/** Queues one scryfall print row; placeholder art is skipped and counted. */
export function scryfallQueueRow(row: ScryfallImageRow, skipped: RemoteSkipped): RemoteQueueRow | null {
  // Placeholder art (unprinted/digital-only cards) would import as generic card
  // backs; keep it out of the queue regardless of the force mode.
  if (row.scryfallImageStatus === 'placeholder') {
    skipped.placeholder += 1;
    return null;
  }
  return queueRow(row, scryfallRowUrls(row), skipped);
}

/** Queues one gatherer print row from its cache urls. */
export function gathererQueueRow(row: GathererImageRow, skipped: RemoteSkipped): RemoteQueueRow | null {
  if ((row.multiverseId ?? []).length === 0) {
    skipped.missingId += 1;
    return null;
  }
  return queueRow(row, gathererRowUrls(row), skipped);
}
