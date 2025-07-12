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

const failed = ref(false);

const color = computed(() => failed.value ? 'red' : undefined);

const click = async () => {
    loading.value = true;
    failed.value = false;

    try {
        const data = await props.remote();

        loading.value = false;
        failed.value = false;

        props.resolve(data);
    } catch (e) {
        loading.value = false;
        failed.value = true;

        throw e;
    }
};

</script>
