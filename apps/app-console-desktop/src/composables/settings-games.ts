import { GAMES, type Game } from '@tcg-cards/shared';

const gameLabels: Record<Game, string> = {
  magic:      'Magic',
  hearthstone: 'Hearthstone',
  yugioh:     'Yu-Gi-Oh!',
};

export const settingsGameItems = GAMES.map(game => ({
  game,
  label: gameLabels[game] ?? game,
  icon:  `i:${game}-logo`,
  to:    `/settings/games/${game}`,
}));
