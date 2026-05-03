import { createHsdataTrpc } from '@tcg-cards/console-api';
import { importHsdata } from '~~/server/lib/hearthstone/hsdata-import';
import { projectHsdata } from '~~/server/lib/hearthstone/hsdata-project';

export const hsdataTrpc = createHsdataTrpc({
  importHsdata,
  projectHsdata,
});
