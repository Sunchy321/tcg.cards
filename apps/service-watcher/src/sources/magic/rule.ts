import type { CheckResult, Env, SourceChecker } from '../../types';
import { loadState, saveState, shouldSendFailureAlert, markFailureAlertSent } from '../../utils/state';
import { sendUpdateNotification, sendFailureNotification } from '../../notifications/email';
import { SOURCES } from '../../config';

interface RuleLinks {
  docx?: string;
  pdf?:  string;
  txt?:  string;
}

interface RuleState {
  lastValue?: string;
  links?:     RuleLinks;
}

/**
 * Magic: The Gathering Comprehensive Rules checker
 * Monitors changes to the official MTG rules document links (DOCX, PDF, TXT)
 */
export class MagicRuleChecker implements SourceChecker {
  private config = SOURCES['magic/rule'];

  async check(env: Env, options?: { dryRun?: boolean }): Promise<CheckResult> {
    const isDryRun = options?.dryRun ?? false;
    const stateKey = this.config.id;
    const fullState = await loadState(env, stateKey) ?? {};
    const ruleState: RuleState = {
      lastValue: fullState.lastValue,
      links:     fullState.metadata?.links as RuleLinks | undefined,
    };

    console.log(`[${this.config.name}] Checking... ${isDryRun ? '(DRY RUN)' : ''}`);
    console.log(`[${this.config.name}] Previous links:`, JSON.stringify(ruleState.links));

    try {
      console.log(`[${this.config.name}] Fetching ${this.config.url}...`);

      // Fetch the rules page with browser-like headers
      const response = await fetch(this.config.url, {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control':   'no-cache',
        },
        redirect: 'follow',
      });

      console.log(`[${this.config.name}] Response status: ${response.status}`);
      console.log(`[${this.config.name}] Response URL: ${response.url}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      console.log(`[${this.config.name}] HTML length: ${html.length}`);

      if (html.length === 0) {
        throw new Error('Empty response body');
      }

      // Extract DOCX, PDF, TXT links
      const currentLinks = this.extractLinks(html);
      console.log(`[${this.config.name}] Current links:`, JSON.stringify(currentLinks));

      // Check if any link changed
      const changed = this.hasLinksChanged(ruleState.links, currentLinks);

      // Create a version string from the URLs (extract date/version from filename if possible)
      const versionString = this.extractVersion(currentLinks) ?? JSON.stringify(currentLinks);

      if (changed && ruleState.links) {
        console.log(`🎉 [${this.config.name}] Rules updated!`);
        console.log(`  DOCX: ${ruleState.links.docx} -> ${currentLinks.docx}`);
        console.log(`  PDF:  ${ruleState.links.pdf} -> ${currentLinks.pdf}`);
        console.log(`  TXT:  ${ruleState.links.txt} -> ${currentLinks.txt}`);

        const changes = this.formatChanges(ruleState.links, currentLinks);

        if (!isDryRun) {
          // Send email first
          await sendUpdateNotification(
            env,
            this.config.name,
            ruleState.lastValue,
            versionString,
            `${this.config.url}\n\n更新内容:\n${changes}`,
          );

          // Only save state after email sent successfully
          await saveState(env, stateKey, {
            lastValue:   versionString,
            lastCheck:   new Date().toISOString(),
            lastSuccess: true,
            metadata:    {
              links: currentLinks,
              url:   this.config.url,
            },
          });

          console.log(`[${this.config.name}] State saved after email sent`);
        } else {
          console.log(`[DRY RUN] Email would be sent:`);
          console.log(`  Subject: [Watcher] ${this.config.name} 更新`);
          console.log(`  Changes: ${changes}`);
          console.log(`[DRY RUN] State would be saved:`, {
            lastValue: versionString,
            links:     currentLinks,
          });
        }
      } else if (!ruleState.links) {
        console.log(`[${this.config.name}] Initial check, current version: ${versionString}`);

        // Save initial state (no email needed)
        if (!isDryRun) {
          await saveState(env, stateKey, {
            lastValue:   versionString,
            lastCheck:   new Date().toISOString(),
            lastSuccess: true,
            metadata:    {
              links: currentLinks,
              url:   this.config.url,
            },
          });
        }
      } else {
        console.log(`[${this.config.name}] No changes detected`);
      }

      return {
        changed,
        currentValue:  versionString,
        previousValue: ruleState.lastValue,
        message:       changed ? 'Rules updated (DOCX/PDF/TXT links changed)' : 'No changes',
        url:           this.config.url,
      };
    } catch (error) {
      // Enhanced error logging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';

      console.error(`[${this.config.name}] Check failed:`);
      console.error(`  Message: ${errorMessage}`);
      console.error(`  Stack: ${errorStack}`);

      // Save failure state (only in non-dry-run mode)
      if (!isDryRun) {
        await saveState(env, stateKey, {
          ...fullState,
          lastCheck:   new Date().toISOString(),
          lastSuccess: false,
        });
      }

      // Send failure alert (rate limited, skip in dry run)
      if (!isDryRun) {
        const shouldAlert = await shouldSendFailureAlert(env, stateKey);
        if (shouldAlert) {
          await sendFailureNotification(
            env,
            this.config.name,
            error instanceof Error ? error.message : String(error),
          );
          await markFailureAlertSent(env, stateKey);
        }
      } else {
        console.log(`[DRY RUN] Failure alert would be sent: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        changed:       false,
        currentValue:  ruleState.lastValue ?? 'unknown',
        previousValue: ruleState.lastValue,
        message:       `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Extract DOCX, PDF, and TXT links from HTML
   */
  private extractLinks(html: string): RuleLinks {
    const links: RuleLinks = {};

    // Match href attributes containing .docx, .pdf, or .txt
    const hrefRegex = /href="([^"]+\.(docx|pdf|txt))"/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
      const url = match[1];
      const ext = match[2].toLowerCase();

      // Handle relative URLs
      const fullUrl = url.startsWith('http') ? url : `https://magic.wizards.com${url}`;

      if (ext === 'docx') links.docx = fullUrl;
      else if (ext === 'pdf') links.pdf = fullUrl;
      else if (ext === 'txt') links.txt = fullUrl;
    }

    return links;
  }

  /**
   * Check if any link has changed
   */
  private hasLinksChanged(oldLinks: RuleLinks | undefined, newLinks: RuleLinks): boolean {
    if (!oldLinks) return true;

    return (
      oldLinks.docx !== newLinks.docx
      || oldLinks.pdf !== newLinks.pdf
      || oldLinks.txt !== newLinks.txt
    );
  }

  /**
   * Extract version/date from filename in URL
   */
  private extractVersion(links: RuleLinks): string | null {
    // Try to extract date from any of the URLs
    // Typical format: .../20240202_MagicCompRules_20240202.txt
    for (const url of [links.docx, links.pdf, links.txt]) {
      if (!url) continue;

      // Extract date from filename (YYYYMMDD format)
      const dateMatch = url.match(/(\d{8})/);
      if (dateMatch) {
        const date = dateMatch[1];
        // Format as YYYY-MM-DD
        return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
      }
    }

    return null;
  }

  /**
   * Format changes for notification email
   */
  private formatChanges(oldLinks: RuleLinks, newLinks: RuleLinks): string {
    const changes: string[] = [];

    if (oldLinks.docx !== newLinks.docx) {
      changes.push(`DOCX: ${oldLinks.docx ?? 'none'} -> ${newLinks.docx ?? 'none'}`);
    }
    if (oldLinks.pdf !== newLinks.pdf) {
      changes.push(`PDF:  ${oldLinks.pdf ?? 'none'} -> ${newLinks.pdf ?? 'none'}`);
    }
    if (oldLinks.txt !== newLinks.txt) {
      changes.push(`TXT:  ${oldLinks.txt ?? 'none'} -> ${newLinks.txt ?? 'none'}`);
    }

    return changes.join('\n');
  }
}
