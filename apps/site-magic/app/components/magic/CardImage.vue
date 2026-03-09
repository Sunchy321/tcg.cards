<template>
  <div class="card-image">
    <div
      class="image"
      :class="[
        `layout-${layout}`,
        `part-${realPart}`,
        { rotated: realRotate, turnable }
      ]"
    >
      <img
        class="front w-full"
        :src="imageUrls[0]"
        loading="lazy"
        @error="(e) => ((e.target as HTMLImageElement).src = '/magic/card-not-found.svg')"
      >

      <img
        v-if="imageUrls[1] != null"
        class="back w-full"
        :src="imageUrls[1]"
        loading="lazy"
        @error="(e) => ((e.target as HTMLImageElement).src = '/magic/card-not-found.svg')"
      >
    </div>

    <!-- Image status badge -->
    <div v-if="imageStatus === 'missing' || imageStatus === 'placeholder'" class="status-badge">
      {{ imageStatus }}
    </div>

    <div v-if="rotatable" class="control">
      <UButton
        class="rounded-full"
        color="neutral"
        variant="outline"
        icon="mdi:rotate-right"
        size="sm"
        square
        @click.prevent.stop="realRotate = !realRotate"
      />
    </div>

    <div v-if="turnable" class="control">
      <UButton
        class="rounded-full"
        color="neutral"
        variant="outline"
        icon="mdi:rotate-3d-variant"
        size="xl"
        square
        @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
      />
    </div>

    <div v-if="layout === 'flip'" class="control">
      <UButton
        class="rounded-full"
        color="neutral"
        variant="outline"
        icon="mdi:autorenew"
        size="xl"
        square
        @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
      />
    </div>

    <div v-if="layout === 'aftermath'" class="control">
      <UButton
        class="rounded-full"
        color="neutral"
        variant="outline"
        icon="mdi:rotate-right"
        size="xl"
        square
        @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Layout, FullImageType } from '#model/magic/schema/basic';
import type { ImageStatus } from '#model/magic/schema/print';

const { public: { assetBaseUrl } } = useRuntimeConfig();

const props = withDefaults(
  defineProps<{
    lang:          string;
    set:           string;
    number:        string;
    part?:         number;
    layout:        Layout;
    fullImageType: FullImageType;
    imageStatus?:  ImageStatus;
    rotate?:       boolean | null;
    refreshToken?: string;
  }>(),
  {
    part:         undefined,
    imageStatus:  undefined,
    rotate:       undefined,
    refreshToken: undefined,
  },
);

const emit = defineEmits<{
  'update:part':   [newPart: number];
  'update:rotate': [newRotate: boolean | null];
}>();

const innerPart = ref(0);
const innerRotate = ref<boolean | null>(null);

const realPart = computed({
  get() { return innerPart.value; },
  set(newValue: number) {
    innerPart.value = newValue;

    if (props.layout !== 'reversible_card') {
      emit('update:part', newValue);
    }
  },
});

const rotatable = computed(() => ['split', 'planar'].includes(props.layout));

const defaultRotate = computed(() => {
  if (rotatable.value) {
    return true;
  }

  if (props.layout === 'battle') {
    return realPart.value === 0;
  }

  return false;
});

const realRotate = computed({
  get() { return innerRotate.value ?? defaultRotate.value; },
  set(newValue: boolean | null) {
    innerRotate.value = newValue;
    emit('update:rotate', newValue);
  },
});

const turnable = computed(() => [
  'transform',
  'modal_dfc',
  'transform_token',
  'minigame',
  'reversible_card',
  'double_faced',
  'battle',
  'art_series',
].includes(props.layout));

const imageUrlValues = computed(() => {
  if (turnable.value) {
    return [
      `${assetBaseUrl}/magic/card/large/${props.set}/${props.lang}/${props.number}-0.${props.fullImageType}`,
      `${assetBaseUrl}/magic/card/large/${props.set}/${props.lang}/${props.number}-1.${props.fullImageType}`,
    ];
  } else if (['flip_token_top', 'flip_token_bottom'].includes(props.layout)) {
    return [
      `${assetBaseUrl}/magic/card/large/${props.set}/${props.lang}/${props.number.split('-')[0]}.${props.fullImageType}`,
    ];
  } else {
    return [
      `${assetBaseUrl}/magic/card/large/${props.set}/${props.lang}/${props.number}.${props.fullImageType}`,
    ];
  }
});

const imageUrls = computed(() => {
  if (props.refreshToken != null) {
    return imageUrlValues.value.map(v => v + '?' + props.refreshToken);
  } else {
    return imageUrlValues.value;
  }
});

watch(() => props.layout, () => { innerRotate.value = null; });

watch(() => props.part, () => {
  if (props.part != null) {
    innerPart.value = props.part;
  }
}, { immediate: true });

watch(() => props.rotate, () => {
  if (props.rotate != null) {
    innerRotate.value = props.rotate;
  }
}, { immediate: true });
</script>

<style lang="scss" scoped>
.card-image {
  position: relative;
  aspect-ratio: 745 / 1040;
  perspective: 1000px;
}

.image {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  transition: transform 0.5s;

  &.rotated {
    transform: rotate(90deg) scale(calc(745/1040));
  }

  &.layout-flip.part-1,
  &.layout-flip_token_bottom {
    transform: rotate(180deg);
  }

  &.layout-aftermath.part-1 {
    transform: rotate(-90deg) scale(calc(745/1040));
  }

  &.turnable {
    transform-style: preserve-3d;

    .front, .back {
      position: absolute;
      top: 0;
      left: 0;
      backface-visibility: hidden;
    }

    .front {
      transform: rotateY(0deg);
    }

    .back {
      transform: rotateY(180deg);
    }

    &.part-1 {
      transform: rotateY(-180deg);
    }
  }
}

.status-badge {
  position: absolute;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.65rem;
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.control {
  position: absolute;
  top: 50%;
  right: 5%;
  transform: translateY(-50%);
}
</style>
