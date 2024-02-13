<template>
    <div v-ripple class="multi-toggle relative-position flex items-center" @click="toggle">
        <template v-if="props.total <= 10">
            <div
                v-for="i in props.total" :key="i - 1"
                class="dot"
                :class="{ selected: i - 1 === modelValue }"
            />
        </template>
        <template v-else>
            <div class="dot" />
            <div>{{ props.modelValue + 1 }}/{{ props.total }}</div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';

const props = defineProps<{
    modelValue: number;
    total: number;
}>();

const emit = defineEmits<{
    'update:modelValue': [newValue: number];
}>();

const modelValue = computed({
    get() { return props.modelValue; },
    set(newValue) { emit('update:modelValue', newValue); },
});

const toggle = () => {
    if (modelValue.value === props.total - 1) {
        modelValue.value = 0;
    } else {
        modelValue.value += 1;
    }
};

watch(() => props.total, () => {
    if (props.total === 0) {
        modelValue.value = 0;
        return;
    }

    if (modelValue.value >= props.total) {
        modelValue.value = props.total - 1;
    }
});

</script>

<style lang="sass">
.multi-toggle
    border-radius: 100px
    border: 1px $primary solid

    padding: 3px

.dot
    width: 10px
    height: 10px
    border-radius: 100px
    border: 1px $primary solid

    background-color: white

    margin-left: 3px
    margin-right: 3px

    &.selected
        background-color: $primary

</style>
