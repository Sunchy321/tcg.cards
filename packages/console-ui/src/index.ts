import type { ConsolePlatform } from '@tcg-cards/console-platform';
export { default as YamlEditor } from './components/YamlEditor.vue';
export { default as MagicAnnouncementPage } from './pages/magic/MagicAnnouncementPage.vue';
export { default as HearthstoneAnnouncementPage } from './pages/hearthstone/HearthstoneAnnouncementPage.vue';
export { default as HearthstoneSetPage } from './pages/hearthstone/HearthstoneSetPage.vue';
export { default as HearthstoneTagPage } from './pages/hearthstone/HearthstoneTagPage.vue';
export { default as HearthstoneDataSourcePage } from './pages/hearthstone/HearthstoneDataSourcePage.vue';

export interface ConsoleUiScope {
  name: 'console-ui';
}

export interface ConsoleUiContext {
  platform: ConsolePlatform;
}

export const consoleUiScope: ConsoleUiScope = {
  name: 'console-ui',
};
