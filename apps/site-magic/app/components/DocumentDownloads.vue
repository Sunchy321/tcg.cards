<template>
  <aside
    v-if="downloads.length"
    ref="container"
    class="fixed right-0 top-(--ui-header-height,4rem) z-45"
    :class="open ? 'w-56' : 'w-12'"
    :aria-label="$t('magic.document.download_original')"
    @pointerenter="enter"
    @pointerleave="leave"
    @focusin="focusIn"
    @focusout="focusOut"
    @keydown.esc.prevent="close"
  >
    <button
      ref="trigger"
      type="button"
      class="ml-auto flex size-12 items-center justify-center text-muted transition-opacity motion-reduce:transition-none"
      :class="{ 'pointer-events-none opacity-0': open }"
      :aria-label="$t('magic.document.download_original')"
      :aria-expanded="open"
      aria-controls="document-downloads"
      @click="toggle"
    >
      <UIcon name="lucide:download" class="size-4" />
    </button>
    <div
      id="document-downloads"
      class="absolute right-0 top-0 w-56 max-w-[100vw] rounded-l-xl bg-default/95 p-3 shadow-lg ring-1 ring-default transition-opacity motion-reduce:transition-none"
      :class="open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'"
      :inert="!open"
      :aria-hidden="!open"
    >
      <a
        v-for="file in downloads"
        :key="`${file.language}:${file.format}:${file.url}`"
        :href="file.url"
        target="_blank"
        rel="noopener noreferrer"
        download
        class="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-elevated focus-visible:outline-2"
        @click="close"
      >
        <span>{{ file.format.toUpperCase() }}</span>
        <span class="text-muted">{{ languageName(file.language) }}</span>
      </a>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { SourceFile } from '#model/magic/schema/document-content';

const props = defineProps<{ files: SourceFile[] }>();
const i18n = useI18n();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const downloads = computed(() => props.files.flatMap(file => {
  const url = file.storageKey != null
    ? `${assetBaseUrl.replace(/\/$/, '')}/${file.storageKey.split('/').map(encodeURIComponent).join('/')}`
    : file.sourceUrl;
  return url != null ? [{ ...file, url }] : [];
}));
const container = useTemplateRef('container');
const trigger = useTemplateRef('trigger');
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Displays source languages in the current interface language. */
function languageName(language: string) {
  return new Intl.DisplayNames([i18n.locale.value === 'zhs' ? 'zh-CN' : 'en'], { type: 'language' })
    .of(language === 'zhs' ? 'zh-Hans' : language);
}

/** Expands on intentional hover while touch keeps an explicit toggle. */
function enter(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    open.value = true;
  }, 80);
}

/** Allows the pointer to move from the trigger into the download list. */
function leave(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!container.value?.contains(document.activeElement)) open.value = false;
  }, 220);
}

/** Exposes the downloads when keyboard focus reaches the trigger. */
function focusIn(event: FocusEvent) {
  if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
    clearTimeout(timer);
    open.value = true;
  }
}

/** Collapses after focus leaves the download controls. */
function focusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !container.value?.contains(event.relatedTarget)) {
    clearTimeout(timer);
    open.value = false;
  }
}

/** Returns keyboard focus to the trigger after dismissing the list. */
function close() {
  clearTimeout(timer);
  trigger.value?.focus();
  open.value = false;
}

/** Cancels delayed hover before applying an explicit click or touch. */
function toggle() {
  clearTimeout(timer);
  open.value = !open.value;
}

/** Dismisses the downloads when reading resumes elsewhere. */
function outsidePointer(event: PointerEvent) {
  if (event.target instanceof Node && !container.value?.contains(event.target)) {
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
