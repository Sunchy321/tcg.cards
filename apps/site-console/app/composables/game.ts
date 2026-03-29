import { GAMES } from '#shared';

export type Game = (typeof GAMES)[number];

export const GAME_LABELS: Record<Game, string> = {
  magic:       'Magic: The Gathering',
  hearthstone: 'Hearthstone',
};

export function useCurrentGame() {
  return useState<Game>('currentGame', () => GAMES[0]);
}
