import { ORPCError } from '@orpc/server';

import { readHearthstoneImageOverride } from '../../runtime-config';

/** Complete Hearthstone image settings required by local import workflows. */
export interface HearthstoneImageSettings {
  rendererBaseUrl: string | null;
  bucketDir: string | null;
}

/** Trims one optional image-setting field into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Reads the current runtime-injected Hearthstone image settings. */
export const getHearthstoneImageSettings = () => {
  const image = readHearthstoneImageOverride();

  return {
    rendererBaseUrl: trimToNull(image?.rendererBaseUrl),
    bucketDir:       trimToNull(image?.bucketDir),
  } satisfies HearthstoneImageSettings;
};

/** Resolves the configured local image bucket directory or raises one RPC error. */
export const requireHearthstoneImageBucketDir = () => {
  const image = getHearthstoneImageSettings();

  if (image.bucketDir != null) {
    return image.bucketDir;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Hearthstone image bucket directory is not configured',
  });
};

/** Resolves the configured local renderer base URL or raises one RPC error. */
export const requireHearthstoneImageRendererBaseUrl = () => {
  const image = getHearthstoneImageSettings();

  if (image.rendererBaseUrl != null) {
    return image.rendererBaseUrl;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Hearthstone image renderer base URL is not configured',
  });
};
