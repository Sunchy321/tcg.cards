import { buildBanlistReport } from './report';

/** Returns the same JSON report for direct HTTP readers and file downloads. */
export async function buildBanlistReportResponse(download: boolean, build = () => buildBanlistReport()): Promise<Response> {
  try {
    const report = await build();
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (download) headers['content-disposition'] = `attachment; filename="magic-banlist-report-${report.finishedAt.replace(/[:.]/g, '-')}.json"`;
    return new Response(JSON.stringify(report, null, 2), { headers });
  } catch (error) {
    return Response.json({ error: 'The local evidence could not be read; no report was produced.', reason: error instanceof Error ? error.message : String(error) }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
