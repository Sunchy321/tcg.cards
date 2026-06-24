import { publishRouter } from './publish';
import { reanchorRouter } from './reanchor';

export const task = {
  publish: publishRouter,
  reanchor: reanchorRouter,
};
