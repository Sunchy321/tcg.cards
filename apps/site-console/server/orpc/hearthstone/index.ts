import { hearthstoneTrpc as sharedHearthstone } from '@tcg-cards/console-api';
import { dataSourceTrpc } from './data-source';
import { imageTrpc } from './image';

export const hearthstoneTrpc = {
  ...sharedHearthstone,
  dataSource: dataSourceTrpc,
  image:      imageTrpc,
};
