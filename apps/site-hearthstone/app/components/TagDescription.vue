<template>
  <div>
    <p
      :id="descriptionId"
      ref="paragraph"
      class="leading-relaxed wrap-anywhere whitespace-pre-line"
      :class="{ 'line-clamp-3': !expanded }"
    >
      {{ text }}
    </p>
    <UButton
      v-if="expandable || expanded"
      type="button"
      color="primary"
      variant="link"
      size="sm"
      class="min-h-8 px-0 font-medium text-(--color-hs-chip-text)"
      :aria-controls="descriptionId"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ $t(expanded ? 'hearthstone.tagCatalog.collapse' : 'hearthstone.tagCatalog.expand') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
const { text } = defineProps<{ text: string }>();

const descriptionId = useId();
const paragraph = useTemplateRef('paragraph');
const expanded = ref(false);
const expandable = ref(false);

let observer: ResizeObserver | undefined;

/** Measures the visible description before offering an expand action. */
function measure() {
  const element = paragraph.value;
  if (element != null && !expanded.value) {
    expandable.value = element.scrollHeight > element.clientHeight + 1;
  }
}

onMounted(() => {
  if (paragraph.value != null) {
    observer = new ResizeObserver(measure);
    observer.observe(paragraph.value);
  }
});

onBeforeUnmount(() => observer?.disconnect());

watch(() => text, () => {
  expanded.value = false;
  void nextTick(measure);
});

watch(expanded, measure, { flush: 'post' });
</script>
