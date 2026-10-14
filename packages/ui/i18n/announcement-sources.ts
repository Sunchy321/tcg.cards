import type { AnnouncementSource } from '@tcg-cards/model/magic/schema/announcement';

export const announcementSourceLabels = {
  en: {
    wotc:                'Wizards',
    mtgcommander:        'Commander RC',
    canadian_highlander: 'Canadian Highlander',
    duelcommander:       'Duel Commander',
    leviathan_commander: 'Leviathan Commander',
    oathbreaker:         'Oathbreaker',
    pauper_commander:    'Pauper Commander',
    initial:             'Initial announcement',
    release:             'Set release',
    rotation:            'Rotation',
  },
  zhs: {
    wotc:                '威世智',
    mtgcommander:        '指挥官委员会',
    canadian_highlander: '加拿大高地人',
    duelcommander:       '法禁指挥官',
    leviathan_commander: '利维坦指挥官',
    oathbreaker:         '破誓人',
    pauper_commander:    '纯普指挥官',
    initial:             '初始数据',
    release:             '系列发行',
    rotation:            '环境轮替',
  },
} satisfies Record<'en' | 'zhs', Record<AnnouncementSource, string>>;
