import { consumeEventIterator, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from 'service-desktop-runtime/orpc';
import type { CardImageRequirementExportInput, CardImageRequirementExportResult } from '#model/hearthstone/schema/data/image';

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
    lang: string;
    version: number | null;
    cardId: string | null;
    zones: string[];
    templates: string[];
    premiums: string[];
    limit: number;
    cursor: string | null;
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

/** Reads the current in-memory desktop Hearthstone image job snapshot. */
export function getCurrentDesktopHearthstoneImageJob() {
  return useDesktopRuntimeClient().image.getCurrentJob() as Promise<DesktopHearthstoneImageJob | null>;
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
