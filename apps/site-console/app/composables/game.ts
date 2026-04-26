import { GAMES } from '#shared';
import {
  GAME_LABELS,
  resolveGameFromPath,
  type Game,
} from '@tcg-cards/app-console';

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
