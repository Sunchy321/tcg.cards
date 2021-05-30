<template>
    <div
        v-scroll-fire="visible = true"
        class="card-image"
    >
        <div
            class="image"
            :class="[
                `layout-${layout}`,
                `part-${realPart}`,
                { rotated: realRotate }
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

    &.layout-flip.part-1
        transform: rotate(180deg)

    &.layout-aftermath.part-1
        transform: rotate(-90deg) scale(calc(745/1040))

    &.layout-transform,
    &.layout-modal_dfc
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

<script lang="ts">
import { PropType, defineComponent, ref, computed, watch } from 'vue';

import { imageBase } from 'boot/backend';

export default defineComponent({
    props: {
        lang:   { type: String, default: null },
        set:    { type: String, default: null },
        number: { type: String, default: null },
        part:   { type: Number, default: null },
        layout: { type: String, default: null },
        rotate: { type: Boolean as PropType<boolean|null>, default: null },
    },

    emits: ['update:part', 'update:rotate'],

    setup(props, { emit }) {
        const visible = ref<boolean|null>(null);
        const innerPart = ref(0);
        const innerRotate = ref<boolean|null>(null);

        const realPart = computed({
            get() { return innerPart.value; },
            set(newValue: number) {
                innerPart.value = newValue;
                emit('update:part', newValue);
            },
        });

        const defaultRotate = computed(() => ['split', 'planar'].includes(props.layout));

        const realRotate = computed({
            get() { return innerRotate.value ?? defaultRotate.value; },
            set(newValue: boolean | null) {
                innerRotate.value = newValue;
                emit('update:rotate', newValue);
            },
        });

        const rotatable = computed(() => ['split', 'planar'].includes(props.layout));

        const turnable = computed(() => ['transform', 'modal_dfc'].includes(props.layout));

        const imageUrls = computed(() => {
            switch (props.layout) {
            case 'transform':
            case 'modal_dfc':
            case 'art_series':
                return [
                    `http://${imageBase}/magic/card?auto-locale&lang=${props.lang}&set=${props.set}&number=${props.number}&part=0`,
                    `http://${imageBase}/magic/card?auto-locale&lang=${props.lang}&set=${props.set}&number=${props.number}&part=1`,
                ];
            default:
                return [
                    `http://${imageBase}/magic/card?auto-locale&lang=${props.lang}&set=${props.set}&number=${props.number}`,
                ];
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

        return {
            visible, realPart, realRotate, rotatable, turnable, imageUrls,
        };
    },
});
</script>
