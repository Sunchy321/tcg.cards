import { registerGamePaths } from './game-paths';

registerGamePaths('magic', {
  data: [
    { name: 'scryfall', label: 'Scryfall' },
    { name: 'mtgch', label: 'MTGCH' },
    { name: 'mtgjson', label: 'MTGJSON' },
    { name: 'gatherer', label: 'Gatherer' },
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
