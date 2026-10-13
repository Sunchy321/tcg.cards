import { z } from 'zod';

import { createDefinition } from '#task/definition';
import { deriveEntityAmbits } from '../project/derive-ambits';

export const cardsProjectTaskType = 'hearthstone_cards_project';

const output = z.object({
  cards:      z.number(),
  staleCards: z.number(),
});

/**
 * Card projection: classifies every live card's ambit from its projected
 * entity content plus the relation graph and writes the per-card value to the
 * `cards` table (creating rows when absent). Ambit needs the completed
 * relation graph, so it runs after `hearthstone_project` — as its own task so
 * classification fixes reach already-projected data without re-projecting.
 */
export const cardsProjectTaskDefinition = createDefinition(cardsProjectTaskType, {
  version:     '2026-10-11:v1',
  effectModel: 'reconcilable',
})
  .scope(
    z.object({}),
    {
      type:    'hearthstone_cards_projection',
      resolve: () => ({ key: 'global', snapshot: {} }),
    },
  )
  .input(z.object({}))
  .output(output)
  .context({ init: () => ({}) })
  .stage('derive-ambit', { label: '派生收录范围', progressMode: 'simple' })
  .handler(async () => {
    const report = await deriveEntityAmbits();
    console.log(`[cards-projection] ambit derivation: ${report.cards} cards, ${report.staleCards} stale rows updated`);
    return report;
  })
  .build();
