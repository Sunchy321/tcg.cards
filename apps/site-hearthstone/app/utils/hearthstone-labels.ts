import type { Locale } from '#model/hearthstone/schema/basic';

type LabelKind = 'type' | 'race' | 'spellSchool' | 'class' | 'relation';
type LabelMap = Partial<Record<Locale, Record<string, string>>>;

const typeLabels: LabelMap = {
  en: {
    hero: 'Hero',
    hero_power: 'Hero Power',
    location: 'Location',
    minion: 'Minion',
    spell: 'Spell',
    weapon: 'Weapon',
  },
  de: {
    hero: 'Held',
    hero_power: 'Heldenfähigkeit',
    location: 'Schauplatz',
    minion: 'Diener',
    spell: 'Zauber',
    weapon: 'Waffe',
  },
  es: {
    hero: 'Héroe',
    hero_power: 'Poder de héroe',
    location: 'Ubicación',
    minion: 'Esbirro',
    spell: 'Hechizo',
    weapon: 'Arma',
  },
  fr: {
    hero: 'Héros',
    hero_power: 'Pouvoir héroïque',
    location: 'Lieu',
    minion: 'Serviteur',
    spell: 'Sort',
    weapon: 'Arme',
  },
  it: {
    hero: 'Eroe',
    hero_power: 'Potere Eroe',
    location: 'Luogo',
    minion: 'Servitore',
    spell: 'Magia',
    weapon: 'Arma',
  },
  ja: {
    hero: 'ヒーロー',
    hero_power: 'ヒーローパワー',
    location: 'ロケーション',
    minion: 'ミニオン',
    spell: '呪文',
    weapon: '武器',
  },
  ko: {
    hero: '영웅',
    hero_power: '영웅 능력',
    location: '장소',
    minion: '하수인',
    spell: '주문',
    weapon: '무기',
  },
  mx: {
    hero: 'Héroe',
    hero_power: 'Poder de héroe',
    location: 'Lugar',
    minion: 'Esbirro',
    spell: 'Hechizo',
    weapon: 'Arma',
  },
  pl: {
    hero: 'Bohater',
    hero_power: 'Moc specjalna',
    location: 'Miejsce',
    minion: 'Stronnik',
    spell: 'Zaklęcie',
    weapon: 'Broń',
  },
  pt: {
    hero: 'Herói',
    hero_power: 'Poder Heroico',
    location: 'Local',
    minion: 'Lacaio',
    spell: 'Feitiço',
    weapon: 'Arma',
  },
  ru: {
    hero: 'Герой',
    hero_power: 'Сила героя',
    location: 'Локация',
    minion: 'Существо',
    spell: 'Заклинание',
    weapon: 'Оружие',
  },
  th: {
    hero: 'ฮีโร่',
    hero_power: 'พลังฮีโร่',
    location: 'สถานที่',
    minion: 'มินเนี่ยน',
    spell: 'เวทมนตร์',
    weapon: 'อาวุธ',
  },
  zhs: {
    hero: '英雄',
    hero_power: '英雄技能',
    location: '地标',
    minion: '随从',
    spell: '法术',
    weapon: '武器',
  },
  zht: {
    hero: '英雄',
    hero_power: '英雄能力',
    location: '地標',
    minion: '手下',
    spell: '法術',
    weapon: '武器',
  },
};

const raceLabels: LabelMap = {
  en: { beast: 'Beast', demon: 'Demon', dragon: 'Dragon', elemental: 'Elemental', mech: 'Mech', murloc: 'Murloc', naga: 'Naga', pirate: 'Pirate', undead: 'Undead' },
  it: { beast: 'Bestia', demon: 'Demone', dragon: 'Drago', elemental: 'Elementale', mech: 'Robot', murloc: 'Murloc', naga: 'Naga', pirate: 'Pirata', undead: 'Non Morto' },
  ja: { beast: '獣', demon: '悪魔', dragon: 'ドラゴン', elemental: 'エレメンタル', mech: 'メカ', murloc: 'マーロック', naga: 'ナーガ', pirate: '海賊', undead: 'アンデッド' },
  th: { beast: 'สัตว์ป่า', demon: 'ปีศาจ', dragon: 'มังกร', elemental: 'ธาตุ', mech: 'จักรกล', murloc: 'เมอร์ล็อค', naga: 'นากา', pirate: 'โจรสลัด', undead: 'อันเดด' },
  zhs: { beast: '野兽', demon: '恶魔', dragon: '龙', elemental: '元素', mech: '机械', murloc: '鱼人', naga: '纳迦', pirate: '海盗', undead: '亡灵' },
  zht: { beast: '野獸', demon: '惡魔', dragon: '龍', elemental: '元素', mech: '機械', murloc: '魚人', naga: '納迦', pirate: '海盜', undead: '不死族' },
};

const spellSchoolLabels: LabelMap = {
  en: { arcane: 'Arcane', fel: 'Fel', fire: 'Fire', frost: 'Frost', holy: 'Holy', nature: 'Nature', shadow: 'Shadow' },
  it: { arcane: 'Arcano', fel: 'Vil', fire: 'Fuoco', frost: 'Gelo', holy: 'Sacro', nature: 'Natura', shadow: 'Ombra' },
  ja: { arcane: '秘策', fel: 'フェル', fire: '火炎', frost: '凍気', holy: '聖なる', nature: '自然', shadow: '影' },
  th: { arcane: 'อาร์เคน', fel: 'เฟล', fire: 'ไฟ', frost: 'น้ำแข็ง', holy: 'ศักดิ์สิทธิ์', nature: 'ธรรมชาติ', shadow: 'เงา' },
  zhs: { arcane: '奥术', fel: '邪能', fire: '火焰', frost: '冰霜', holy: '神圣', nature: '自然', shadow: '暗影' },
  zht: { arcane: '秘法', fel: '魔化', fire: '火焰', frost: '冰霜', holy: '神聖', nature: '自然', shadow: '暗影' },
};

const classLabels: LabelMap = {
  en: { death_knight: 'Death Knight', demon_hunter: 'Demon Hunter', druid: 'Druid', hunter: 'Hunter', mage: 'Mage', neutral: 'Neutral', paladin: 'Paladin', priest: 'Priest', rogue: 'Rogue', shaman: 'Shaman', warlock: 'Warlock', warrior: 'Warrior' },
  it: { death_knight: 'Cavaliere della Morte', demon_hunter: 'Cacciatore di Demoni', druid: 'Druido', hunter: 'Cacciatore', mage: 'Mago', neutral: 'Neutrale', paladin: 'Paladino', priest: 'Sacerdote', rogue: 'Ladro', shaman: 'Sciamano', warlock: 'Stregone', warrior: 'Guerriero' },
  ja: { death_knight: 'デスナイト', demon_hunter: 'デーモンハンター', druid: 'ドルイド', hunter: 'ハンター', mage: 'メイジ', neutral: '中立', paladin: 'パラディン', priest: 'プリースト', rogue: 'ローグ', shaman: 'シャーマン', warlock: 'ウォーロック', warrior: 'ウォリアー' },
  th: { death_knight: 'เดธไนท์', demon_hunter: 'นักล่าปีศาจ', druid: 'ดรูอิด', hunter: 'ฮันเตอร์', mage: 'เมจ', neutral: 'กลาง', paladin: 'พาลาดิน', priest: 'พรีสต์', rogue: 'โร้ก', shaman: 'ชาแมน', warlock: 'วอร์ล็อค', warrior: 'วอร์ริเออร์' },
  zhs: { death_knight: '死亡骑士', demon_hunter: '恶魔猎手', druid: '德鲁伊', hunter: '猎人', mage: '法师', neutral: '中立', paladin: '圣骑士', priest: '牧师', rogue: '潜行者', shaman: '萨满祭司', warlock: '术士', warrior: '战士' },
  zht: { death_knight: '死亡騎士', demon_hunter: '惡魔獵人', druid: '德魯伊', hunter: '獵人', mage: '法師', neutral: '中立', paladin: '聖騎士', priest: '牧師', rogue: '盜賊', shaman: '薩滿', warlock: '術士', warrior: '戰士' },
};

const relationLabels: LabelMap = {
  en: { cataclysm: 'Cataclysms', collection_related: 'Upgrades and related forms', entourage: 'Tokens', fabled_related: 'Fabled related cards', herald_token: 'Herald tokens', hero_power: 'Hero Power', heroic_hero_power: 'Hero Power', plague_token: 'Plagues', titan_ability: 'Titan abilities', token: 'Token' },
  it: { cataclysm: 'Cataclismi', collection_related: 'Forme correlate', entourage: 'Pedine', herald_token: 'Pedine Proclama', hero_power: 'Potere Eroe', heroic_hero_power: 'Potere Eroe', plague_token: 'Piaghe', titan_ability: 'Abilità Titano', token: 'Pedina' },
  ja: { cataclysm: '大災変', collection_related: '強化と関連形態', entourage: 'トークン', herald_token: '伝令トークン', hero_power: 'ヒーローパワー', heroic_hero_power: 'ヒーローパワー', plague_token: '疫病', titan_ability: 'タイタン能力', token: 'トークン' },
  th: { cataclysm: 'มหันตภัย', collection_related: 'ร่างอัปเกรดและที่เกี่ยวข้อง', entourage: 'โทเคน', herald_token: 'โทเคนประกาศ', hero_power: 'พลังฮีโร่', heroic_hero_power: 'พลังฮีโร่', plague_token: 'โรคระบาด', titan_ability: 'ความสามารถไททัน', token: 'โทเคน' },
  zhs: { cataclysm: '灾变', collection_related: '升级与相关形态', entourage: '衍生物', fabled_related: '奇闻相关', herald_token: '兆示衍生物', hero_power: '英雄技能', heroic_hero_power: '英雄技能', plague_token: '疫病牌', titan_ability: '泰坦技能', token: '衍生物' },
  zht: { cataclysm: '浩劫', collection_related: '升級與相關型態', entourage: '衍生物', fabled_related: '奇聞相關', herald_token: '預兆衍生物', hero_power: '英雄能力', heroic_hero_power: '英雄能力', plague_token: '瘟疫牌', titan_ability: '泰坦能力', token: '衍生物' },
};

const labels: Record<LabelKind, LabelMap> = {
  class:       classLabels,
  race:        raceLabels,
  relation:    relationLabels,
  spellSchool: spellSchoolLabels,
  type:        typeLabels,
};

export function getHearthstoneLabel(kind: LabelKind, value: string, lang: Locale) {
  return labels[kind][lang]?.[value] ?? labels[kind].en?.[value] ?? value;
}
