import { registerTaskDefinition } from './registry';

// Legacy definitions
import { imageRenderTaskDefinition } from '../hearthstone/task/image-render/definition';
registerTaskDefinition(imageRenderTaskDefinition);

import { hsdataImportTaskDefinition } from '../hearthstone/task/import/definition';
registerTaskDefinition(hsdataImportTaskDefinition);

import { pinTaskDefinition } from '../hearthstone/task/pin/definition';
registerTaskDefinition(pinTaskDefinition);

import { projectTaskDefinition } from '../hearthstone/task/project/definition';
registerTaskDefinition(projectTaskDefinition);

import { hsdataProjectionTaskDefinition } from '../hearthstone/task/projection/definition';
registerTaskDefinition(hsdataProjectionTaskDefinition);

import { publishTaskDefinition } from '../hearthstone/task/publish/definition';
registerTaskDefinition(publishTaskDefinition);

import { unpackImportTaskDefinition } from '../hearthstone/task/unpack-import/definition';
registerTaskDefinition(unpackImportTaskDefinition);

import { testWorkTaskDefinition } from './test-definition';
registerTaskDefinition(testWorkTaskDefinition);
