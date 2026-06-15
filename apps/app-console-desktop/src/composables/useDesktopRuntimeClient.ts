import { consumeEventIterator, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from 'service-desktop-runtime/orpc';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardImageRequirementExportInput, CardImageRequirementExportResult, ImagePremium, ImageRequirementRequest, ImageTemplate, ImageZone } from '#model/hearthstone/schema/data/image';

const defaultDesktopRuntimeRpcUrl = 'http://localhost:4318/rpc';

/** One rendered PNG file uploaded into the desktop runtime local-import RPC. */
export interface DesktopHearthstoneImageImportFile {
  fileName: string;
  bytesBase64: string;
}

/** Input payload accepted by the desktop runtime local image import RPC. */
export interface DesktopHearthstoneImageImportInput {
  requirementContent: string;
  requirementName: string;
  files: DesktopHearthstoneImageImportFile[];
  force?: boolean;
  dryRun?: boolean;
}

/** Rejected local image import file returned from the desktop runtime. */
export interface DesktopHearthstoneImageImportProblem {
  fileName: string;
  message: string;
}

/** Summary returned after the desktop runtime finishes one local image import. */
export interface DesktopHearthstoneImageImportSummary {
  requirementName: string;
  expectedCount: number;
  writtenCount: number;
  skippedCount: number;
  missingCount: number;
  rejectedCount: number;
  dryRun: boolean;
}

/** Complete local image import result returned from the desktop runtime. */
export interface DesktopHearthstoneImageImportResult {
  bucketDir: string;
  summary: DesktopHearthstoneImageImportSummary;
  problems: DesktopHearthstoneImageImportProblem[];
}

/** One in-memory Hearthstone image job snapshot returned by the desktop runtime. */
export interface DesktopHearthstoneImageJob {
  jobId: string;
  phase: string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  filters: {
    lang: Locale;
    version: number | null;
    cardId: string | null;
    zones: ImageZone[];
    templates: ImageTemplate[];
    premiums: ImagePremium[];
    limit: number;
    cursor: string | null;
    scanAll: boolean;
  };
  exportId: string | null;
  requestCount: number | null;
  totalCount: number | null;
  remainingEstimate: number | null;
  rendererJobId: string | null;
  requirementContent: string | null;
  requirementName: string | null;
  rendererStatus: string | null;
  completedCount: number | null;
  missingCount: number | null;
  rejectedCount: number | null;
  writtenCount: number | null;
  skippedCount: number | null;
  errorMessage: string | null;
  rejectedLogPath: string | null;
  overallTotalCount: number | null;
  overallCompletedCount: number | null;
  overallRejectedCount: number | null;
  currentBatchIndex: number | null;
  totalBatches: number | null;
  outputMode: string;
  downloadArchivePath: string | null;
}

/** Renderer health status fields returned from GET /status per the renderer protocol. */
export interface DesktopRendererHealthStatus {
  service: string;
  version: string;
  protocolVersion: string;
  requestShape: string;
  outputFormat: string;
  ready: boolean;
  message?: string | null;
}

/** Complete renderer health check result returned by the desktop runtime. */
export interface DesktopRendererHealthResult {
  configured: boolean;
  reachable: boolean;
  status: DesktopRendererHealthStatus | null;
  error?: string | null;
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

/** Imports one rendered PNG batch into the configured desktop local bucket directory. */
export function importDesktopHearthstoneImageFiles(input: DesktopHearthstoneImageImportInput) {
  return useDesktopRuntimeClient().image.importLocalFiles(input) as Promise<DesktopHearthstoneImageImportResult>;
}

/** Submits one desktop Hearthstone image job to the configured local renderer. */
export function submitDesktopHearthstoneImageJob(input: CardImageRequirementExportInput) {
  return useDesktopRuntimeClient().image.submitRenderJob(input) as Promise<{ job: DesktopHearthstoneImageJob }>;
}

export type DesktopReimportByRenderHashInput = {
  cardId?: string;
  renderHash?: string;
  lang?: Locale;
  zones?: ImageZone[];
  templates?: ImageTemplate[];
  premiums?: ImagePremium[];
};

/** Reimports card images for one renderHash: builds requests, renders, and force-imports. */
export function submitDesktopHearthstoneReimportByRenderHash(input: DesktopReimportByRenderHashInput) {
  return useDesktopRuntimeClient().image.reimportByRenderHash(input) as Promise<{ job: DesktopHearthstoneImageJob }>;
}

/** Reads the current in-memory desktop Hearthstone image job snapshot. */
export function getCurrentDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.getCurrentJob() as Promise<DesktopHearthstoneImageJob | null>;
}

/** Pauses the current running desktop Hearthstone image render job. */
export function pauseDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.pauseJob() as Promise<{ job: DesktopHearthstoneImageJob }>;
}

/** Stops the current running or paused desktop Hearthstone image render job. */
export function stopDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.stopJob() as Promise<{ job: DesktopHearthstoneImageJob }>;
}

/** Resumes a paused desktop Hearthstone image render job. */
export function resumeDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.resumeJob() as Promise<{ job: DesktopHearthstoneImageJob }>;
}

/** Refreshes the current desktop Hearthstone image job from the configured local renderer. */
export function refreshCurrentDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.refreshCurrentJob() as Promise<DesktopHearthstoneImageJob | null>;
}

/** Detects the configured Hearthstone image renderer and reports its health status. */
export function detectDesktopHearthstoneImageRenderer(rendererBaseUrl?: string | null) {
  return useDesktopRuntimeClient().image.detectRenderer(
    rendererBaseUrl != null && rendererBaseUrl.trim().length > 0 ? { rendererBaseUrl } : undefined,
  ) as Promise<DesktopRendererHealthResult>;
}

/** One progress event pushed by the watchImageJob stream. */
export interface DesktopImageJobProgressEvent {
  phase: string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  completedCount: number | null;
  totalCount: number | null;
  writtenCount: number | null;
  skippedCount: number | null;
  rejectedCount: number | null;
  errorMessage: string | null;
  rejectedLogPath: string | null;
  overallTotalCount: number | null;
  overallCompletedCount: number | null;
  overallRejectedCount: number | null;
  currentBatchIndex: number | null;
  totalBatches: number | null;
  downloadArchivePath: string | null;
}

/** Input payload for the debug render request RPC. */
export interface DesktopDebugRenderRequestInput {
  cardId?: string;
  renderHash?: string;
  lang?: Locale;
  zones?: ImageZone[];
  templates?: ImageTemplate[];
  premiums?: ImagePremium[];
}

/** Debug render request result returned by the desktop runtime. */
export interface DesktopDebugRenderRequestResult {
  cardId: string;
  lang: string;
  renderHash: string;
  set: string;
  type: string;
  techLevel: number | null;
  variantCount: number;
  requests: ImageRequirementRequest[];
}

/** Generates debug render request POST bodies for a given renderHash. */
export function debugDesktopHearthstoneImageRenderRequest(input: DesktopDebugRenderRequestInput) {
  return useDesktopRuntimeClient().image.debugRenderRequest(input) as Promise<DesktopDebugRenderRequestResult>;
}

/** Input for the preview render RPC. */
export interface DesktopPreviewRenderInput {
  cardId?: string;
  renderHash?: string;
  lang?: Locale;
  zones?: ImageZone[];
  templates?: ImageTemplate[];
  premiums?: ImagePremium[];
}

/** One preview variant returned by the preview render RPC. */
export interface DesktopPreviewVariant {
  zone: ImageZone;
  template: ImageTemplate;
  premium: ImagePremium;
  base64Png: string;
  requestId: string;
}

/** Result returned by the preview render RPC. */
export interface DesktopPreviewRenderResult {
  cardId: string;
  renderHash: string;
  set: string;
  type: string;
  techLevel: number | null;
  variantCount: number;
  previews: DesktopPreviewVariant[];
}

/** Renders one card for preview and returns base64 PNG data without writing to disk. */
export function previewDesktopHearthstoneImage(input: DesktopPreviewRenderInput) {
  return useDesktopRuntimeClient().image.previewRender(input) as Promise<DesktopPreviewRenderResult>;
}

/** Input for the download archive RPC. */
export interface DesktopDownloadArchiveInput {
  cardId?: string;
  renderHash?: string;
  lang?: Locale;
  zones?: ImageZone[];
  templates?: ImageTemplate[];
  premiums?: ImagePremium[];
  version?: number;
  limit?: number;
}

/** Synchronous download archive result (single-card mode). */
export interface DesktopDownloadArchiveSyncResult {
  fileName: string;
  base64Zip: string;
}

/** Renders card images and packages them into a ZIP archive for download. */
export function downloadDesktopHearthstoneImageArchive(input: DesktopDownloadArchiveInput) {
  return useDesktopRuntimeClient().image.downloadArchive(input) as Promise<
    DesktopDownloadArchiveSyncResult | { job: DesktopHearthstoneImageJob }
  >;
}

/** Fetches a previously generated ZIP archive as base64 for browser download. */
export function getDesktopHearthstoneImageArchive(filePath: string) {
  return useDesktopRuntimeClient().image.getArchive({ filePath }) as Promise<DesktopDownloadArchiveSyncResult>;
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

/** Opens a file or directory path in the OS-native file manager via the desktop runtime. */
export function openDesktopPath(filePath: string) {
  return useDesktopRuntimeClient().runtime.openPath({ path: filePath }) as Promise<{ ok: boolean }>;
}

/** Subscribes to the image job progress stream, calling handler on each event. Returns a cleanup function. */
export function watchDesktopImageJobProgress(
  handler: (event: DesktopImageJobProgressEvent) => void,
): () => void {
  return consumeEventIterator(
    useDesktopRuntimeClient().image.watchJobProgress(),
    { onEvent: handler },
  );
}
