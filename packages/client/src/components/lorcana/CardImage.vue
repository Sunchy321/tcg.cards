<template>
    <div class="card-image">
        <div class="image" :class="{rotated: realRotate}">
            <q-img
                :src="imageUrl"
                :ratio="367/512"
                native-context-menu
            />
        </div>

        <q-btn
            v-if="rotatable"
            class="control"
            color="white"
            outline dense round
            icon="mdi-rotate-right"
            @click.prevent.stop="realRotate = !realRotate"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useGame } from 'src/stores/games/lorcana';

import { assetBase } from 'boot/server';

const game = useGame();

const props = withDefaults(defineProps<{
    lang?:   string;
    set:     string;
    number:  string;
    layout:  string;
    rotate?: boolean | null;
}>(), {
    lang:   undefined,
    rotate: null,
});

const emit = defineEmits<{
    'update:rotate': [rotate: boolean | null];
}>();

const innerRotate = ref<boolean | null>(null);

const rotatable = computed(() => ['location'].includes(props.layout));

const defaultRotate = computed(() => {
    if (rotatable.value) {
        return true;
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

const imageUrl = computed(() => {
    const {
        lang = game.locale, set, number,
    } = props;

    return `${assetBase}/lorcana/card/image/${set}/${lang}/${number}.jpg`;
});

watch(() => props.layout, () => { innerRotate.value = null; });

watch(() => props.rotate, () => {
    if (props.rotate != null) {
        innerRotate.value = props.rotate;
    }
}, { immediate: true });

</script>

<style lang="sass" scoped>
.card-image
    position: relative
    padding-bottom: calc(100% / (367/512))
    perspective: 1000px

.image
    position: absolute

    top: 0
    left: 0
    bottom: 0
    right: 0

    transition: transform 0.5s

    &.rotated
        transform: rotate(90deg) scale(calc(367/512))

.control
    position: absolute

    top: 50%
    right: 5%
    transform: translateY(-50%)

</style>
