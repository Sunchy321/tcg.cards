import { announcementTrpc as magicAnnouncementTrpc } from './magic/announcement';
import { dataSourceTrpc as magicDataSourceTrpc } from './magic/data-source';
import { list, get, getNodes } from './magic/rule-light';
import {
  changes,
  change,
  review,
  reviewBatch,
  nodeHistory,
  compareVersions,
  nodeContent,
} from './magic/rule-medium';
import {
  deleteVersion,
  syncLatest,
  loadFromData,
  uploadToR2,
  uploadArchive,
  rematch,
} from './magic/rule-heavy';

import { announcementTrpc as hearthstoneAnnouncementTrpc } from './hearthstone/announcement';
import { setTrpc } from './hearthstone/set';
import { tagTrpc } from './hearthstone/tag';
import { exportRequirements } from './hearthstone/image-medium';
import { importArchive } from './hearthstone/image-heavy';
import { hsdataTrpc } from './hearthstone/data-source/hsdata';

export const desktopRouter = {
  magic: {
    announcement: magicAnnouncementTrpc,
    dataSource:   magicDataSourceTrpc,
    rule:         {
      list,
      get,
      getNodes,
      changes,
      change,
      review,
      reviewBatch,
      nodeHistory,
      compareVersions,
      nodeContent,
      loadFromData,
      uploadToR2,
      uploadArchive,
      syncLatest,
      delete:  deleteVersion,
      rematch,
    },
  },
  hearthstone: {
    announcement: hearthstoneAnnouncementTrpc,
    set:          setTrpc,
    tag:          tagTrpc,
    image:        {
      exportRequirements,
      importArchive,
    },
    dataSource: {
      hsdata: hsdataTrpc,
    },
  },
};

export type DesktopRouter = typeof desktopRouter;
