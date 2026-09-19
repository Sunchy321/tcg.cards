/** Wizards page that publishes the current Comprehensive Rules files. */
const rulesPageUrl = 'https://magic.wizards.com/en/rules';

/** Browser-like headers the Wizards site expects; plain fetches get rejected. */
const browserHeaders = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Download links for the current Comprehensive Rules, keyed by file format. */
export interface RuleLinks {
  docx?: string;
  pdf?:  string;
  txt?:  string;
}

/** Fetches the Wizards rules page and extracts its txt/docx/pdf download links. */
export async function fetchRuleLinks(): Promise<RuleLinks> {
  const response = await fetch(rulesPageUrl, { headers: browserHeaders, redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch rules page: HTTP ${response.status}`);
  }

  return extractLinks(await response.text());
}

/** Downloads one rules file and returns its bytes, or null when the server rejects it. */
export async function fetchRuleFile(url: string): Promise<ArrayBuffer | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': browserHeaders['User-Agent'] },
  });
  if (!response.ok) {
    return null;
  }

  return response.arrayBuffer();
}

/** Extracts txt/docx/pdf hrefs from the rules page HTML. */
export function extractLinks(html: string): RuleLinks {
  const links: RuleLinks = {};
  const hrefRegex = /href="([^"]+\.(docx|pdf|txt))"/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1]!;
    const ext = match[2]!.toLowerCase();
    const fullUrl = url.startsWith('http') ? url : `https://magic.wizards.com${url}`;

    if (ext === 'docx') links.docx = fullUrl;
    else if (ext === 'pdf') links.pdf = fullUrl;
    else if (ext === 'txt') links.txt = fullUrl;
  }

  return links;
}

/** Pulls the YYYYMMDD version date out of a rules file URL's filename. */
export function extractVersionDateFromFilename(url: string): string | null {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '');
    return filename.match(/(\d{8})/)?.[1] ?? null;
  } catch {
    return null;
  }
}
