<template>
  <template v-if="!session.isPending">
    <UDropdownMenu
      v-if="session.data"
      :items="menuItems"
      :ui="{ content: 'min-w-fit' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        class="text-white hover:bg-white/20 hover:text-white p-1 rounded-full"
      >
        <UAvatar
          :alt="session.data.user.name ?? session.data.user.email"
          :src="session.data.user.image ?? undefined"
          size="sm"
        />
      </UButton>
    </UDropdownMenu>

    <UTooltip
      v-else
      :text="$t('settings.login')"
    >
      <UButton
        icon="lucide:user"
        color="neutral"
        variant="ghost"
        class="text-white hover:bg-white/20 hover:text-white"
        to="/settings"
      />
    </UTooltip>
  </template>
</template>

<script setup lang="ts">
const { t } = useI18n();

const session = authClient.useSession();

const menuItems = computed(() => [
  [
    {
      label: session.value.data?.user.name ?? session.value.data?.user.email ?? '',
      slot:  'user-label' as const,
    },
  ],
  [
    {
      label: t('settings.$self'),
      icon:  'lucide:settings',
      to:    '/settings',
    },
  ],
  [
    {
      label:    t('settings.logout'),
      icon:     'lucide:log-out',
      color:    'error' as const,
      onSelect: async () => {
        await authClient.signOut();
      },
    },
  ],
]);
</script>
