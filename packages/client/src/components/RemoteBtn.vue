<template>
    <q-btn :loading="loading" :color="color" @click="click">
        <slot />
    </q-btn>
</template>

<script setup lang="ts" generic="T">
import { ref, computed } from 'vue';

const props = defineProps<{
    remote:  () => Promise<T>;
    resolve: (value: T) => void;
}>();

const loading = ref(false);

const status = ref<'success' | 'failed' | undefined>();

const color = computed(() => {
    if (status.value === 'success') return 'positive';
    if (status.value === 'failed') return 'negative';
    return undefined;
});

const click = async () => {
    loading.value = true;
    status.value = undefined;

    try {
        const data = await props.remote();

        loading.value = false;
        status.value = 'success';

        props.resolve(data);
    } catch (e) {
        loading.value = false;
        status.value = 'failed';

        throw e;
    }
};

const reset = () => {
    loading.value = false;
    status.value = undefined;
};

defineExpose({
    reset,
});

</script>
