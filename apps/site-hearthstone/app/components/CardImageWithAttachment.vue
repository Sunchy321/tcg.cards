<template>
  <div class="relative">
    <!-- Main card image. On hover/focus/tap it is raised above the attachment
         mini card so the overlapping attachment card does not block it. The
         region occupied by the attachment card is excluded from the main hover,
         so the attachment card stays reachable. -->
    <div
      class="relative"
      :class="{ 'z-50': mainFront }"
      role="img"
      tabindex="0"
      :aria-label="mainLabel"
      @pointerenter="mainHover.onPointerEnter"
      @pointermove="onMainPointerMove"
      @pointerleave="mainHover.onPointerLeave"
      @focus="mainHover.onFocus"
      @blur="mainHover.onBlur"
      @click="mainHover.onClick"
    >
      <CardImage
        class="pointer-events-none"
        :card-id="cardId"
        :version="version"
        :type="type"
        :src="src"
        :render-hash="renderHash"
        :variant="variant"
        :category="category"
        :loading="loading"
        :mechanics="mechanics"
      />
    </div>

    <!-- Attachment mini card, zoomable on hover/focus/tap -->
    <div
      v-if="attachment"
      ref="attachmentRef"
      class="absolute right-0 bottom-0 w-[45%] rounded-lg overflow-hidden z-40 cursor-default transition-transform duration-150"
      :class="{ 'scale-150': attachmentZoomed }"
      role="img"
      tabindex="0"
      :aria-label="attachmentAriaLabel"
      @pointerenter="attachmentHover.onPointerEnter"
      @pointerleave="attachmentHover.onPointerLeave"
      @focus="attachmentHover.onFocus"
      @blur="attachmentHover.onBlur"
      @click="attachmentHover.onClick"
    >
      <CardImage
        class="pointer-events-none"
        :card-id="attachment.cardId"
        :version="attachment.version"
        :type="attachment.type"
        :render-hash="attachment.renderHash"
        :variant="resolvedAttachmentVariant"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue';
import type { ImageCategory } from '#model/hearthstone/schema/data/image';
import { TAG_ID } from '#model/hearthstone/constant/tag';

/** Attachment card data overlaid on the base card image. */
interface AttachmentData {
  cardId:     string;
  renderHash: string | null;
  version:    number;
  type:       string;
  mechanics:  Record<string, boolean | number>;
  name:       string | null;
}

const props = withDefaults(defineProps<{
  cardId:          string;
  version:         number;
  type:            string;
  name?:           string;
  src?:            string | null;
  renderHash?:     string | null;
  variant?:        CardImageOption;
  category?:       ImageCategory;
  loading?:        'eager' | 'lazy';
  mechanics?:      Record<string, boolean | number>;
  attachment?:     AttachmentData | null;
  attachmentLabel?: string;
}>(), {
  name:            undefined,
  src:             null,
  renderHash:      null,
  variant:         'normal',
  category:        'base',
  loading:         'lazy',
  mechanics:       undefined,
  attachment:      null,
  attachmentLabel: undefined,
});

// Fall back to golden when the attachment card has no diamond/signature art of
// its own and the main variant asks for one; otherwise follow the main variant.
const resolvedAttachmentVariant = computed<CardImageOption>(() => {
  const mainVariant = props.variant;
  if (mainVariant === 'diamond' || mainVariant === 'signature') {
    const enumId = mainVariant === 'diamond' ? TAG_ID.HAS_DIAMOND : TAG_ID.HAS_SIGNATURE;
    const value = props.attachment?.mechanics[String(enumId)];
    const supported = value === true || (typeof value === 'number' && value !== 0);
    if (!supported) return 'golden';
  }
  return mainVariant;
});

const mainFront = ref(false);
const attachmentZoomed = ref(false);
const isCoarse = ref(false);
const attachmentRef = ref<HTMLElement | null>(null);

onMounted(() => {
  isCoarse.value = window.matchMedia('(pointer: coarse)').matches;
});

// Shared interaction model: hover and keyboard focus activate the state, tap
// toggles it on coarse pointers (touch devices have no hover). Activating the
// attachment card also clears the main-front state so it is not covered.
function hoverHandlers(state: Ref<boolean>, onActivate?: () => void) {
  return {
    onPointerEnter: () => { if (!isCoarse.value) { state.value = true; onActivate?.(); } },
    onPointerLeave: () => { if (!isCoarse.value) state.value = false; },
    onFocus:        () => { if (!isCoarse.value) { state.value = true; onActivate?.(); } },
    onBlur:         () => { if (!isCoarse.value) state.value = false; },
    onClick:        () => { if (isCoarse.value) state.value = !state.value; },
  };
}

const mainHover = hoverHandlers(mainFront);
const attachmentHover = hoverHandlers(attachmentZoomed, () => {
  mainFront.value = false;
});

// The main hover must not cover the attachment region. When the pointer moves
// into the attachment bounds, yield the front so the attachment can be hovered.
function onMainPointerMove(event: PointerEvent) {
  if (isCoarse.value) return;
  const el = attachmentRef.value;
  if (el == null) {
    mainFront.value = true;
    return;
  }
  const rect = el.getBoundingClientRect();
  const overAttachment =
    event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  mainFront.value = !overAttachment;
}

const mainLabel = computed(() => props.name ?? props.cardId);

const attachmentAriaLabel = computed(() =>
  props.attachmentLabel ?? props.attachment?.name ?? props.attachment?.cardId ?? '',
);
</script>
