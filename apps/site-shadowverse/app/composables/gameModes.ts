export type GameMode = 'beyond' | 'evolve';

export type GameModeMeta = {
  key: GameMode;
  name: string;
  title: string;
  subtitle: string;
  accent: string;
  icon: string;
};

export const gameModes: Record<GameMode, GameModeMeta> = {
  beyond: {
    key: 'beyond',
    name: 'Beyond',
    title: '影之诗：超凡世界',
    subtitle: 'Shadowverse: Worlds Beyond',
    accent: 'beyond',
    icon: 'lucide:sparkles',
  },
  evolve: {
    key: 'evolve',
    name: 'Evolve',
    title: '影之诗进化对决',
    subtitle: 'Shadowverse Evolve',
    accent: 'shadowverse',
    icon: 'lucide:layers-3',
  },
};

export const gameModeKeys = Object.keys(gameModes) as GameMode[];
