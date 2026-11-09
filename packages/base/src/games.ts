export const GAMES = [
  'magic',
  'hearthstone',
  'yugioh',
  'shadowverse',
] as const;

export type Game = (typeof GAMES)[number];
