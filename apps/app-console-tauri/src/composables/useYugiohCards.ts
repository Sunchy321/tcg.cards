import { useDesktopRuntimeClient } from './useDesktopRuntimeClient';

import type { YugiohImportReport } from 'service-desktop-runtime/lib/yugioh/cards-import';
import type { YugiohJobSnapshot } from 'service-desktop-runtime/lib/yugioh/cards-progress';
import type { YugiohImageImportReport } from 'service-desktop-runtime/lib/yugioh/image-import';
import type { YugiohPublishReport } from 'service-desktop-runtime/lib/yugioh/cards-publish';

/** Fixed structured source metadata returned by the desktop runtime. */
export interface YugiohSourceInfo {
  source: string;
  url: string;
}

/** Current and recent local import state returned to the settings page. */
export interface YugiohImportState {
  latest: YugiohImportReport | null;
  batches: YugiohImportReport[];
}

/** Fixed primary-image source metadata returned by the desktop runtime. */
export interface YugiohImageSourceInfo {
  source: string;
  metadataUrl: string;
}

/** Current and recent primary-image import state returned to the settings page. */
export interface YugiohImageImportState {
  latest: YugiohImageImportReport | null;
  batches: YugiohImageImportReport[];
}

/** Current and recent test publication state returned to the settings page. */
export interface YugiohPublishState {
  incomplete: YugiohPublishReport | null;
  batches: YugiohPublishReport[];
}

/** Fixed Yu-Gi-Oh! card source metadata loaded from the local runtime. */
export function getYugiohSourceInfo() {
  return useDesktopRuntimeClient().yugioh.sourceInfo() as Promise<YugiohSourceInfo>;
}

/** Current Yu-Gi-Oh! desktop task snapshot loaded from the local runtime. */
export function getYugiohJob() {
  return useDesktopRuntimeClient().yugioh.getJob() as Promise<YugiohJobSnapshot | null>;
}

/** Recent Yu-Gi-Oh! local import state loaded from the local runtime. */
export function getYugiohImportState() {
  return useDesktopRuntimeClient().yugioh.getImportState() as Promise<YugiohImportState>;
}

/** Fixed cards.zip downloaded and imported by an explicit desktop action. */
export function importYugiohCards() {
  return useDesktopRuntimeClient().yugioh.importCards() as Promise<YugiohImportReport>;
}

/** Fixed primary-image metadata source loaded from the local runtime. */
export function getYugiohImageSourceInfo() {
  return useDesktopRuntimeClient().yugioh.imageSourceInfo() as Promise<YugiohImageSourceInfo>;
}

/** Recent Yu-Gi-Oh! primary-image import state loaded from the local runtime. */
export function getYugiohImageImportState() {
  return useDesktopRuntimeClient().yugioh.getImageImportState() as Promise<YugiohImageImportState>;
}

/** Primary images downloaded and imported by one explicit desktop action. */
export function importYugiohImages() {
  return useDesktopRuntimeClient().yugioh.importImages() as Promise<YugiohImageImportReport>;
}

/** Recent Yu-Gi-Oh! test publication state loaded from the local runtime. */
export function getYugiohPublishState() {
  return useDesktopRuntimeClient().yugioh.getPublishState() as Promise<YugiohPublishState>;
}

/** Local Yu-Gi-Oh! card facts explicitly published to the bound test target. */
export function publishYugiohCards() {
  return useDesktopRuntimeClient().yugioh.publishCards() as Promise<YugiohPublishReport>;
}
