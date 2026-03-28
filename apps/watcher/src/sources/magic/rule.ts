import type { CheckResult, Env, SourceChecker } from '../../types';
import { loadState, saveState, shouldSendFailureAlert, markFailureAlertSent } from '../../utils/state';
import { sendUpdateNotification, sendFailureNotification } from '../../notifications/email';
import { SOURCES } from '../../config';

/**
 * Magic: The Gathering Comprehensive Rules checker
 * Monitors changes to the official MTG rules document
 */
export class MagicRuleChecker implements SourceChecker {
  private config = SOURCES['magic/rule'];

  async check(env: Env): Promise<CheckResult> {
    const state = await loadState(env, this.config.id) ?? {};

    console.log(`[${this.config.name}] Checking...`);

    try {
      // Try to fetch rules page and extract version/date
      const response = await fetch(this.config.url, {
        headers: {
          'User-Agent': 'watcher/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Try to extract version/date from the page
      // This is a placeholder - actual implementation depends on the page structure
      const versionMatch = html.match(/(\d{4,})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
      const currentVersion = versionMatch?.[0] ?? new Date().toISOString().split('T')[0];

      console.log(`[${this.config.name}] Current version: ${currentVersion}`);

      const changed = state.lastValue !== undefined && state.lastValue !== currentVersion;

      if (changed) {
        console.log(`🎉 [${this.config.name}] Rules updated: ${state.lastValue} -> ${currentVersion}`);
        await sendUpdateNotification(
          env,
          this.config.name,
          state.lastValue,
          currentVersion,
          this.config.url,
        );
      } else if (!state.lastValue) {
        console.log(`[${this.config.name}] Initial check: ${currentVersion}`);
      } else {
        console.log(`[${this.config.name}] No changes`);
      }

      // Save state
      await saveState(env, this.config.id, {
        lastValue:   currentVersion,
        lastCheck:   new Date().toISOString(),
        lastSuccess: true,
        metadata:    {
          url: this.config.url,
        },
      });

      return {
        changed,
        currentValue:  currentVersion,
        previousValue: state.lastValue,
        message:       changed ? 'Rules updated' : 'No changes',
        url:           this.config.url,
      };
    } catch (error) {
      console.error(`[${this.config.name}] Check failed:`, error);

      // Save failure state
      await saveState(env, this.config.id, {
        ...state,
        lastCheck:   new Date().toISOString(),
        lastSuccess: false,
      });

      // Send failure alert (rate limited)
      const shouldAlert = await shouldSendFailureAlert(env, this.config.id);
      if (shouldAlert) {
        await sendFailureNotification(
          env,
          this.config.name,
          error instanceof Error ? error.message : String(error),
        );
        await markFailureAlertSent(env, this.config.id);
      }

      return {
        changed:       false,
        currentValue:  state.lastValue ?? 'unknown',
        previousValue: state.lastValue,
        message:       `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
