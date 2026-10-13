import { z } from 'zod';

import { resolvePath } from '../lib/game-paths';
import { downloadLatestRules } from '../lib/magic/rule/download';
import { listLocalRuleVersions } from '../lib/magic/rule/list';
import { os } from './index';

const localRuleVersion = z.strictObject({
  date:  z.string(),
  files: z.strictObject({
    txt: z.boolean(),
    doc: z.boolean(),
    pdf: z.boolean(),
  }),
});

const listLocal = os
  .input(z.void())
  .output(z.array(localRuleVersion))
  .handler(async () => {
    const ruleDir = resolvePath('magic.image.rule');
    return ruleDir != null ? listLocalRuleVersions(ruleDir) : [];
  });

const downloadLatest = os
  .input(z.void())
  .output(z.strictObject({
    version:    z.string(),
    downloaded: z.boolean(),
    files:      z.array(z.string()),
  }))
  .handler(async () => downloadLatestRules());

/** Local-only Comprehensive Rules procedures; remote rule procedures keep their own paths. */
export const magicRuleRouter = {
  listLocal,
  downloadLatest,
};
