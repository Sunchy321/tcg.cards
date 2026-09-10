import { sql, type SQL } from 'drizzle-orm';

import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
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
 * Expected face count of one row as a SQL expression, for `importablePrintCondition`.
 * Scryfall counts the card's faces; gatherer counts 2 when the cache row carries a
 * composite (back) face. Rows pinned to a single face always expect 1.
 */
export function remoteExpectedFaces(source: RemoteImageSource): SQL {
  return source === 'scryfall'
    ? sql`case when ${Print.scryfallFace} is null
        then greatest(jsonb_array_length(coalesce(${ScryfallCard.cardFaces}, '[]'::jsonb)), 1)
        else 1 end`
    : sql`case
        when ${Print.scryfallFace} is not null then 1
        when ${Gatherer.data}->'compositeCard'->'imageUrls' is not null then 2
        else 1 end`;
}

interface QueueRowColumns {
  cardId:       string;
  version:      string;
  set:          string;
  number:       string;
  lang:         string;
  source:       string;
  scryfallFace: string | null;
  imageInfo:    ImageInfo | null;
}

/**
 * Turns the per-face urls of one row into a queue entry. Faces pinned out by the
 * row's scryfall face are dropped; faces without a url count as `missingUrl`.
 */
function queueRow(row: QueueRowColumns, urls: Array<string | null>, skipped: RemoteSkipped): RemoteQueueRow | null {
  const pinned = faceIndexOf(row.scryfallFace);
  const faces: FaceTarget[] = [];
  for (let i = 0; i < urls.length; i++) {
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

/** Queues one scryfall print row; placeholder art is skipped and counted. */
export function scryfallQueueRow(row: ScryfallImageRow, skipped: RemoteSkipped): RemoteQueueRow | null {
  // Placeholder art (unprinted/digital-only cards) would import as generic card
  // backs; keep it out of the queue regardless of the force mode.
  if (row.scryfallImageStatus === 'placeholder') {
    skipped.placeholder += 1;
    return null;
  }
  const rawFaces = (row.scryfallCardFaces ?? []) as Array<{ image_uris?: Record<string, string> | null }>;
  // Multi-face cards carry the uris per face; single-face cards at the top level.
  const urls = rawFaces.length > 0
    ? rawFaces.map(face => scryfallFaceUrl(face.image_uris))
    : [scryfallFaceUrl(row.scryfallImageUris)];
  return queueRow(row, urls, skipped);
}

/**
 * Queues one gatherer print row. The urls come from the gatherer cache rather
 * than Image.ashx: the cache row of the front multiverse id carries the back
 * face's url in `compositeCard`, which is the only way to reach back images.
 */
export function gathererQueueRow(row: GathererImageRow, skipped: RemoteSkipped): RemoteQueueRow | null {
  if ((row.multiverseId ?? []).length === 0) {
    skipped.missingId += 1;
    return null;
  }
  const urls = [
    gathererFaceUrl(row.gathererData?.imageUrls),
    gathererFaceUrl(row.gathererData?.compositeCard?.imageUrls),
  ];
  return queueRow(row, urls, skipped);
}
