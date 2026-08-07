export const GAMES = [
  'magic',
  'hearthstone',
  'yugioh',
] as const;

export type Game = (typeof GAMES)[number];
