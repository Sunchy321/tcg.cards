import { GAMES } from '#shared';

export type Game = (typeof GAMES)[number];

export const GAME_LABELS: Record<Game, string> = {
  magic:       'Magic: The Gathering',
  hearthstone: 'Hearthstone',
};

function resolveGameFromPath(path: string): Game | null {
  const segment = path.split('/').filter(Boolean)[0];

  if (!segment) {
    return null;
  }

  return (GAMES as readonly string[]).includes(segment)
    ? segment as Game
    : null;
}

export function useCurrentGame() {
  const route = useRoute();
  const currentGame = useState<Game>('currentGame', () => resolveGameFromPath(route.path) ?? GAMES[0]);

  watch(() => route.path, path => {
    const nextGame = resolveGameFromPath(path);

    if (nextGame && nextGame !== currentGame.value) {
      currentGame.value = nextGame;
    }
  }, { immediate: true });

  return currentGame;
}
