import { aiParse } from './ai-parse';
import { announcementCrudRouter } from './crud';
import { crawlLinks } from './crawl-links';
import { listPatches } from './patches';
import { getItemImages, previewImage, renderItems } from './render';

export const announcementRouter = {
  ...announcementCrudRouter,
  aiParse,
  crawlLinks,
  getItemImages,
  patches: listPatches,
  previewImage,
  renderItems,
};
