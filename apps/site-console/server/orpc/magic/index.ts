import { magicTrpc as sharedMagic } from '@tcg-cards/console-api';
import { dataSourceTrpc } from './data-source';
import { ruleTrpc } from './rule';

export const magicTrpc = {
  ...sharedMagic,
  dataSource: dataSourceTrpc,
  rule:       ruleTrpc,
};
