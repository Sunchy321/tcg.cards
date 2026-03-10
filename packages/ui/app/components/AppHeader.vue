<template>
  <UHeader
    class="bg-white/10 backdrop-blur-md border-b border-white/20"
    :title="title"
    :ui="{
      left: 'lg:flex-none',
      center: 'flex flex-1',
      right: 'lg:flex-none'
    }"
  >
    <template #title>
      <Icon
        :name="appIcon"
        :size="32"
        class="text-white"
      />
      </template>

    <template v-if="titleType === 'input'">
        <UInput
          v-model="searchInput"
          class="ml-3 flex-1"
          size="xl"
          :ui="{ base: 'font-semibold text-white bg-transparent ring-white focus:ring-white w-full' }"
          @keydown.enter="commitSearch"
        />
    </template>
    <span v-else class="ml-3 font-semibold text-white text-lg flex-1">{{ title }}</span>

    <template #right>
      <div class="flex items-center gap-2">
        <template
          v-for="p in params"
          :key="p.id"
        >
          <USelect
            v-if="p.type === 'select'"
            :model-value="(paramValues[p.id] as string | null) ?? undefined"
            :items="paramItems[p.id]"
            size="md"
            class="w-40"
            trailing-icon=""
            :ui="{ base: 'text-white bg-white/10 hover:bg-white/20 border-white/20 ring-white/20', content: 'min-w-fit' }"
            @update:model-value="p.onChange"
          />
          <UButton
            v-else-if="p.type === 'switch'"
            :icon="p.icon"
            :color="(paramValues[p.id] as boolean) ? 'success' : 'neutral'"
            :variant="(paramValues[p.id] as boolean) ? 'solid' : 'ghost'"
            size="md"
            :class="(paramValues[p.id] as boolean) ? 'text-white hover:opacity-90' : 'text-white hover:bg-white/20'"
            @click="p.onChange(!(paramValues[p.id] as boolean))"
          />
        </template>

        <UButton
          v-for="action in actionMeta"
          :key="action.id"
          :icon="action.icon"
          color="neutral"
          variant="ghost"
          class="text-white hover:bg-white/20 hover:text-white"
          @click="getHandler(action.id)()"
        />

        <UColorModeButton class="text-white hover:bg-white/20 hover:text-white" />
      </div>
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const appConfig = useAppConfig();
const route = useRoute();
const title = useTitle();
const titleType = useTitleType();
const { getParams, paramItems, paramValues } = useParams();
const { getActions } = useActions();
const searchInput = useSearchInput();

const appIcon = appConfig.appIcon ?? 'i:logo';

const params = getParams();

const actionMeta = route.meta.actions ?? [];

const actions = getActions();

const getHandler = (id: string) => {
  const action = actions.value.find(a => a.id === id);
  return action?.handler ?? (() => {});
};

const commitSearch = () => {

};
</script>
