<script setup lang="ts">
/** One named result list of an import report. */
interface ResultGroup {
  label: string;
  items: string[];
}

const props = defineProps<{ groups: ResultGroup[] }>();

/** Lists at or below this size start expanded; longer ones start collapsed. */
const autoExpandLimit = 10;

/** Manual toggles win over the size rule; keyed by group label. */
const overrides = ref<Record<string, boolean>>({});

watch(() => props.groups, () => {
  overrides.value = {};
});

function isExpanded(group: ResultGroup): boolean {
  return overrides.value[group.label] ?? group.items.length <= autoExpandLimit;
}

function toggle(group: ResultGroup) {
  overrides.value = { ...overrides.value, [group.label]: !isExpanded(group) };
}
</script>

<template>
  <div v-if="groups.length > 0" class="rounded-xl border border-slate-200 bg-white p-4">
    <div v-for="group in groups" :key="group.label" class="py-1 text-sm">
      <button
        type="button"
        class="flex w-full items-center gap-1 text-left"
        @click="toggle(group)"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-muted transition-transform"
          :class="{ 'rotate-90': isExpanded(group) }"
        />
        <span class="font-medium">{{ group.label }}({{ group.items.length }}):</span>
      </button>
      <div v-if="isExpanded(group)" class="mt-1 space-y-0.5 pl-5">
        <p v-for="item in group.items" :key="item" class="break-all font-mono text-xs text-muted">
          {{ item }}
        </p>
      </div>
    </div>
  </div>
</template>
