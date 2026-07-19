import { aiParse } from './ai-parse';
import { announcementCrudRouter } from './crud';
import { crawlLinks } from './crawl-links';
import { listPatches } from './patches';
import { downloadItemImages, getItemImages, getRenderRequests, previewImage, previewItem, renderItems } from './render';

export const announcementRouter = {
  ...announcementCrudRouter,
  aiParse,
  crawlLinks,
  getItemImages,
  getRenderRequests,
  patches: listPatches,
  previewImage,
  previewItem,
  downloadItemImages,
  renderItems,
};
