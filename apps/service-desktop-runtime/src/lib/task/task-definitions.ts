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

import { testWorkTaskDefinition } from './test-definition';
registerTaskDefinition(testWorkTaskDefinition);
