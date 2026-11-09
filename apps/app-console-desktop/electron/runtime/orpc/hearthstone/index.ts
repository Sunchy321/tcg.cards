import { announcementRouter } from './announcement';
import { hsdataRouter } from '../hsdata';
import { setRouter } from './set';
import { tagRouter } from './tag';
import { unpackImportRouter } from './unpack-import';

export const hearthstoneRouter = {
  announcement: announcementRouter,
  set:          setRouter,
  tag:          tagRouter,
  ...hsdataRouter,
  unpack:       unpackImportRouter,
};
