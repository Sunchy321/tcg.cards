import { registerGamePaths } from './game-paths';

registerGamePaths('magic', {
  data: [
    { name: 'scryfall', label: 'Scryfall' },
    { name: 'mtgch', label: 'MTGCH' },
    { name: 'mtgjson', label: 'MTGJSON' },
    { name: 'gatherer', label: 'Gatherer' },
    { name: 'mtga', label: 'MTGA' },
    { name: 'mtg-vectors', label: 'MTG Vectors' },
    { name: 'magic-comp-rules-zh-cn', label: '完整规则中文译本' },
  ],
  image: [
    { name: 'card', label: '卡图' },
    { name: 'rule', label: '规则' },
    { name: 'set', label: '系列图' },
  ],
});

registerGamePaths('hearthstone', {
  data: [
    { name: 'hsdata', label: 'hsdata' },
  ],
  image: [
    { name: 'card', label: '卡图' },
  ],
});
