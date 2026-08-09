/**
 * DEPRECATED — do not extend.
 *
 * The helper-function-per-endpoint pattern in this file (thin wrappers around
 * `useDesktopRuntimeClient().<router>.<procedure>` calls) is deprecated. Call the typed ORPC
 * client directly at the call site instead. Do not add new helper functions in this style; only
 * shrink the surface as existing callers migrate.
 */

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from 'service-desktop-runtime/orpc';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardImageRequirementExportInput, CardImageRequirementExportResult, ImagePremium, ImageRequirementRequest, ImageTemplate, ImageZone } from '#model/hearthstone/schema/data/image';

const defaultDesktopRuntimeRpcUrl = 'http://localhost:4318/rpc';

/** Renderer health status fields returned from GET /status per the renderer protocol. */
export interface DesktopRendererHealthStatus {
  service:         string;
  version:         string;
  protocolVersion: string;
  requestShape:    string;
  outputFormat:    string;
  ready:           boolean;
  message?:        string | null;
}

/** Complete renderer health check result returned by the desktop runtime. */
export interface DesktopRendererHealthResult {
  configured: boolean;
  reachable:  boolean;
  status:     DesktopRendererHealthStatus | null;
  error?:     string | null;
}

/** Resolves the desktop runtime RPC base URL from the current frontend environment. */
export function readDesktopRuntimeRpcUrl() {
  const value = import.meta.env.VITE_DESKTOP_RUNTIME_RPC_URL;
  return value && value.trim().length > 0 ? value : defaultDesktopRuntimeRpcUrl;
}

/** Creates one typed oRPC client bound to the local desktop runtime HTTP endpoint. */
export function createDesktopRuntimeClient(): RouterClient<Router> {
  const link = new RPCLink({
    url: readDesktopRuntimeRpcUrl(),
  });

  return createORPCClient(link);
}

/** Returns the shared desktop runtime client used by the current frontend instance. */
export function useDesktopRuntimeClient() {
  return useState('desktop-runtime-client', () => createDesktopRuntimeClient()).value;
}

/** Exports one Hearthstone image requirement batch through the desktop runtime. */
export function exportDesktopHearthstoneImageRequirements(input: CardImageRequirementExportInput) {
  return useDesktopRuntimeClient().image.exportRequirements(input) as Promise<CardImageRequirementExportResult>;
}

/** Detects the configured Hearthstone image renderer and reports its health status. */
export function detectDesktopHearthstoneImageRenderer(rendererBaseUrl?: string | null) {
  return useDesktopRuntimeClient().image.detectRenderer(
    rendererBaseUrl != null && rendererBaseUrl.trim().length > 0 ? { rendererBaseUrl } : undefined,
  ) as Promise<DesktopRendererHealthResult>;
}

/** Input payload for the debug render request RPC. */
export interface DesktopDebugRenderRequestInput {
  cardId?:     string;
  renderHash?: string;
  lang?:       Locale;
  zones?:      ImageZone[];
  templates?:  ImageTemplate[];
  premiums?:   ImagePremium[];
  version?:    number;
}

/** Debug render request result returned by the desktop runtime. */
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

/** Generates debug render request POST bodies for a given renderHash. */
export function debugDesktopHearthstoneImageRenderRequest(input: DesktopDebugRenderRequestInput) {
  return useDesktopRuntimeClient().image.debugRenderRequest(input) as Promise<DesktopDebugRenderRequestResult>;
}

/** Input for the preview render RPC. */
export interface DesktopPreviewRenderInput {
  cardId?:     string;
  renderHash?: string;
  lang?:       Locale;
  zones?:      ImageZone[];
  templates?:  ImageTemplate[];
  premiums?:   ImagePremium[];
  version?:    number;
}

/** One preview variant returned by the preview render RPC. */
export interface DesktopPreviewVariant {
  zone:      ImageZone;
  template:  ImageTemplate;
  premium:   ImagePremium;
  base64Png: string;
  requestId: string;
}

/** Result returned by the preview render RPC. */
export interface DesktopPreviewRenderResult {
  cardId:       string;
  renderHash:   string;
  set:          string;
  type:         string;
  techLevel:    number | null;
  variantCount: number;
  previews:     DesktopPreviewVariant[];
}

/** Renders one card for preview and returns base64 PNG data without writing to disk. */
export function previewDesktopHearthstoneImage(input: DesktopPreviewRenderInput) {
  return useDesktopRuntimeClient().image.previewRender(input) as Promise<DesktopPreviewRenderResult>;
}

/** Input for the download archive RPC. */
export interface DesktopDownloadArchiveInput {
  cardId?:     string;
  renderHash?: string;
  lang?:       Locale;
  zones?:      ImageZone[];
  templates?:  ImageTemplate[];
  premiums?:   ImagePremium[];
  version?:    number;
  limit?:      number;
}

/** Synchronous download archive result (single-card mode). */
export interface DesktopDownloadArchiveSyncResult {
  fileName:  string;
  base64Zip: string;
}

/** Renders card images and packages them into a ZIP archive for download. */
export function downloadDesktopHearthstoneImageArchive(input: DesktopDownloadArchiveInput) {
  return useDesktopRuntimeClient().image.downloadArchive(input) as Promise<DesktopDownloadArchiveSyncResult>;
}

/** Triggers a browser download from a base64-encoded ZIP. */
export function triggerDownload(base64Zip: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64Zip), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Downloads JSON data as a file in the browser via a temporary blob URL. */
export function triggerJsonDownload(data: unknown, fileName: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
