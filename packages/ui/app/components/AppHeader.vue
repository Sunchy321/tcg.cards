<template>
  <UHeader
    class="bg-white/10 backdrop-blur-md border-b border-white/20"
    :title="title"
    :ui="{
      center: 'flex'
    }"
  >
    <template #title>
      <Icon
        name="i:logo"
        :size="32"
        class="text-white"
      />
      </template>

    <template v-if="route.meta.titleType === 'input'">
        <UInput
          v-model="searchInput"
          class="ml-3 flex-1"
          size="xl"
          :ui="{ base: 'font-semibold text-white bg-transparent border-white/60 focus:border-white w-full' }"
          @keydown.enter="commitSearch"
        />
    </template>
    <span v-else class="ml-3 font-semibold text-white text-lg flex-1">{{ title }}</span>

      <!-- <template
        v-for="p in params"
        :key="p.id"
      >
        <USelect
          v-if="p.type === 'select'"
          :model-value="p.value"
          :items="p.items"
          size="md"
          class="w-40"
          trailing-icon=""
          :ui="{ base: 'text-white bg-white/10 hover:bg-white/20 border-white/20 ring-white/20', content: 'min-w-fit' }"
          @update:model-value="p.onChange"
        />
        <UButton
          v-else-if="p.type === 'switch'"
          :icon="p.icon"
          :variant="p.value ? 'solid' : 'ghost'"
          size="md"
          class="rounded-full size-10 text-white hover:bg-white/20 border border-white/20 flex items-center justify-center"
          @click="p.onChange(!p.value)"
        />
      </template> -->

    <template #right>
      <div v-if="actionMeta.length > 0" class="flex gap-2">
        <UButton
          v-for="action in actionMeta"
          :key="action.id"
          :icon="action.icon"
          color="neutral"
          variant="ghost"
          @click="getHandler(action.id)()"
        />
      </div>

      <UColorModeButton />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const route = useRoute();
const title = useTitle();
const { getActions } = useActions();

const searchInput = useSearchInput();

const params = [] as any[];

const actionMeta = route.meta.actions ?? [];

const actions = getActions();

const getHandler = (id: string) => {
  const action = actions.value.find(a => a.id === id);
  return action?.handler ?? (() => {});
};

const commitSearch = () => {

};
</script>
