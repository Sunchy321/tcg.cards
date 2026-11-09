import { getHeader } from 'h3';

import { setHearthstoneSearchDataset } from '../search/accelerated-adapter';
import type { HearthstoneSearchDataset } from '../search/accelerated-adapter';

/** Enables paired measurements only inside the explicitly configured local dev benchmark. */
export default defineNitroPlugin(nitroApp => {
  const value = process.env.BENCH_HEARTHSTONE_SEARCH_DATASET;
  if (process.env.NODE_ENV !== 'development' || value == null) {
    return;
  }
  const dataset = JSON.parse(value) as HearthstoneSearchDataset;
  // The benchmark starts its own local server and samples serially, so each request
  // can select the original or accelerated implementation of the same essential API.
  nitroApp.hooks.hook('request', event => {
    setHearthstoneSearchDataset(getHeader(event, 'x-search-benchmark-path') === 'original' ? null : dataset);
  });
});
