import { announcementTrpc as magicAnnouncementTrpc } from './magic/announcement';
import { dataSourceTrpc as magicDataSourceTrpc } from './magic/data-source';
import { list, get, getNodes } from './magic/rule-light';

import { announcementTrpc as hearthstoneAnnouncementTrpc } from './hearthstone/announcement';
import { setTrpc } from './hearthstone/set';
import { tagTrpc } from './hearthstone/tag';

export const webRouter = {
  magic: {
    announcement: magicAnnouncementTrpc,
    dataSource:   magicDataSourceTrpc,
    rule:         {
      list,
      get,
      getNodes,
    },
  },
  hearthstone: {
    announcement: hearthstoneAnnouncementTrpc,
    set:          setTrpc,
    tag:          tagTrpc,
  },
};

export type WebRouter = typeof webRouter;
