import { oc } from '@orpc/contract';
import z from 'zod';

import { ruleIdentity, ruleMetadata, ruleVersion } from '@tcg-cards/model/magic/schema/rule-api';

const selection = z.strictObject({ ruleId: z.string().min(1) });

const list = oc
  .route({ method: 'GET', tags: ['Magic', 'Rule'], description: 'List published rulebooks.' })
  .output(ruleIdentity.array());

const versions = oc
  .route({ method: 'GET', tags: ['Magic', 'Rule'], description: 'List public releases and their available languages, newest first.' })
  .input(selection)
  .output(ruleVersion.array());

const meta = oc
  .route({
    method:      'GET',
    tags:        ['Magic', 'Rule'],
    description: 'Read published metadata. Omit versionTag for the latest release and language for the original language. Statistics are fields directly on meta and count saved node text only: Unicode code points excluding whitespace, one character per complete game symbol such as {W/U}, and no node numbering or formatting markers. English words are ASCII letter runs with optional internal apostrophes; game symbols are excluded. Entries include all saved nodes. CR chapters are top-level numbered headings; rules include subrules; examples and glossary terms are counted separately. Translation statistics exclude source fallback text. Missing statistics use an empty meta object; unknown classifications are null.',
  })
  .input(selection.extend({ versionTag: z.string().min(1).optional(), language: z.string().min(1).optional() }))
  .output(ruleMetadata);

export const ruleRouter = { list, versions, meta };
