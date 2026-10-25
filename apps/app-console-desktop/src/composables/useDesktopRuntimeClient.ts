/**
 * Compatibility helpers for the existing Hearthstone screens. Requests still
 * travel through the shared Console API client and Electron's private bridge.
 */
import { orpc } from '~/lib/orpc';
import type { CardImageRequirementExportInput, CardImageRequirementExportResult, ImagePremium, ImageRequirementRequest, ImageTemplate, ImageZone } from '#model/hearthstone/schema/data/image';
import type { Locale } from '#model/hearthstone/schema/basic';

export interface DesktopRendererHealthStatus {
  service:         string;
  version:         string;
  protocolVersion: string;
  requestShape:    string;
  outputFormat:    string;
  ready:           boolean;
  message?:        string | null;
}

export interface DesktopRendererHealthResult {
  configured: boolean;
  reachable:  boolean;
  status:     DesktopRendererHealthStatus | null;
  error?:     string | null;
}

export function useDesktopRuntimeClient() {
  return orpc;
}

export function exportDesktopHearthstoneImageRequirements(input: CardImageRequirementExportInput) {
  return orpc.image.exportRequirements(input) as Promise<CardImageRequirementExportResult>;
}

export function detectDesktopHearthstoneImageRenderer(rendererBaseUrl?: string | null) {
  return orpc.image.detectRenderer(rendererBaseUrl?.trim() ? { rendererBaseUrl } : undefined) as Promise<DesktopRendererHealthResult>;
}

export interface DesktopDebugRenderRequestInput {
  cardId?:     string;
  renderHash?: string;
  lang?:       Locale;
  zones?:      ImageZone[];
  templates?:  ImageTemplate[];
  premiums?:   ImagePremium[];
  version?:    number;
}

export interface DesktopDebugRenderRequestResult {
  cardId:       string;
  lang:         string;
  renderHash:   string;
  set:          string;
  type:         string;
  techLevel:    number | null;
  variantCount: number;
  requests:     ImageRequirementRequest[];
}

export function debugDesktopHearthstoneImageRenderRequest(input: DesktopDebugRenderRequestInput) {
  return orpc.image.debugRenderRequest(input) as Promise<DesktopDebugRenderRequestResult>;
}

export interface DesktopPreviewRenderInput {
  cardId?:     string;
  renderHash?: string;
  lang?:       Locale;
  zones?:      ImageZone[];
  templates?:  ImageTemplate[];
  premiums?:   ImagePremium[];
  version?:    number;
}

export interface DesktopPreviewVariant {
  zone:      ImageZone;
  template:  ImageTemplate;
  premium:   ImagePremium;
  base64Png: string;
  requestId: string;
}

export interface DesktopPreviewRenderResult {
  cardId:       string;
  renderHash:   string;
  set:          string;
  type:         string;
  techLevel:    number | null;
  variantCount: number;
  previews:     DesktopPreviewVariant[];
}

export function previewDesktopHearthstoneImage(input: DesktopPreviewRenderInput) {
  return orpc.image.previewRender(input) as Promise<DesktopPreviewRenderResult>;
}

export interface DesktopDownloadArchiveInput extends DesktopPreviewRenderInput {
  allVersions?: boolean;
  limit?:       number;
}

export interface DesktopDownloadArchiveSyncResult {
  fileName:  string;
  base64Zip: string;
}

export function downloadDesktopHearthstoneImageArchive(input: DesktopDownloadArchiveInput) {
  return orpc.image.downloadArchive(input) as Promise<DesktopDownloadArchiveSyncResult>;
}

export function triggerDownload(base64Zip: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64Zip), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function triggerJsonDownload(data: unknown, fileName: string) {
  const content = JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
