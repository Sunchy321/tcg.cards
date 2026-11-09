import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { runNameRubyImport } from '../../name-ruby-import';

/** Stable task type for importing MTGA name ruby readings into name_rubies. */
export const magicRubyImportTaskType = 'magic_ruby_import';

const input = z.object({
  /** Directory holding the MTGA `Manifest.mtga` / `Raw_CardDatabase.mtga`. */
  dir: z.string().min(1),
});

const output = z.object({
  cards:      z.number(),
  glossed:    z.number(),
  anchored:   z.number(),
  mismatched: z.number(),
  unanchored: z.number(),
  invalid:    z.number(),
});

const definition = createDefinition(magicRubyImportTaskType, {
  version:     '2026-09-21:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_ruby_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('importing', { label: '导入 MTGA 注音', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    return runWithDb(getLocalDb(), () => runNameRubyImport(getLocalDb(), ctx.dir));
  })
  .build();

export const magicRubyImportTaskDefinition = definition;
