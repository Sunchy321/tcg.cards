import { GAMES, type Game } from '@tcg-cards/shared';

const gameMeta = {
  magic: {
    label: 'Magic',
    icon:  'i:magic-logo',
  },
  hearthstone: {
    label: 'Hearthstone',
    icon:  'i:hearthstone-logo',
  },
} satisfies Record<Game, {
  label: string;
  icon:  string;
}>;

export const settingsGameItems = GAMES.map(game => ({
  game,
  label: gameMeta[game].label,
  icon:  gameMeta[game].icon,
  to:    `/settings/games/${game}`,
}));
