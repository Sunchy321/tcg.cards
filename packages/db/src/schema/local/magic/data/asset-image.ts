import { doublePrecision, index, text } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';
import { assetImageColumns } from '../../asset-image';

import type { ImageStatus } from '#model/magic/schema/print';

/**
 * Magic's image asset ledger — the image fact of record for the prints'
 * local files, one row per canonical file under the card image root
 * (CONTEXT.md, asset images). The file key is derived from the print
 * coordinates through the shared print-image key utilities, which are the
 * single authority on the path convention.
 *
 * The projection fills `image_status` / `image_info` on the print rows from
 * this ledger, so a fact-table rebuild cannot lose image facts; the
 * upload-group protection reads `source` here, so a cleared fact row cannot
 * lift the never-overwrite guarantee off a curated image.
 *
 * `status` / `qualityScore` are magic's extension columns: quality
 * assessment belongs to magic's own import pipeline, and the other games
 * have no equivalent, so the two stay out of the shared column factory.
 */
export const AssetImage = dataSchema.table('asset_images', {
  ...assetImageColumns,
  status:       text('status').$type<ImageStatus>().notNull(),
  qualityScore: doublePrecision('quality_score'),
}, table => [
  index('asset_images_sha256_idx').on(table.sha256),
]);
