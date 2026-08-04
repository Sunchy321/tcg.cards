import { aiParse } from './ai-parse';
import { cardMeta } from './card-meta';
import { announcementCrudRouter } from './crud';
import { crawlLinks } from './crawl-links';
import { listPatches } from './patches';
import { resolveCardNames } from './resolve-card-names';
import { searchCards } from './search-cards';
import { downloadItemImages, getItemImages, getRenderRequests, previewImage, previewItem, renderItems } from './render';

export const announcementRouter = {
  ...announcementCrudRouter,
  aiParse,
  cardMeta,
  crawlLinks,
  getItemImages,
  getRenderRequests,
  patches: listPatches,
  previewImage,
  previewItem,
  resolveCardNames,
  downloadItemImages,
  renderItems,
  searchCards,
};
