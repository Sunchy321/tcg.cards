<template>
  <aside
    ref="container"
    class="reader-outline fixed left-0 top-1/2 z-40 w-6 -translate-y-1/2 sm:w-12"
    :class="{ 'is-open': open }"
    :aria-label="$t('magic.document.outline')"
    @pointerenter="enter"
    @pointerleave="leave"
    @focusin="focusIn"
    @focusout="focusOut"
    @keydown.esc.prevent="close"
  >
    <button
      ref="trigger"
      type="button"
      class="outline-trigger flex min-h-44 w-6 flex-col items-center justify-center gap-4 text-muted focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-12"
      :aria-label="$t('magic.document.outline')"
      :aria-expanded="open"
      aria-controls="document-outline-content"
      @click="toggle"
    >
      <span class="flex w-5 flex-col gap-2" aria-hidden="true">
        <span v-for="(item, index) in items.slice(0, 7)" :key="item.nodeId" class="outline-mark h-px" :class="item.nodeId === chapterNodeId ? 'w-5 bg-primary' : index % 2 ? 'w-3 bg-current/30' : 'w-4 bg-current/30'" />
      </span>
      <span class="text-[0.65rem] tracking-widest [writing-mode:vertical-rl]">{{ $t('magic.document.outline') }}</span>
    </button>

    <nav
      id="document-outline-content"
      class="outline-content absolute left-0 top-1/2 w-80 -translate-y-1/2 py-12 pl-6 pr-12 sm:w-96 sm:pl-8 sm:pr-20"
      :inert="!open"
      :aria-hidden="!open"
      :aria-label="$t('magic.document.outline')"
    >
      <div class="mb-5 flex items-center justify-between text-xs text-muted">
        <span>{{ $t('magic.document.outline') }}</span>
        <button type="button" class="flex size-9 items-center justify-center hover:text-highlighted" :aria-label="$t('magic.document.hide_outline')" @click="close">
          <UIcon name="lucide:chevron-left" class="size-4" />
        </button>
      </div>
      <div class="max-h-[min(65dvh,42rem)] overflow-y-auto overscroll-contain pr-2 scrollbar-thin">
        <UTree
          v-model:expanded="expanded"
          :items="treeItems"
          :model-value="selected"
          :get-key="item => item.nodeId"
          :expanded-icon="null"
          :collapsed-icon="null"
          color="primary"
          size="sm"
          @select="(_, item) => select(item.nodeId)"
        >
          <template #item-wrapper="{ item, expanded: isExpanded, selected: isSelected, handleSelect, handleToggle, ui }">
            <div class="data-[reader-selected=true]:before:bg-primary/10" :class="ui.link({ selected: isSelected })" :data-reader-selected="isSelected">
              <button type="button" class="min-w-0 flex-1 py-1 text-left text-xs leading-relaxed" @click="handleSelect">{{ item.label }}</button>
              <button v-if="item.children?.length" type="button" class="ml-2 flex size-8 shrink-0 items-center justify-center text-dimmed" :aria-label="item.label" :aria-expanded="isExpanded" @click.stop="handleToggle">
                <UIcon name="lucide:chevron-right" class="size-3 transition-transform motion-reduce:transition-none" :class="{ 'rotate-90': isExpanded }" />
              </button>
            </div>
          </template>
        </UTree>
      </div>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import type { DocumentOutlineItem } from '#model/magic/schema/document-page';

/** Carries only the navigation text and stable node key required by the tree. */
interface TreeItem {
  label:     string;
  nodeId:    string;
  children?: TreeItem[];
}

const props = defineProps<{ items: DocumentOutlineItem[], nodeId: string, chapterNodeId: string }>();
const emit = defineEmits<{ select: [nodeId: string] }>();
const container = useTemplateRef('container');
const trigger = useTemplateRef('trigger');
const open = ref(false);
const expanded = ref<string[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Maps structural document nodes to the tree without adding reader metadata. */
function mapTree(items: DocumentOutlineItem[]): TreeItem[] {
  return items.map(item => ({
    label:  item.serial && !item.label.startsWith(item.serial) ? `${item.serial} ${item.label}` : item.label,
    nodeId: item.nodeId,
    ...(item.children?.length ? { children: mapTree(item.children) } : {}),
  }));
}

/** Returns the active item and all ancestors so nested links remain visible. */
function findPath(items: TreeItem[], nodeId: string): TreeItem[] {
  for (const item of items) {
    if (item.nodeId === nodeId) return [item];
    const child = findPath(item.children ?? [], nodeId);
    if (child.length) return [item, ...child];
  }
  return [];
}

const treeItems = computed(() => mapTree(props.items));
const path = computed(() => findPath(treeItems.value, props.nodeId));
const selected = computed(() => path.value.at(-1));
watch(path, ancestors => {
  expanded.value = [...new Set([...expanded.value, ...ancestors.slice(0, -1).map(item => item.nodeId)])];
}, { immediate: true });

/** Expands on intentional pointer entry while touch uses the persistent toggle. */
function enter(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    open.value = true;
  }, 80);
}

/** Delays closing slightly so movement between the rail and directory is forgiving. */
function leave(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    open.value = false;
  }, 220);
}

/** Exposes navigation to keyboard users without changing touch toggle behavior. */
function focusIn(event: FocusEvent) {
  if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
    clearTimeout(timer);
    open.value = true;
  }
}

/** Collapses when keyboard navigation leaves the entire floating directory. */
function focusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !container.value?.contains(event.relatedTarget)) open.value = false;
}

/** Restores focus to the rail when dismissing with a button or Escape. */
function close() {
  clearTimeout(timer);
  trigger.value?.focus();
  open.value = false;
}

/** Cancels a pending hover expansion before applying the explicit touch or mouse toggle. */
function toggle() {
  clearTimeout(timer);
  open.value = !open.value;
}

/** Navigates to a rule and dismisses the directory on touch-sized screens. */
function select(nodeId: string) {
  emit('select', nodeId);
  if (window.matchMedia('(max-width: 639px), (hover: none)').matches) close();
}

/** Dismisses touch navigation when reading resumes outside the floating directory. */
function outsidePointer(event: PointerEvent) {
  if (!open.value || !(event.target instanceof Node) || container.value?.contains(event.target)) return;
  if (event.pointerType === 'touch' || window.matchMedia('(max-width: 639px), (hover: none)').matches) {
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

<style scoped>
.reader-outline.is-open {
  width: min(24rem, 100%);
}

.outline-trigger {
  transition: opacity 180ms ease;
}

.is-open .outline-trigger {
  opacity: 0;
  pointer-events: none;
}

.outline-content {
  max-width: 100vw;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-1rem) scale(0.96);
  transform-origin: left center;
  transition: opacity 180ms ease, transform 380ms cubic-bezier(0.22, 1.25, 0.36, 1), visibility 180ms;
}

/* The backdrop fades into the page instead of drawing a separate sidebar panel. */
.outline-content::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -3rem -3rem;
  background: linear-gradient(90deg, var(--reader-bg) 0%, var(--reader-bg) 60%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent, black 15%, black 85%, transparent);
  pointer-events: none;
}

.is-open .outline-content {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .outline-trigger,
  .outline-content {
    transition: none;
  }
}
</style>
