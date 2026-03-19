export const GAMES = [
  'magic',
  'hearthstone',
] as const;

export type Game = (typeof GAMES)[number];
