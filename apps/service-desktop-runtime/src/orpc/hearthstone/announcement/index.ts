import { aiParse } from './ai-parse';
import { announcementCrudRouter } from './crud';
import { crawlLinks } from './crawl-links';
import { listPatches } from './patches';

export const announcementRouter = {
  ...announcementCrudRouter,
  aiParse,
  crawlLinks,
  patches: listPatches,
};
