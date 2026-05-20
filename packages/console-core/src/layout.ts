import { GAMES, type Game } from '@tcg-cards/shared';

export interface ConsoleNavItem {
  label: string;
  icon: string;
  to: string;
  exact?: boolean;
}

export interface ConsoleSelectItem {
  label: string;
  value: string;
}

export const GAME_LABELS: Record<Game, string> = {
  magic: 'Magic: The Gathering',
  hearthstone: 'Hearthstone',
};

export function resolveGameFromPath(path: string): Game | null {
  const segment = path.split('/').filter(Boolean)[0];

  if (!segment) {
    return null;
  }

  return (GAMES as readonly string[]).includes(segment)
    ? segment as Game
    : null;
}

export function getAccessibleGames(role: string | null | undefined): Game[] {
  if (!role) {
    return [];
  }

  if (role === 'owner') {
    return [...GAMES];
  }

  if (role.startsWith('admin/')) {
    const game = role.slice('admin/'.length);

    if ((GAMES as readonly string[]).includes(game)) {
      return [game as Game];
    }
  }

  return [];
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function getGameSelectItems(games: readonly Game[]): ConsoleSelectItem[] {
  return games.map(game => ({
    label: GAME_LABELS[game] ?? game,
    value: game,
  }));
}

export function getGameNavItems(game: Game): ConsoleNavItem[][] {
  const primary: ConsoleNavItem[] = [
    {
      label: '概览',
      icon: 'i-lucide-layout-dashboard',
      to: `/${game}`,
      exact: true,
    },
    {
      label: '数据源',
      icon: 'i-lucide-database',
      to: `/${game}/data-source`,
    },
    {
      label: '数据导入',
      icon: 'i-lucide-download',
      to: `/${game}/data-import`,
    },
    ...(game === 'hearthstone'
      ? [
        {
          label: '图片',
          icon: 'i-lucide-image',
          to: `/${game}/image`,
        },
        {
          label: '标签',
          icon: 'i-lucide-tags',
          to: `/${game}/tag`,
        },
      ]
      : []),
    {
      label: '卡牌',
      icon: 'i-lucide-layers',
      to: `/${game}/card`,
    },
    {
      label: '系列',
      icon: 'i-lucide-folder-open',
      to: `/${game}/set`,
    },
    {
      label: '赛制',
      icon: 'i-lucide-shield-check',
      to: `/${game}/format`,
    },
    {
      label: '公告',
      icon: 'i-lucide-megaphone',
      to: `/${game}/announcement`,
    },
    ...(game === 'magic'
      ? [
        {
          label: '规则',
          icon: 'i-lucide-book-open',
          to: `/${game}/rule`,
        },
      ]
      : []),
  ];

  const groups: ConsoleNavItem[][] = [primary];

  if (game === 'hearthstone') {
    groups.push([
      {
        label: '提交',
        icon: 'i-lucide-git-commit-horizontal',
        to: `/${game}/commit`,
      },
      {
        label: '冲突',
        icon: 'i-lucide-git-compare-arrows',
        to: `/${game}/conflict`,
      },
    ]);
  }

  return groups;
}

export function getUserNavItems(): ConsoleNavItem[][] {
  return [[
    {
      label: '用户',
      icon: 'i-lucide-users',
      to: '/user',
    },
  ]];
}
