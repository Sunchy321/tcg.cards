import { createTask } from './create-task';
import { hsdataRouter } from '../hsdata';

export const hearthstoneRouter = {
  createTask,
  ...hsdataRouter,
};
