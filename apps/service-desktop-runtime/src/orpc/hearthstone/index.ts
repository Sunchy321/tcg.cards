import { task } from './task';
import { hsdataRouter } from '../hsdata';

export const hearthstoneRouter = {
  task,
  ...hsdataRouter,
};
