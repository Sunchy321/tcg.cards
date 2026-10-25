import { inject, provide, type InjectionKey } from 'vue';

/** One announcement link entry as the page's form holds it; game-specific extras ride the index signature. */
export interface AnnouncementFormLinkEntry {
  url:           string;
  label?:        string;
  /** Set while a game-specific streaming action (e.g. AI parse) works on this link. */
  _parsing?:     boolean;
  [key: string]: unknown;
}

/** The page-owned announcement form shared into the announcement editor subtree. */
export interface AnnouncementFieldsForm {
  source:        string;
  date:          string;
  effectiveDate: string;
  name:          string;
  link:          AnnouncementFormLinkEntry[];
}

const key: InjectionKey<AnnouncementFieldsForm> = Symbol('announcement-fields-form');

/** Shares the page-owned announcement form with the announcement field components below it. */
export function provideAnnouncementForm(form: AnnouncementFieldsForm): void {
  provide(key, form);
}

/** The announcement form the page owns; only valid inside an announcement editor subtree. */
export function injectAnnouncementForm(): AnnouncementFieldsForm {
  const form = inject(key);
  if (form == null) {
    throw new Error('Announcement form is not provided');
  }
  return form;
}
