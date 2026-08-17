import type { GameMode } from './gameModes';
import shadowverseSets from '~/data/shadowverse-sets.json';

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterSection = {
  id: string;
  label: string;
  caption: string;
  kinds: string[];
  options: FilterOption[];
  wide?: boolean;
  dense?: boolean;
  numeric?: boolean;
  singleLine?: boolean;
};

export type CardKind = {
  label: string;
  value: string;
  icon: string;
};

export type PackEntry = {
  id: string;
  code: string;
  name: string;
  cardCount: number;
  releasedAt?: string | null;
};

export type CardCatalog = {
  id: GameMode;
  title: string;
  subtitle: string;
  searchTitle: string;
  packsTitle: string;
  cardKinds: CardKind[];
  sections: FilterSection[];
  showStats: boolean;
  packs: PackEntry[];
};

const beyondSections: FilterSection[] = [
  {
    id: 'class',
    label: '职业',
    caption: 'Class',
    kinds: ['all'],
    wide: true,
    singleLine: true,
    options: [
      { label: '精灵', value: 'elf' },
      { label: '皇家', value: 'royal' },
      { label: '巫师', value: 'witch' },
      { label: '龙族', value: 'dragon' },
      { label: '死灵', value: 'nightmare' },
      { label: '主教', value: 'bishop' },
      { label: '复仇者', value: 'nemesis' },
      { label: '中立', value: 'neutral' },
    ],
  },
  {
    id: 'rarity',
    label: '稀有度',
    caption: 'Rarity',
    kinds: ['all'],
    wide: true,
    dense: true,
    options: [
      { label: '铜', value: 'bronze' },
      { label: '银', value: 'silver' },
      { label: '金', value: 'gold' },
      { label: '传说', value: 'legend' },
    ],
  },
  {
    id: 'cost',
    label: '费用',
    caption: 'Cost',
    kinds: ['all'],
    numeric: true,
    options: Array.from({ length: 19 }, (_, index) => ({
      label: String(index),
      value: String(index),
    })),
  },
  {
    id: 'type',
    label: '卡牌类型',
    caption: 'Card Type',
    kinds: ['all'],
    wide: true,
    dense: true,
    options: [
      { label: '随从', value: 'follower' },
      { label: '法术', value: 'spell' },
      { label: '护符', value: 'amulet' },
    ],
  },
];

const evolveSections: FilterSection[] = [
  {
    id: 'craft',
    label: '职业',
    caption: 'Craft',
    kinds: ['all'],
    wide: true,
    singleLine: true,
    options: [
      { label: '精灵', value: 'Forest' },
      { label: '皇家', value: 'Sword' },
      { label: '巫师', value: 'Rune' },
      { label: '龙族', value: 'Dragon' },
      { label: '死灵', value: 'Nightmare' },
      { label: '主教', value: 'Haven' },
      { label: '中立', value: 'Neutral' },
    ],
  },
  {
    id: 'rare',
    label: '稀有度',
    caption: 'Rarity',
    kinds: ['all'],
    wide: true,
    dense: true,
    options: [
      { label: '铜', value: 'BR' },
      { label: '银', value: 'SL' },
      { label: '金', value: 'GR' },
      { label: '传说', value: 'LG' },
      { label: '特别稀有', value: 'SR' },
      { label: '究极', value: 'UR' },
      { label: '特别版', value: 'SP' },
      { label: '推广卡', value: 'PR' },
      { label: '超特别版', value: 'SSP' },
      { label: '平行版', value: 'BR_P' },
    ],
  },
  {
    id: 'cost',
    label: '费用',
    caption: 'Cost',
    kinds: ['all'],
    numeric: true,
    options: Array.from({ length: 11 }, (_, index) => ({
      label: String(index),
      value: String(index),
    })),
  },
  {
    id: 'type',
    label: '卡牌类型',
    caption: 'Card Type',
    kinds: ['all'],
    wide: true,
    dense: true,
    options: [
      { label: '随从', value: 'Follower' },
      { label: '法术', value: 'Spell' },
      { label: '护符', value: 'Amulet' },
      { label: '领袖', value: 'Leader' },
      { label: '随从（进化）', value: 'FollowerEvo' },
      { label: '其他', value: 'Other' },
    ],
  },
];

const cardKinds: CardKind[] = [
  { label: '全部卡', value: 'all', icon: 'lucide:sparkles' },
  { label: '随从', value: 'follower', icon: 'lucide:swords' },
  { label: '法术', value: 'spell', icon: 'lucide:wand-sparkles' },
  { label: '护符', value: 'amulet', icon: 'lucide:shield' },
];

const beyondPacks: PackEntry[] = [
  { id: 'beyond-10000', code: '10000', name: '基础卡牌', cardCount: 0 },
  { id: 'beyond-10001', code: '10001', name: '传说揭幕', cardCount: 0 },
  { id: 'beyond-10002', code: '10002', name: '无限进化', cardCount: 0 },
  { id: 'beyond-10003', code: '10003', name: '灾杰的继承者', cardCount: 0 },
  { id: 'beyond-10004', code: '10004', name: '苍穹六龙', cardCount: 0 },
  { id: 'beyond-10005', code: '10005', name: '花醉游戏', cardCount: 0 },
  { id: 'beyond-10006', code: '10006', name: '天启契约', cardCount: 0 },
  { id: 'beyond-10007', code: '10007', name: '弑神之安纳提玛', cardCount: 0 },
  { id: 'beyond-10008', code: '10008', name: '命运编年史', cardCount: 0 },
  { id: 'beyond-90000', code: '90000', name: '基础（通用）', cardCount: 0 },
];

export const cardCatalog: Record<GameMode, CardCatalog> = {
  beyond: {
    id: 'beyond',
    title: '影之诗：超凡世界',
    subtitle: 'Shadowverse: Worlds Beyond',
    searchTitle: '超凡世界卡牌检索',
    packsTitle: '超凡世界卡包列表',
    cardKinds,
    sections: beyondSections,
    showStats: false,
    packs: beyondPacks,
  },
  evolve: {
    id: 'evolve',
    title: '影之诗进化对决',
    subtitle: 'Shadowverse Evolve',
    searchTitle: '进化对决卡牌检索',
    packsTitle: '进化对决卡包列表',
    cardKinds,
    sections: evolveSections,
    showStats: true,
    packs: shadowverseSets.map(set => ({
      id: set.id,
      code: set.code,
      name: set.name,
      cardCount: set.cardCount,
    })),
  },
};
