<template>
    <q-input v-model="model" :type="type">
        <template #append>
            <q-icon
                :name="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
            />
        </template>
    </q-input>
</template>

<script setup lang="ts">
import { QInputProps } from 'quasar';
import { computed, ref } from 'vue';

const model = defineModel<QInputProps['modelValue']>();

const showPassword = ref(false);

const type = computed(() => showPassword.value ? 'text' : 'password');

</script>
