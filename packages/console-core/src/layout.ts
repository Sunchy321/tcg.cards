import { GAMES, type Game } from '@tcg-cards/base';

/** One leaf navigation item. */
export interface ConsoleNavItem {
  label: string;
  icon: string;
  to: string;
  exact?: boolean;
}

/** One navigation entry: either a leaf link or a collapsible group with children. */
export interface ConsoleNavLink {
  label: string;
  icon: string;
  to?: string;
  exact?: boolean;
  children?: ConsoleNavLink[];
}

export interface ConsoleSelectItem {
  label: string;
  value: string;
}

export const GAME_LABELS: Record<Game, string> = {
  magic: 'Magic: The Gathering',
  hearthstone: 'Hearthstone',
  yugioh: 'Yu-Gi-Oh!',
  shadowverse: 'Shadowverse',
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

/**
 * Game navigation: the overview link, then one collapsible group per category.
 * Groups carry a label so the hierarchy (game → category → item) is explicit.
 */
export function getGameNavItems(game: Game): ConsoleNavLink[] {
  const items: ConsoleNavLink[] = [
    {
      label: '概览',
      icon: 'i-lucide-layout-dashboard',
      to: `/${game}`,
      exact: true,
    },
  ];

  if (game === 'hearthstone') {
    items.push(
      {
        label: '数据管线',
        icon: 'i-lucide-workflow',
        children: [
          { label: '版本管理', icon: 'i-lucide-git-branch', to: `/${game}/version` },
          { label: '拆包导入', icon: 'i-lucide-package-open', to: `/${game}/unpack-import` },
          { label: 'hsdata导入', icon: 'i-lucide-download', to: `/${game}/hsdata-import` },
          { label: '数据投影', icon: 'i-lucide-box', to: `/${game}/projection` },
        ],
      },
      {
        label: '数据浏览',
        icon: 'i-lucide-database',
        children: [
          { label: '图片', icon: 'i-lucide-image', to: `/${game}/image` },
          { label: '标签', icon: 'i-lucide-tags', to: `/${game}/tag` },
          { label: '卡牌', icon: 'i-lucide-layers', to: `/${game}/card` },
          { label: '系列', icon: 'i-lucide-folder-open', to: `/${game}/set` },
          { label: '赛制', icon: 'i-lucide-shield-check', to: `/${game}/format` },
          { label: '公告', icon: 'i-lucide-megaphone', to: `/${game}/announcement` },
        ],
      },
      {
        label: '发布管线',
        icon: 'i-lucide-upload',
        children: [
          { label: '发布', icon: 'i-lucide-upload', to: `/${game}/publish` },
          { label: '推送', icon: 'i-lucide-cloud-upload', to: `/${game}/push` },
          { label: '提交', icon: 'i-lucide-git-commit-horizontal', to: `/${game}/commit` },
          { label: '冲突', icon: 'i-lucide-git-compare-arrows', to: `/${game}/conflict` },
        ],
      },
    );
  } else if (game === 'magic') {
    items.push(
      {
        label: '数据源导入',
        icon: 'i-lucide-download',
        children: [
          { label: 'Scryfall', icon: 'i-lucide-download', to: `/${game}/data-source/scryfall` },
          { label: 'Gatherer', icon: 'i-lucide-globe', to: `/${game}/data-source/gatherer` },
          { label: 'MTGJSON', icon: 'i-lucide-folder', to: `/${game}/data-source/mtgjson` },
          { label: 'MTGCH', icon: 'i-lucide-file-json', to: `/${game}/data-source/mtgch` },
        ],
      },
      {
        label: '数据浏览',
        icon: 'i-lucide-database',
        children: [
          { label: '卡牌', icon: 'i-lucide-layers', to: `/${game}/card` },
          { label: '系列', icon: 'i-lucide-folder-open', to: `/${game}/set` },
          { label: '赛制', icon: 'i-lucide-shield-check', to: `/${game}/format` },
          { label: '公告', icon: 'i-lucide-megaphone', to: `/${game}/announcement` },
          { label: '规则', icon: 'i-lucide-book-open', to: `/${game}/rule` },
        ],
      },
    );
  } else {
    items.push(
      {
        label: '数据浏览',
        icon: 'i-lucide-database',
        children: [
          { label: '卡牌', icon: 'i-lucide-layers', to: `/${game}/card` },
          { label: '系列', icon: 'i-lucide-folder-open', to: `/${game}/set` },
          { label: '赛制', icon: 'i-lucide-shield-check', to: `/${game}/format` },
          { label: '公告', icon: 'i-lucide-megaphone', to: `/${game}/announcement` },
        ],
      },
    );
  }

  return items;
}

export function getUserNavItems(): ConsoleNavLink[] {
  return [
    {
      label: '用户',
      icon: 'i-lucide-users',
      to: '/user',
    },
  ];
}

export function getDevNavItems(): ConsoleNavLink[] {
  return [
    {
      label: 'Task 测试',
      icon: 'i-lucide-flask-conical',
      to: '/test/task-card',
    },
  ];
}
