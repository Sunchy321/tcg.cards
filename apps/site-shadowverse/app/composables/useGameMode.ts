import type { GameMode } from './gameModes';
import { gameModes } from './gameModes';

const STORAGE_KEY = 'shadowverse.gameMode';

const modeFromPath = (path: string): GameMode | null =>
  path.startsWith('/evolve') ? 'evolve'
  : path.startsWith('/beyond') ? 'beyond'
  : null;

export function useGameMode() {
  const route = useRoute();
  const mode = useState<GameMode>('gameMode', () => 'beyond');

  const current = computed(() => gameModes[mode.value]);

  const isBeyond = computed(() => mode.value === 'beyond');
  const isEvolve = computed(() => mode.value === 'evolve');

  const applyDataset = () => {
    if (import.meta.client) {
      document.documentElement.dataset.mode = mode.value;
    }
  };

  const persist = (next: GameMode) => {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const syncFromRoute = (applyLocalStorage = false) => {
    const prefix = modeFromPath(route.path);

    if (prefix) {
      mode.value = prefix;
      persist(prefix);
      applyDataset();
      return;
    }

    if (applyLocalStorage && import.meta.client) {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved === 'beyond' || saved === 'evolve') {
        mode.value = saved;
      }

      applyDataset();
    }
  };

  const setMode = (next: GameMode) => {
    const prefix = modeFromPath(route.path);

    if (prefix && prefix !== next) {
      const rest = route.path.slice(prefix.length + 1);
      const target = `/${next}${rest}`;

      void navigateTo({ path: target, query: route.query });
      return;
    }

    mode.value = next;
    persist(next);
    applyDataset();
  };

  watch(() => route.path, () => syncFromRoute(true));

  syncFromRoute();

  if (import.meta.client) {
    onMounted(() => syncFromRoute(true));
  }

  return { mode, current, isBeyond, isEvolve, setMode };
}
