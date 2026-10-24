import { describe, expect, test } from 'bun:test';
import * as Vue from 'vue';
import { compileTemplate, parse } from 'vue/compiler-sfc';
import { renderToString } from 'vue/server-renderer';

const page = await Bun.file(new URL('../pages/magic/format/index.vue', import.meta.url)).text();
const template = parse(page).descriptor.template!.content;
const start = template.indexOf('<section v-if="reports[format.formatId]"');
// Non-null assertions only affect TypeScript checking, not the rendering behavior under test.
const section = template.slice(start, template.indexOf('</section>', start) + '</section>'.length).replace(/\]!/g, ']');
const compiled = compileTemplate({ source: section, filename: 'format-report.vue', id: 'format-report', compilerOptions: { mode: 'function' } });
const render = new Function('Vue', compiled.code)(Vue);
const script = parse(page).descriptor.scriptSetup!.content;
const componentSource = script.slice(script.indexOf('const DifferenceGroup = defineComponent'), script.indexOf('\nonMounted(loadFormats)'));
const componentCode = new Bun.Transpiler({ loader: 'ts' }).transformSync(componentSource);
const DifferenceGroup = new Function('defineComponent', 'h', 'groupLabel', 'kindLabel', `${componentCode}; return DifferenceGroup;`)(
  Vue.defineComponent, Vue.h, (group: string) => group === 'unfinity' ? '贴纸与景点相关牌' : group, (value: string) => value,
);

/** Renders the actual report markup with a previously stored comparison result. */
async function renderReport(extra: Record<string, unknown> = {}) {
  const report = {
    status:            'consistent', source:            { sourceName: 'Wizards', notices: [], fetchedAt: '2026-10-15' },
    officialOnly:      [], localOnly:         [], statusDifferences: [], pointsDifferences: [], unmatched:         [], manualReview:      [], ...extra,
  };
  const app = Vue.createSSRApp({
    render,
    setup: () => ({
      format:       { formatId: 'standard' }, reports:      { standard: report },
      statusLabel:  () => '一致', statusColor:  () => 'success', reportReason: () => '', formatTime:   (value: string) => value,
      groupLabel:   (value: string) => value,
    }),
  });
  for (const name of ['UBadge', 'UAlert', 'UIcon']) app.component(name, { render: () => null });
  app.component('DifferenceGroup', DifferenceGroup);
  return renderToString(app);
}

describe('format report rendering', () => {
  test('renders an existing report without newly added arrays', async () => {
    const html = await renderReport();
    expect(html).not.toContain('模糊匹配的牌');
    expect(html).not.toContain('按类别核对的牌');
    expect(html).toContain('官网 — 张 · 本地 — 张');
  });

  test('still renders new matching details and totals', async () => {
    const html = await renderReport({
      officialCount:      1, localCount:         1, groups:             [],
      approximateMatches: [{ cardId: 'proft', officialName: 'Typo', localName: 'Correct', method: 'fuzzy' }],
    });
    expect(html).toContain('官网 1 张 · 本地 1 张');
    expect(html).toContain('模糊匹配的牌');
    expect(html).toContain('Typo');
    expect(html).toContain('Correct');
  });
});

for (const kind of ['officialOnly', 'localOnly', 'statusDifferences', 'pointsDifferences']) {
  test(`collapses collective cards in ${kind} while retaining individual details and card totals`, async () => {
    const html = await renderReport({
      [kind]: [
        { cardId: 'a', name: 'First Card', group: 'unfinity', officialKind: 'banned', localStatus: 'restricted', officialPoints: 2, localPoints: 1 },
        { cardId: 'b', name: 'Second Card', group: 'unfinity', officialKind: 'banned', localStatus: 'restricted' },
        { cardId: 'c', name: 'Individual Card', group: null },
      ],
    });
    expect(html).toContain('（3）');
    expect(html).toContain('<details');
    expect(html).not.toMatch(/<details[^>]*\bopen/);
    expect(html).toContain('贴纸与景点相关牌（2 张）');
    expect(html).toContain('First Card');
    expect(html).toContain('Second Card');
    expect(html).toContain('Individual Card');
    if (kind === 'statusDifferences') expect(html).toContain('官网：banned · 本地：restricted');
    if (kind === 'pointsDifferences') expect(html).toContain('官网：2 · 本地：1');
  });
}

/** Executes the page's actual export handler with browser I/O replaced. */
function exportHandler(fetchReport: (input: URL, init?: RequestInit) => Promise<Response>, download: (data: unknown, filename: string) => void) {
  const source = script.slice(script.indexOf('async function exportReport()'), script.indexOf('/** Loads the local format list'));
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  const busy = { value: false };
  const error = { value: '' };
  const handler = new Function('exportingReport', 'exportError', 'readDesktopRuntimeRpcUrl', 'fetch', 'triggerJsonDownload', `${code}; return exportReport;`)(
    busy, error, () => 'http://localhost:4318/rpc', fetchReport, download,
  );
  return { handler, busy, error };
}

test('exports fresh HTTP results rather than reports already open in the page', async () => {
  const report = { reportVersion: 1, issues: [{ category: 'localOnly' }] };
  const requests: string[] = [];
  const downloads: unknown[] = [];
  const state = exportHandler(async input => {
    requests.push(String(input));
    return Response.json(report);
  }, (data, name) => { downloads.push({ data, name }); });
  await state.handler();
  expect(requests).toEqual(['http://localhost:4318/magic/banlist-report']);
  expect(downloads).toMatchObject([{ data: report }]);
  expect(state.busy.value).toBe(false);
  expect(state.error.value).toBe('');
});

test('reports failed exports and releases the busy state without downloading an error document', async () => {
  let downloaded = false;
  const state = exportHandler(async () => new Response('unavailable', { status: 500 }), () => {
    downloaded = true;
  });
  await state.handler();
  expect(downloaded).toBe(false);
  expect(state.busy.value).toBe(false);
  expect(state.error.value).toContain('请确认');
});
