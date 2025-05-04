<template>
    <div class="card-image">
        <div class="image" :class="{rotated: realRotate}">
            <q-img
                :src="imageUrl"
                :ratio="484/700"
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

// import { useYugioh } from 'src/stores/games/yugioh';

import { assetBase } from 'boot/server';

// const yugioh = useYugioh();

const props = withDefaults(defineProps<{
    cardId:   string;
    passcode: number;
    lang?:    string;
    set:      string;
    number:   string;
    layout:   string;
    rotate?:  boolean | null;
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
    return `${assetBase}/yugioh/card/image/ygopro/ja/${props.passcode}.jpg`;
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
    padding-bottom: calc(100% / (484/700))
    perspective: 1000px

.image
    position: absolute

    top: 0
    left: 0
    bottom: 0
    right: 0

    transition: transform 0.5s

    &.rotated
        transform: rotate(90deg) scale(calc(484/700))

.control
    position: absolute

    top: 50%
    right: 5%
    transform: translateY(-50%)

</style>
