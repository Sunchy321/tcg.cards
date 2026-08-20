import type { MonitorSourceConfig } from './types';

export const SOURCES: Record<string, MonitorSourceConfig> = {
  'magic/rule': {
    id:            'magic/rule',
    name:          'Magic: The Gathering Rules',
    type:          'url',
    url:           'https://magic.wizards.com/en/rules',
    checkInterval: 24 * 60 * 60, // 24 hours (rules don't change often)
  },
};

export const ALERT_CONFIG = {
  // Minimum interval between failure alerts (24 hours)
  failureAlertInterval: 24 * 60 * 60 * 1000,
  // Email from address
  fromEmail:            'watcher@tcg.cards',
  fromName:             'Watcher',
};
