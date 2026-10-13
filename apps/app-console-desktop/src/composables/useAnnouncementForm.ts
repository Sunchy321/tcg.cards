import { inject, provide, type InjectionKey } from 'vue';

/** The page-owned announcement form shared into the announcement editor subtree. */
export interface AnnouncementFieldsForm {
  source:        string;
  date:          string;
  effectiveDate: string;
  name:          string;
  link:          { url: string, label?: string, [key: string]: unknown }[];
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
