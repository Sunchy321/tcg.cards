<template>
    <q-btn :loading="loading" @click="click" />
</template>

<script setup lang="ts" generic="T">
import { ref } from 'vue';

const props = defineProps<{
    remote:  () => Promise<T>;
    resolve: (value: T) => void;
}>();

const loading = ref(false);

const click = async () => {
    loading.value = true;

    const data = await props.remote();

    loading.value = false;

    props.resolve(data);
};

</script>
