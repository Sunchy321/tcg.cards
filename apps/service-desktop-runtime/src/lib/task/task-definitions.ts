import { registerTaskDefinition } from './registry';

// Tasks defined using the legacy definition style (not yet migrated to the new task definition API)
import { imageRenderTaskDefinition } from '../hearthstone/task/image-render/definition';
registerTaskDefinition(imageRenderTaskDefinition);

import { hsdataImportTaskDefinition } from '../hearthstone/task/import/definition';
registerTaskDefinition(hsdataImportTaskDefinition);

import { pinTaskDefinition } from '../hearthstone/task/pin/definition';
registerTaskDefinition(pinTaskDefinition);

import { projectTaskDefinition } from '../hearthstone/task/project/definition';
registerTaskDefinition(projectTaskDefinition);

import { publishTaskDefinition } from '../hearthstone/task/publish/definition';
registerTaskDefinition(publishTaskDefinition);

import { unpackImportTaskDefinition } from '../hearthstone/task/unpack-import/definition';
registerTaskDefinition(unpackImportTaskDefinition);

import { announcementPublishTaskDefinition } from '../hearthstone/task/announcement-publish/definition';
registerTaskDefinition(announcementPublishTaskDefinition);

import { referencePublishTaskDefinition } from '../hearthstone/task/reference-publish/definition';
registerTaskDefinition(referencePublishTaskDefinition);

import { hearthstonePurgeTaskDefinition } from '../hearthstone/task/purge/definition';
registerTaskDefinition(hearthstonePurgeTaskDefinition);

import { cardsImportTaskDefinition } from '../shadowverse/task/cards-import/definition';
registerTaskDefinition(cardsImportTaskDefinition);

import { imageImportTaskDefinition } from '../shadowverse/task/image-import/definition';
registerTaskDefinition(imageImportTaskDefinition);

import { evolveCardsImportTaskDefinition } from '../shadowverse-evolve/task/cards-import/definition';
registerTaskDefinition(evolveCardsImportTaskDefinition);

import { evolveImagesImportTaskDefinition } from '../shadowverse-evolve/task/images-import/definition';
registerTaskDefinition(evolveImagesImportTaskDefinition);

import { testWorkTaskDefinition } from './test-definition';
registerTaskDefinition(testWorkTaskDefinition);
