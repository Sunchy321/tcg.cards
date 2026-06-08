export type SampleCardLang = {
  name: string;
  image: string;
  typeLine: string;
  pendulumEffect: string;
  monsterEffect: string;
};

export type SampleCard = {
  id: number;
  cid: number;
  kind: 'monster';
  frameType: string;
  attribute: {
    zhs: string;
    en: string;
  };
  race: {
    zhs: string;
    en: string;
  };
  monsterTypes: {
    zhs: string[];
    en: string[];
  };
  level: number;
  attack: number;
  defense: number;
  pendulumScale: {
    left: number;
    right: number;
  };
  names: {
    zhs: string;
    en: string;
    ja: string;
  };
  lang: {
    zhs: SampleCardLang;
    en: SampleCardLang;
  };
  sources: {
    zhsData: string;
    enData: string;
    zhsImage: string;
    enImage: string;
    official: string;
  };
};

export const sampleCard: SampleCard = {
  id: 16178681,
  cid: 11213,
  kind: 'monster',
  frameType: 'effect_pendulum',
  attribute: {
    zhs: '暗',
    en: 'DARK',
  },
  race: {
    zhs: '龙',
    en: 'Dragon',
  },
  monsterTypes: {
    zhs: ['效果', '灵摆'],
    en: ['Pendulum', 'Effect'],
  },
  level: 7,
  attack: 2500,
  defense: 2000,
  pendulumScale: {
    left: 4,
    right: 4,
  },
  names: {
    zhs: '异色眼灵摆龙',
    en: 'Odd-Eyes Pendulum Dragon',
    ja: 'オッドアイズ・ペンデュラム・ドラゴン',
  },
  lang: {
    zhs: {
      name: '异色眼灵摆龙',
      image: '/sample-cards/odd-eyes-pendulum-dragon-zhs.webp',
      typeLine: '[怪兽|效果|灵摆] 龙/暗\n[★7] 2500/2000 4/4',
      pendulumEffect:
        '这个卡名的①②的灵摆效果1回合各能使用1次。\n①：可以把自己的灵摆怪兽的战斗发生的对自己的战斗伤害变成0。\n②：自己结束阶段才能发动。这张卡破坏，从卡组把1只攻击力1500以下的灵摆怪兽加入手卡。',
      monsterEffect: '①：这张卡用和对方怪兽的战斗给与对方的战斗伤害变成2倍。',
    },
    en: {
      name: 'Odd-Eyes Pendulum Dragon',
      image: '/sample-cards/odd-eyes-pendulum-dragon-en.jpg',
      typeLine: '[ Dragon / Pendulum / Effect ]',
      pendulumEffect:
        'You can reduce the battle damage you take from an attack involving a Pendulum Monster you control to 0. During your End Phase: You can destroy this card, and if you do, add 1 Pendulum Monster with 1500 or less ATK from your Deck to your hand. You can only use each Pendulum Effect of "Odd-Eyes Pendulum Dragon" once per turn.',
      monsterEffect:
        "If this card battles an opponent's monster, any battle damage this card inflicts to your opponent is doubled.",
    },
  },
  sources: {
    zhsData: 'https://ygocdb.com/api/v0/card/16178681?show=all',
    enData: 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=16178681',
    zhsImage: 'https://cdn.233.momobako.com/ygoimg/sc/16178681.webp',
    enImage: 'https://images.ygoprodeck.com/images/cards/16178681.jpg',
    official:
      'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=11213&request_locale=en',
  },
};
