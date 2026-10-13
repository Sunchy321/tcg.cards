import { inArray } from 'drizzle-orm';

import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { locale, type Locale } from '@tcg-cards/model/hearthstone/schema/basic';

import { getLocalDb } from '../hsdata-local-db';
import {
  buildRenderSideInputs,
  prepareSingleSide,
  renderSingleSide,
  type RenderItemLike,
  type RenderSideInput,
} from './render';

export interface RenderAllStreamInput {
  items:       RenderItemLike[];
  version:     number;
  lastVersion?: number | null;
  langs:       Locale[];
  mode:        'missing' | 'all';
}

/**
 * Builds an SSE response that renders card images to storage and streams progress.
 * `mode: 'missing'` renders only images whose stored asset is absent; `'all'`
 * re-renders every side/lang image. Emits `{type:'total'}`, per-image
 * `{type:'progress', done, total}` and finally `{type:'end'}`.
 */
export function buildRenderAllStreamResponse(input: RenderAllStreamInput): Response {
  const langList = input.langs.length > 0 ? input.langs : [...locale.options];
  const inputs = buildRenderSideInputs(
    input.items,
    { version: input.version, lastVersion: input.lastVersion },
    langList,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch { /* client disconnected */ }
      };

      try {
        const toRender = input.mode === 'missing' ? await filterMissing(inputs) : inputs;

        send({ type: 'total', total: toRender.length });
        for (let i = 0; i < toRender.length; i++) {
          await renderSingleSide(toRender[i]);
          send({ type: 'progress', done: i + 1, total: toRender.length });
        }
        send({ type: 'end' });
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type':  'text/event-stream',
      'cache-control': 'no-cache',
      connection:      'keep-alive',
    },
  });
}

/** Keeps only render inputs whose image is not already stored. */
async function filterMissing(inputs: RenderSideInput[]): Promise<RenderSideInput[]> {
  const db = getLocalDb();

  const prepared: Array<{ input: RenderSideInput, hash: string }> = [];
  for (const input of inputs) {
    try {
      const side = await prepareSingleSide(input);
      if (side.request) prepared.push({ input, hash: side.request.card.renderHash });
    } catch { /* data not importable; not renderable regardless */ }
  }
  if (prepared.length === 0) return [];

  const hashes = [...new Set(prepared.map(p => p.hash))];
  const rows = await db.select({ hash: CardImageAsset.renderHash })
    .from(CardImageAsset)
    .where(inArray(CardImageAsset.renderHash, hashes));

  const existing = new Set(rows.map(row => row.hash));
  return prepared.filter(p => !existing.has(p.hash)).map(p => p.input);
}
