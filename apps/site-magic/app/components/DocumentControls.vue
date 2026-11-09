<template>
  <aside
    ref="container"
    class="fixed left-0 top-(--ui-header-height,4rem) z-45"
    :class="open ? 'w-80' : 'w-12'"
    :aria-label="$t('magic.document.reading_options')"
    @pointerenter="enter"
    @pointerleave="leave"
    @focusin="focusIn"
    @focusout="focusOut"
    @keydown.esc.prevent="close"
  >
    <button
      ref="trigger"
      type="button"
      class="flex size-12 items-center justify-center text-muted transition-opacity motion-reduce:transition-none"
      :class="{ 'pointer-events-none opacity-0': open }"
      :aria-label="$t('magic.document.reading_options')"
      :aria-expanded="open"
      aria-controls="document-reading-options"
      @click="toggle"
    >
      <UIcon name="lucide:settings-2" class="size-4" />
    </button>
    <div
      id="document-reading-options"
      class="absolute left-0 top-0 w-80 max-w-[100vw] space-y-4 rounded-r-xl bg-default/95 p-5 shadow-lg ring-1 ring-default transition-opacity motion-reduce:transition-none"
      :class="open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'"
      :inert="!open"
    >
      <div class="flex items-center justify-between text-sm">
        <span>{{ $t('magic.document.reading_options') }}</span>
        <button type="button" class="flex size-8 items-center justify-center text-muted" :aria-label="$t('magic.document.close_options')" @click="close">
          <UIcon name="lucide:chevron-left" class="size-4" />
        </button>
      </div>
      <label class="block space-y-1 text-xs text-muted">
        <span>{{ $t('magic.document.version') }}</span>
        <select class="w-full rounded-md border border-default bg-default px-2 py-2 text-sm text-default" :value="versionTag" @change="changeVersion">
          <option v-for="version in versions" :key="version.id" :value="version.versionTag">{{ version.versionTag }} · {{ version.effectiveDate }}</option>
        </select>
      </label>
      <div class="space-y-2">
        <p class="text-xs text-muted">{{ $t('magic.document.language') }}</p>
        <div class="flex gap-2" role="group" :aria-label="$t('magic.document.language')">
          <button
            v-for="language in ['zhs', 'en']"
            :key="language"
            type="button"
            class="rounded-md px-3 py-2 text-sm transition-colors"
            :class="locale === language ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-elevated hover:text-default'"
            :aria-pressed="locale === language"
            @click="emit('locale', language)"
          >{{ language === 'zhs' ? '中文' : 'English' }}</button>
        </div>
      </div>
      <NuxtLink v-if="compareTo" :to="compareTo" class="inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <UIcon name="lucide:file-diff" class="size-4" />
        {{ $t('magic.document.compare_versions') }}
      </NuxtLink>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { VersionSummary } from '#model/magic/schema/document-page';

defineProps<{ versions: VersionSummary[], versionTag: string, locale: string, compareTo?: { path: string, query: Record<string, string> } }>();
const emit = defineEmits<{ version: [value: string], locale: [value: string] }>();
// The square trigger begins at the header's lower-left corner, keeping the icon
// equally inset from the header bottom and viewport left on every screen size.
const container = useTemplateRef('container');
const trigger = useTemplateRef('trigger');
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Expand intentionally on hover while touch uses the persistent toggle. */
function enter(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    open.value = true;
  }, 80);
}

/** Keep the panel reachable while moving from its collapsed edge into the controls. */
function leave(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!container.value?.contains(document.activeElement)) {
      open.value = false;
    }
  }, 220);
}

/** Expose the panel when keyboard focus reaches its collapsed trigger. */
function focusIn(event: FocusEvent) {
  if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
    clearTimeout(timer);
    open.value = true;
  }
}

/** Collapse after keyboard focus leaves the entire panel. */
function focusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !container.value?.contains(event.relatedTarget)) open.value = false;
}

/** Return focus to the collapsed trigger after an explicit dismissal. */
function close() {
  clearTimeout(timer);
  trigger.value?.focus();
  open.value = false;
}

/** Cancel pending hover before toggling from a click or touch. */
function toggle() {
  clearTimeout(timer);
  open.value = !open.value;
}

/** Navigate through the public version choice without exposing option internals. */
function changeVersion(event: Event) {
  if (event.target instanceof HTMLSelectElement) emit('version', event.target.value);
}

/** Dismiss the controls when touch reading resumes outside the panel. */
function outsidePointer(event: PointerEvent) {
  if (open.value && event.target instanceof Node && !container.value?.contains(event.target)) {
    clearTimeout(timer);
    open.value = false;
  }
}

onMounted(() => document.addEventListener('pointerdown', outsidePointer));
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('pointerdown', outsidePointer);
});
</script>
