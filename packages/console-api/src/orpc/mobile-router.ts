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

import { announcementTrpc as hearthstoneAnnouncementTrpc } from './hearthstone/announcement';
import { setTrpc } from './hearthstone/set';
import { tagTrpc } from './hearthstone/tag';
import { exportRequirements } from './hearthstone/image-medium';

export const mobileRouter = {
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
    },
  },
  hearthstone: {
    announcement: hearthstoneAnnouncementTrpc,
    set:          setTrpc,
    tag:          tagTrpc,
    image:        {
      exportRequirements,
    },
  },
};

export type MobileRouter = typeof mobileRouter;
