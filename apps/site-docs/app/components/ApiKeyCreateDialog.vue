<template>
  <UModal v-model:open="open">
    <template #body>
      <template v-if="!newKeyValue">
        <form class="flex flex-col gap-3" @submit.prevent="createKey">
          <UInput v-model="newKeyName" :placeholder="$t('settings.apiKeys.namePlaceholder')" />
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">{{ $t('settings.apiKeys.games') }}</p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="game in gameOptions"
              :key="game.id"
              :color="selectedGames.includes(game.id) ? 'primary' : 'neutral'"
              :variant="selectedGames.includes(game.id) ? 'solid' : 'subtle'"
              class="cursor-pointer"
              @click="toggleGame(game.id)"
            >
              {{ game.id }}
            </UBadge>
          </div>
          <UAlert v-if="keyError" color="error" variant="soft" :description="keyError" class="text-xs" />
        </form>
      </template>

      <template v-else>
        <p class="text-sm font-semibold text-highlighted">{{ $t('settings.apiKeys.newKeyTitle') }}</p>
        <p class="mt-1 text-xs text-muted">{{ $t('settings.apiKeys.newKeyHint') }}</p>
        <div class="mt-3 flex items-center gap-2">
          <code class="min-w-0 flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm text-highlighted">{{ newKeyValue }}</code>
          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="sm" @click="copyKey" />
        </div>
      </template>
    </template>

    <template #footer>
      <template v-if="!newKeyValue">
        <UButton color="neutral" variant="ghost" size="sm" @click="open = false">
          {{ $t('settings.apiKeys.cancel') }}
        </UButton>
        <UButton color="primary" size="sm" :loading="creatingKey" @click="createKey">
          {{ $t('settings.apiKeys.create') }}
        </UButton>
      </template>
      <template v-else>
        <UButton color="primary" size="sm" @click="close">
          {{ $t('settings.apiKeys.done') }}
        </UButton>
      </template>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { listGames } from '../../lib/registry-docs';

const emit = defineEmits<{
  created: [key: string];
}>();

const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const toast = useToast();

const gameOptions = listGames();

const newKeyName = ref('');
const selectedGames = ref<string[]>(gameOptions.map(game => game.id));
const newKeyValue = ref<string | null>(null);
const keyError = ref<string | null>(null);
const creatingKey = ref(false);

const toggleGame = (id: string) => {
  selectedGames.value = selectedGames.value.includes(id)
    ? selectedGames.value.filter(g => g !== id)
    : [...selectedGames.value, id];
};

const createKey = async () => {
  keyError.value = null;
  creatingKey.value = true;

  const permissions = selectedGames.value.length > 0 ? { allowedGames: selectedGames.value } : undefined;

  const res = await fetch('/api/api-key/create', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ name: newKeyName.value || undefined, permissions }),
  });

  const data = await res.json().catch(() => null);

  creatingKey.value = false;

  if (!res.ok) {
    keyError.value = data?.message ?? 'Failed to create key';
    return;
  }

  newKeyValue.value = data?.key ?? null;
  newKeyName.value = '';
  selectedGames.value = [];
  toast.add({ title: t('settings.apiKeys.created'), color: 'success' });
  if (newKeyValue.value) {
    emit('created', newKeyValue.value);
  }
};

const copyKey = async () => {
  if (!newKeyValue.value) return;
  await navigator.clipboard.writeText(newKeyValue.value);
  toast.add({ title: t('settings.apiKeys.copied'), color: 'success' });
};

const close = () => {
  newKeyValue.value = null;
  keyError.value = null;
  open.value = false;
};
</script>
