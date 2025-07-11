<template>
    <div
        v-scroll-fire="() => visible = true"
        class="card-image"
    >
        <div
            class="image"
            :class="[
                `layout-${layout}`,
                `part-${realPart}`,
                { rotated: realRotate, turnable }
            ]"
        >
            <q-img
                v-if="visible"
                class="front"
                :src="imageUrls[0]"
                :ratio="745/1040"
                native-context-menu
            >
                <template #error>
                    <div class="not-found">
                        <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                    </div>
                </template>
            </q-img>

            <q-img
                v-if="imageUrls[1] != null"
                class="back"
                :src="imageUrls[1]"
                :ratio="745/1040"
                native-context-menu
            >
                <template #error>
                    <div class="not-found">
                        <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                    </div>
                </template>
            </q-img>
        </div>

        <q-btn
            v-if="rotatable"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-right"
            @click.prevent.stop="realRotate = !realRotate"
        />

        <q-btn
            v-if="turnable"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-3d-variant"
            @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
        />

        <q-btn
            v-if="layout === 'flip'"
            class="control"
            color="white"
            outline dense round
            icon="mdi-autorenew"
            @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
        />

        <q-btn
            v-if="layout === 'aftermath'"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-right"
            @click.prevent.stop="realPart = realPart === 1 ? 0 : 1"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { assetBase } from 'boot/server';

const props = withDefaults(
    defineProps<{
        lang?:         string;
        set?:          string;
        number?:       string;
        part?:         number;
        layout?:       string;
        rotate?:       boolean | null;
        refreshToken?: string;
    }>(),
    {
        lang:         undefined,
        set:          undefined,
        number:       undefined,
        part:         undefined,
        layout:       undefined,
        rotate:       undefined,
        refreshToken: undefined,
    },
);

const emit = defineEmits<{
    'update:part':   [newPart: number];
    'update:rotate': [newRotate: boolean | null];
}>();

const visible = ref<boolean | null>(null);
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
            `${assetBase}/magic/card/large/${props.set}/${props.lang}/${props.number}-0.jpg`,
            `${assetBase}/magic/card/large/${props.set}/${props.lang}/${props.number}-1.jpg`,
        ];
    } else if (['flip_token_top', 'flip_token_bottom'].includes(props.layout)) {
        return [
            `${assetBase}/magic/card/large/${props.set}/${props.lang}/${props.number.split('-')[0]}.jpg`,
        ];
    } else {
        return [
            `${assetBase}/magic/card/large/${props.set}/${props.lang}/${props.number}.jpg`,
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

<style lang="sass" scoped>
.card-image
    position: relative
    padding-bottom: calc(100% / (745/1040))
    perspective: 1000px

.image
    position: absolute

    top: 0
    left: 0
    bottom: 0
    right: 0

    transition: transform 0.5s

    &.rotated
        transform: rotate(90deg) scale(calc(745/1040))

    &.layout-flip.part-1, &.layout-flip_token_bottom
        transform: rotate(180deg)

    &.layout-aftermath.part-1
        transform: rotate(-90deg) scale(calc(745/1040))

    &.turnable
        transform-style: preserve-3d

        & .front, & .back
            position: absolute
            top: 0
            left: 0

            backface-visibility: hidden

        & .front
            transform: rotateY(0deg)

        & .back
            transform: rotateY(180deg)

        &.part-1
            transform: rotateY(-180deg)

.not-found
    width: 100%
    background-color: transparent !important
    padding: 0 !important

.control
    position: absolute

    top: 50%
    right: 5%
    transform: translateY(-50%)

</style>
