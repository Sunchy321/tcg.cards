import { createTask } from './create-task';
import { hsdataRouter } from '../hsdata';
import { setRouter } from './set';

export const hearthstoneRouter = {
  createTask,
  set: setRouter,
  ...hsdataRouter,
};
