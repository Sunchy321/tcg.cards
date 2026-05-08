<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div>
        <h1 class="desktop-section-title">
          设置
        </h1>
        <p class="mt-2 text-sm text-muted">
          在这里管理各游戏的配置与数据来源。
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <UCard>
          <template #header>
            <div class="font-medium">
              游戏
            </div>
          </template>

          <div class="space-y-2">
            <button
              v-for="game in games"
              :key="game.key"
              type="button"
              class="w-full rounded-lg border px-4 py-3 text-left transition"
              :class="game.key === selectedGame ? 'border-primary bg-primary/5' : 'border-default bg-default hover:bg-elevated'"
              @click="openGame(game.key)"
            >
              <div class="text-sm font-medium text-default">{{ game.label }}</div>
              <div class="mt-1 text-xs text-muted">{{ game.description }}</div>
            </button>
          </div>
        </UCard>

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <div class="font-medium">当前账号</div>
                <div class="mt-1 text-xs text-muted">查看当前登录账号。</div>
              </div>
            </template>

            <p class="text-sm text-default">
              {{ currentAuthState?.user.name ?? '—' }}
            </p>
          </UCard>

          <template v-if="selectedGame === 'hearthstone'">
            <UCard>
              <template #header>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div class="font-medium">{{ selectedGameItem.label }} 配置</div>
                    <div class="mt-1 text-xs text-muted">配置炉石数据源路径，供相关功能使用。</div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      label="查看数据源"
                      icon="i-lucide-database"
                      color="neutral"
                      variant="ghost"
                      to="/hearthstone/data-source"
                    />
                    <UButton
                      label="打开导入"
                      icon="i-lucide-download"
                      color="neutral"
                      variant="ghost"
                      to="/hearthstone/data-import"
                    />
                  </div>
                </div>
              </template>

              <div class="space-y-4">
                <div>
                  <div class="text-sm font-medium text-default">hsdata 数据源路径</div>
                  <div class="mt-1 text-xs text-muted">
                    通过目录选择框选择 hsdata 数据源目录。选择后会自动校验并保存。
                  </div>
                </div>

                <DirectoryPickerField
                  :value="hsdataRepoPathInput"
                  placeholder="/absolute/path/to/hsdata"
                  :loading="loadingHsdataRepoPath || pickingHsdataRepoPath"
                  :pick-loading="pickingHsdataRepoPath"
                  :pick-disabled="loadingHsdataRepoPath || savingHsdataRepoPath"
                  :clear-disabled="savingHsdataRepoPath || pickingHsdataRepoPath || hsdataRepoPathInput.trim().length === 0"
                  @pick="pickHsdataRepoPath"
                  @clear="clearHsdataRepoPath"
                />

                <UAlert
                  v-if="hsdataRepoPathError"
                  color="error"
                  variant="soft"
                  icon="i-lucide-circle-alert"
                  :description="hsdataRepoPathError"
                />

                <UAlert
                  v-else-if="savedHsdataRepoPath"
                  color="success"
                  variant="soft"
                  icon="i-lucide-circle-check-big"
                  :description="`当前已配置仓库：${savedHsdataRepoPath}`"
                />

                <UAlert
                  v-else
                  color="warning"
                  variant="soft"
                  icon="i-lucide-folder-search"
                  description="尚未配置 hsdata 数据源路径。"
                />
              </div>
            </UCard>
          </template>

          <template v-else>
            <UCard>
              <template #header>
                <div>
                  <div class="font-medium">{{ selectedGameItem.label }} 配置</div>
                  <div class="mt-1 text-xs text-muted">该游戏暂时没有可编辑配置。</div>
                </div>
              </template>

              <div class="text-sm text-muted">
                当前还没有可编辑配置项。
              </div>
            </UCard>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currentAuthState } from '../../auth';

import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import {
  getDesktopGameRepo,
  pickDesktopDirectory,
  setDesktopGameRepo,
  type DesktopSettingsGame,
} from '~/composables/useDesktopSettings';

definePageMeta({
  layout: 'admin',
  title:  '设置',
});

const route = useRoute();
const router = useRouter();

const games = [
  {
    key:         'hearthstone',
    label:       'Hearthstone',
    description: '炉石数据源与导入相关设置。',
  },
  {
    key:         'magic',
    label:       'Magic',
    description: '当前还没有可编辑配置项。',
  },
] satisfies Array<{
  key:         DesktopSettingsGame;
  label:       string;
  description: string;
}>;

const selectedGame = computed<DesktopSettingsGame>(() => {
  const game = route.query.game;
  return game === 'magic' ? 'magic' : 'hearthstone';
});

const hsdataRepoPathInput = ref('');
const savedHsdataRepoPath = ref<string | null>(null);
const loadingHsdataRepoPath = ref(false);
const pickingHsdataRepoPath = ref(false);
const savingHsdataRepoPath = ref(false);
const hsdataRepoPathError = ref('');

const selectedGameItem = computed(() => {
  return games.find(game => game.key === selectedGame.value) ?? games[0]!;
});

function openGame(game: DesktopSettingsGame) {
  void router.replace({
    query: {
      ...route.query,
      game,
    },
  });
}

async function loadHearthstoneSettings() {
  loadingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const repoPath = await getDesktopGameRepo('hearthstone', 'hsdata');
    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
  } catch (error) {
    console.error('Failed to load desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loadingHsdataRepoPath.value = false;
  }
}

async function saveHsdataRepoPath(nextPath?: string | null) {
  savingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const repoPathInput = (nextPath ?? hsdataRepoPathInput.value).trim();
    const repoPath = await setDesktopGameRepo(
      'hearthstone',
      'hsdata',
      repoPathInput.length > 0 ? repoPathInput : null,
    );

    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
  } catch (error) {
    console.error('Failed to save desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置保存失败');
    hsdataRepoPathInput.value = savedHsdataRepoPath.value ?? '';
  } finally {
    savingHsdataRepoPath.value = false;
  }
}

async function clearHsdataRepoPath() {
  await saveHsdataRepoPath('');
}

async function pickHsdataRepoPath() {
  pickingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const directoryInput = hsdataRepoPathInput.value.trim();
    const directory = await pickDesktopDirectory(directoryInput.length > 0 ? directoryInput : null);

    if (directory) {
      await saveHsdataRepoPath(directory);
    }
  } catch (error) {
    console.error('Failed to pick desktop Hearthstone repo path:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '目录选择失败');
  } finally {
    pickingHsdataRepoPath.value = false;
  }
}

onMounted(() => {
  void loadHearthstoneSettings();
});
</script>
