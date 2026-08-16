import { announcementRouter } from './announcement';
import { createTask } from './create-task';
import { hsdataRouter } from '../hsdata';
import { setRouter } from './set';
import { unpackImportRouter } from './unpack-import';

export const hearthstoneRouter = {
  announcement: announcementRouter,
  createTask,
  set:          setRouter,
  ...hsdataRouter,
  unpack:       unpackImportRouter,
};
