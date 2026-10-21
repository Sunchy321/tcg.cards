import { oc } from '@orpc/contract';
import z from 'zod';

import { ruleContent, ruleIdentity, ruleMetadata, ruleVersion } from '@tcg-cards/model/magic/schema/rule-api';

const selection = z.strictObject({ ruleId: z.string().min(1) });
const contentSelection = selection.extend({ versionTag: z.string().min(1).optional(), language: z.string().min(1).optional() });

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
    description: 'Read published metadata. Omit versionTag for the latest release and language for the original language. Statistics are fields directly on meta and count saved node text only: Unicode code points excluding whitespace, one character per complete game symbol such as {W/U}, and no node numbering or formatting markers. English words are ASCII letter runs with optional internal apostrophes; game symbols are excluded. Entries include all saved nodes. CR chapters are top-level numbered headings; rules include subrules; examples and glossary terms are counted separately. Translation statistics exclude source fallback text. Missing statistics use an empty meta object; unknown classifications are null. Each file\u2019s sourceUrl and effectiveUrl describe the actual successful download origin, while officialUrl is the historical official release address of that format and may no longer resolve.',
  })
  .input(contentSelection)
  .output(ruleMetadata);

const text = oc
  .route({ method: 'GET', tags: ['Magic', 'Rule'], description: 'Read saved published text with rule numbering and a blank line between entries. Omit versionTag for the latest release and language for the original language. Missing translations do not fall back to source text. Returns UTF-8 plain text, independent of original download bytes.' })
  .input(contentSelection)
  .output(z.file().mime(['text/plain', 'text/plain; charset=utf-8']).meta({ contentMediaType: 'text/plain' }));

const content = oc
  .route({ method: 'GET', tags: ['Magic', 'Rule'], description: 'Read all saved entries for one published release and language. Omit versionTag for the latest release and language for the original language. Entries follow source tree order, with zero-based order, original level and siblingOrder. parentKey references the source parent nodeKey, including parents not translated. Missing translations are omitted without source-text fallback. Markers address UTF-16 offsets in rawText.' })
  .input(contentSelection)
  .output(ruleContent);

export const ruleRouter = { list, versions, meta, text, content };
