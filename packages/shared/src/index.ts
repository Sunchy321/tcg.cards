export const GAMES = [
  'magic',
] as const;

export type Game = (typeof GAMES)[number];
