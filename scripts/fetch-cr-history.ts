#!/usr/bin/env bun

/**
 * Fetch historical Magic Comprehensive Rules page snapshots from web.archive.org
 * and extract the TXT file URLs from each snapshot.
 *
 * Resumable: saves progress to a JSON state file after each step.
 * Re-run the script to continue from where it left off.
 *
 * Usage: bun scripts/fetch-cr-history.ts
 */

import { existsSync, readFileSync } from 'node:fs';

const RULES_URL = 'https://magic.wizards.com/en/rules';
const CDX_API = 'https://web.archive.org/cdx/search/cdx';
const STATE_PATH = new URL('../output/cr-history-state.json', import.meta.url).pathname;

interface SnapshotRecord {
  timestamp:  string;
  status:     'pending' | 'done' | 'no_link' | 'error';
  txtUrls?:   string[];
  error?:     string;
}

interface State {
  cdxYearsCompleted: number[];
  snapshots:         SnapshotRecord[];
  uniqueTxtUrls:     { date: string; txtUrl: string }[];
}

function loadState(): State {
  if (existsSync(STATE_PATH)) {
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    return raw as State;
  }
  return { cdxYearsCompleted: [], snapshots: [], uniqueTxtUrls: [] };
}

async function saveState(state: State) {
  await Bun.write(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

async function fetchCdxForYear(year: number): Promise<SnapshotRecord[] | null> {
  const params = new URLSearchParams({
    url:       RULES_URL,
    output:    'json',
    fl:        'timestamp,original,statuscode',
    filter:    'statuscode:200',
    collapse:  'timestamp:8',
    matchType: 'exact',
    from:      `${year}0101`,
    to:        `${year}1231`,
  });

  const url = `${CDX_API}?${params}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.log(`HTTP ${response.status}, retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      const rows = await response.json() as string[][];
      return rows.slice(1).map(row => ({
        timestamp: row[0]!,
        status:    'pending' as const,
      }));
    } catch (err) {
      console.log(`${(err as Error).message}, retry ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  return null;
}

function waybackUrl(timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}/${RULES_URL}`;
}

function extractTxtUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /href="([^"]*\.txt[^"]*)"/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let cleaned = match[1]!;

    const waybackMatch = cleaned.match(/\/web\/\d+\/(https?:\/\/.+)/);
    if (waybackMatch) {
      cleaned = waybackMatch[1]!;
    }

    if (/comp|rule|MagicComp/i.test(cleaned)) {
      urls.push(cleaned);
    }
  }

  return [...new Set(urls)];
}

async function main() {
  const state = loadState();

  // Phase 1: Fetch CDX index year by year
  const startYear = 2014;
  const endYear = new Date().getFullYear();
  const existingTimestamps = new Set(state.snapshots.map(s => s.timestamp));

  for (let year = startYear; year <= endYear; year++) {
    if (state.cdxYearsCompleted.includes(year)) {
      console.log(`CDX ${year}... cached (${state.snapshots.filter(s => s.timestamp.startsWith(String(year))).length} snapshots)`);
      continue;
    }

    process.stdout.write(`CDX ${year}... `);
    const records = await fetchCdxForYear(year);

    if (records == null) {
      console.log('failed, will retry next run');
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    let added = 0;
    for (const r of records) {
      if (!existingTimestamps.has(r.timestamp)) {
        state.snapshots.push(r);
        existingTimestamps.add(r.timestamp);
        added++;
      }
    }

    state.cdxYearsCompleted.push(year);
    await saveState(state);
    console.log(`${records.length} snapshots (${added} new)`);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\nTotal snapshots: ${state.snapshots.length}\n`);

  // Phase 2: Fetch each pending snapshot page
  const seenTxtUrls = new Set(state.uniqueTxtUrls.map(u => u.txtUrl));
  let processed = state.snapshots.filter(s => s.status !== 'pending' && s.status !== 'error').length;

  for (const snapshot of state.snapshots) {
    if (snapshot.status !== 'pending' && snapshot.status !== 'error') continue;

    const date = snapshot.timestamp.slice(0, 8);
    process.stdout.write(`[${date}] (${++processed}/${state.snapshots.length}) Fetching... `);

    try {
      const response = await fetch(waybackUrl(snapshot.timestamp), {
        headers: { 'User-Agent': 'tcg-cards-history-scanner/1.0' },
        redirect: 'follow',
        signal:   AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        snapshot.status = 'error';
        snapshot.error = `HTTP ${response.status}`;
        console.log(snapshot.error);
        await saveState(state);
        continue;
      }

      const html = await response.text();
      const txtUrls = extractTxtUrls(html);

      if (txtUrls.length === 0) {
        snapshot.status = 'no_link';
        console.log('no TXT link');
        await saveState(state);
        continue;
      }

      snapshot.status = 'done';
      snapshot.txtUrls = txtUrls;

      for (const txtUrl of txtUrls) {
        if (!seenTxtUrls.has(txtUrl)) {
          seenTxtUrls.add(txtUrl);
          state.uniqueTxtUrls.push({ date, txtUrl });
          console.log(`NEW: ${txtUrl}`);
        } else {
          console.log(`same: ${txtUrl}`);
        }
      }

      await saveState(state);
    } catch (err) {
      snapshot.status = 'error';
      snapshot.error = (err as Error).message;
      console.log(`error: ${snapshot.error}`);
      await saveState(state);
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  const done = state.snapshots.filter(s => s.status === 'done').length;
  const noLink = state.snapshots.filter(s => s.status === 'no_link').length;
  const errors = state.snapshots.filter(s => s.status === 'error').length;
  const pending = state.snapshots.filter(s => s.status === 'pending').length;

  console.log(`\n=== Summary ===`);
  console.log(`Snapshots: ${done} done, ${noLink} no link, ${errors} error, ${pending} pending`);
  console.log(`\n=== Unique TXT URLs (${state.uniqueTxtUrls.length}) ===\n`);
  for (const r of state.uniqueTxtUrls) {
    console.log(`${r.date}  ${r.txtUrl}`);
  }

  console.log(`\nState saved to ${STATE_PATH}`);
}

main().catch(console.error);
